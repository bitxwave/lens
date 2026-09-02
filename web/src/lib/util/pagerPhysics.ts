// Pure physics for the Launchpad-style pager. Zero side effects, zero
// DOM dependency. All inputs are in "page" units (position: float
// page index; velocity: pages per second). The DOM boundary in
// +page.svelte converts px ↔ pages once per event before calling into
// the store, so this module stays framework-agnostic and unit testable.
//
// Curve philosophy (see spec 2026-07-16-launchpad-pager-physics-design):
//   - Critically damped spring (ζ = 1.0), k=100, c=20 → ω=10 rad/s.
//   - 99% convergence in ~550ms from rest, matching frame-stepped
//     macOS Launchpad page turns.
//   - Gesture-release velocity feeds initialVelocity, so a flick
//     "continues" past release before decelerating.

export interface PagerState {
  /** Float page index. 0 = page 0 left edge, 1.37 = page 1 + 37%. */
  position: number;
  /** Pages / second. Positive = advancing forward. */
  velocity: number;
  /** State machine mode. */
  mode: 'idle' | 'gesture' | 'spring';
  /** Integer target page. Meaningful only in 'spring' mode. */
  target: number;
}

export interface SpringParams {
  stiffness: number;
  damping: number;
}

export interface PagerConfig {
  spring: SpringParams;
  /** Projection window for velocity → settle target, in ms. */
  projectionMs: number;
  /** Wheel-idle window: this much quiet time ends a wheel gesture. */
  wheelIdleMs: number;
  /** iOS rubber-band asymptote parameter (0..1). 0.55 is Apple's value. */
  rubberBandResistance: number;
  /** Spring termination thresholds (position in pages, velocity in pages/s). */
  restEpsilon: { position: number; velocity: number };
  /**
   * Displacement-based settle threshold (fraction of one page).
   * A low-velocity drag whose absolute displacement from the gesture's
   * starting integer page exceeds this fraction commits one page in the
   * drag direction, even when velocity-projection alone would round back
   * to the start. This is what makes a slow mouse drag feel like
   * Launchpad — you don't have to fling, dragging past ~30% is enough.
   * The final target is `max(velocityTarget, displacementTarget)` in the
   * drag's direction, so a fast flick's multi-page projection still wins.
   */
  displacementThreshold: number;
}

export const LAUNCHPAD_DEFAULTS: PagerConfig = {
  spring: { stiffness: 100, damping: 20 },
  projectionMs: 300,
  wheelIdleMs: 180,
  rubberBandResistance: 0.55,
  restEpsilon: { position: 0.001, velocity: 0.001 },
  displacementThreshold: 0.3
};

/**
 * One integration step of a critically-damped spring toward `target`.
 * Uses semi-implicit Euler for numerical stability at dt=16ms.
 *
 *   force = -k * (x - target) - c * v
 *   v'    = v + (force / m) * dt        (m = 1)
 *   x'    = x + v' * dt                 (semi-implicit: use v' not v)
 */
export function stepSpring(
  state: { position: number; velocity: number },
  target: number,
  dt: number,
  params: SpringParams
): { position: number; velocity: number } {
  const force = -params.stiffness * (state.position - target) - params.damping * state.velocity;
  const nextV = state.velocity + force * dt;
  const nextP = state.position + nextV * dt;
  return { position: nextP, velocity: nextV };
}

/**
 * Project the settle target. Combines two rules and picks whichever
 * lands further in the drag's direction:
 *
 *   1. VELOCITY projection: `round(position + velocity · projectionMs)`.
 *      This is UIScrollView's `decelerationRate = normal` equivalent
 *      (0.3s window). A fast flick projects past the next page — this
 *      is what powers multi-page trackpad flicks.
 *
 *   2. DISPLACEMENT threshold: if the drag's absolute displacement
 *      from `startPage` exceeds `displacementThreshold` (fraction of
 *      one page), commit one page in the drag direction. This handles
 *      the low-velocity mouse-drag case: user drags past ~30% and
 *      lifts — velocity is near zero, so rule 1 rounds back to start
 *      and the drag "fails". Rule 2 tips it over.
 *
 * When both rules apply, the target further in the drag direction
 * wins — a fast multi-page flick isn't shortened to +1 by rule 2.
 * When the drag's direction is ambiguous (position ≈ startPage),
 * rule 2 is a no-op.
 *
 * Result is clamped to `[0, pageCount - 1]`. If `startPage` is
 * omitted (external `gotoPage`-style call), only rule 1 applies —
 * the semantic matches the pre-displacement-threshold behavior.
 */
export function projectSettleTarget(
  position: number,
  velocity: number,
  pageCount: number,
  projectionMs: number,
  displacementThreshold?: number,
  startPage?: number
): number {
  const v = Number.isFinite(velocity) ? velocity : 0;
  const maxT = Math.max(0, pageCount - 1);
  const clamp = (n: number) => Math.max(0, Math.min(maxT, n));

  const velocityTarget = clamp(Math.round(position + v * (projectionMs / 1000)));

  if (
    displacementThreshold === undefined ||
    startPage === undefined ||
    !Number.isFinite(startPage)
  ) {
    return velocityTarget;
  }

  const displacement = position - startPage;
  const dir = Math.sign(displacement);
  if (dir === 0 || Math.abs(displacement) < displacementThreshold) {
    return velocityTarget;
  }
  const displacementTarget = clamp(startPage + dir);

  // Pick the target further in the drag direction. In pointer's
  // low-velocity case, velocityTarget ≈ startPage (round pulled back)
  // and displacementTarget = startPage + dir → displacementTarget wins.
  // In wheel's fast-flick case, velocityTarget may be startPage + 2 or
  // more → velocityTarget stays.
  if (dir > 0) return Math.max(velocityTarget, displacementTarget);
  return Math.min(velocityTarget, displacementTarget);
}

/**
 * iOS rubber-band displacement:
 *   displacement = w · over / (over + w / resistance)
 *
 * Guarantees:
 *   - displacement < over for over > 0 (real damping, never amplifies)
 *   - displacement → w as over → ∞ (asymptote at one unit width)
 *   - continuous at over = 0
 *
 * `over` must be >= 0; caller supplies the sign.
 */
export function rubberBand(over: number, w: number, resistance: number): number {
  if (over <= 0 || w <= 0) return 0;
  return (w * over) / (over + w / resistance);
}

/**
 * Clamp `position` to `[0, pageCount - 1]` with rubber-band damping
 * past the edges. Interior is identity (1:1 tracking, matches Launchpad).
 * The width unit is 1 page since we're already in page-space.
 */
export function clampWithRubberBand(
  position: number,
  pageCount: number,
  resistance: number
): number {
  const maxT = Math.max(0, pageCount - 1);
  if (position < 0) return -rubberBand(-position, 1, resistance);
  if (position > maxT) return maxT + rubberBand(position - maxT, 1, resistance);
  return position;
}

/** Spring termination: both position error and velocity below epsilon. */
export function isAtRest(
  state: { position: number; velocity: number },
  target: number,
  eps: { position: number; velocity: number }
): boolean {
  return (
    Math.abs(state.position - target) < eps.position && Math.abs(state.velocity) < eps.velocity
  );
}
