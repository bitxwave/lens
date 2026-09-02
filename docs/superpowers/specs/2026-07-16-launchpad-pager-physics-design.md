# Launchpad Pager Physics — Design

**Status**: Draft 2026-07-16
**Scope**: Replace the current hand-rolled `easeOutCubic` + three-flag
gesture arbitration in `+page.svelte` with a proper three-layer
architecture (physics / store / component) so the horizontal pager's
animation curve, gesture semantics, and edge damping all match macOS
Launchpad behavior.

The current implementation drifted from Launchpad in nine identifiable
ways (curve shape, duration, velocity→duration relationship, mid-
animation attribute toggles, displacement/velocity thresholds, single-
page limit on pointer flicks, tri-flag arbitration, wheel idle window,
and gesture/wheel path divergence). This spec addresses all nine at
their common root: the current code arbitrates three input sources
against one output through ad-hoc flags because there is no shared
state model. We introduce one.

The previous Launchpad foundation is in
[2026-05-21-launchpad-unify-design.md](2026-05-21-launchpad-unify-design.md).
This spec is a physics-layer rewrite of the pager only — no data model,
no API surface, no drag-merge behavior changes.

This document is the design contract. The implementation plan and tasks
are produced separately by `writing-plans`.

---

## 1. Goals

1. Horizontal page switching (wheel, pointer drag, keyboard ←/→, dot
   click, dragGrid edge-pan, `ItemEditDialog.onCreated`) all animate
   along a **single spring curve** with identical parameters.
2. Gesture release velocity feeds directly into that spring as
   `initialVelocity`, so a fast flick continues its motion into the
   settle without a perceptible seam.
3. Multi-page flicks work in both wheel and pointer paths (currently
   only wheel does, via commit-as-you-go). Both paths use the same
   `round(position + velocity · projectionMs)` projection rule.
4. Edge damping uses the iOS rubber-band formula only when `position`
   crosses `[0, pageCount-1]`; interior tracking is 1:1, matching
   Launchpad behavior.
5. Visual properties (`backdrop-filter`, `box-shadow`) do not toggle
   mid-gesture. Compositor stability comes from `will-change: transform`
   and the fact that `translate3d` doesn't invalidate filters, not from
   destroying and reapplying them.
6. The physics module is pure functions with no DOM dependency, unit
   testable in isolation.
7. The store is the single source of truth for pager position. There is
   no separate `currentPage` integer store — `currentPage` is a
   derived value.

## 2. Non-goals

- Visual redesign of the dots indicator (that's a separate spec if we
  want it).
- Card grid layout (`cols`/`rows`/`pageSize` derivation) — untouched.
- Drag-merge / jiggle mode / dragGrid semantics — untouched. Only the
  pager physics is rewritten.
- Vertical page scroll or two-axis pager — still horizontal-only.
- Reduced-motion support — deferred; the spring's rest-to-rest duration
  (~550 ms) is already gentle enough for a first cut. Follow-up spec if
  users request it.

## 3. User-facing behavior

### 3.1 Curve

Single page turn (rest → rest, e.g. keyboard →): critically-damped
spring, `stiffness = 100`, `damping = 20` (ζ = 1.0, ω ≈ 10 rad/s),
99% convergence in ≈ 550 ms. Position asymptotically approaches the
target; there is no visible "final frame" stop. This matches macOS
Launchpad page-turn timing (source: frame-stepping High Sierra / Big
Sur Launchpad recordings).

Gesture release: same spring, but `initialVelocity` is seeded with the
gesture's exit velocity. A fast flick "continues" past the release
point before decelerating; a slow drag settles from rest. There is no
`velFactor` duration shortening — velocity affects the curve shape via
the spring's initial condition, not via a scaled duration.

### 3.2 Settle decision

At gesture release (pointer-up or wheel-idle), the target page is:

```
target = clamp(round(position + velocity · 0.3), 0, pageCount - 1)
```

Where `position` is the float page index at release and `velocity` is
in pages/second. This is iOS UIScrollView's `decelerationRate = normal`
equivalent (300 ms projection window). Both pointer and wheel paths use
this rule — no more "wheel commits mid-gesture, pointer commits at
end".

### 3.3 Edge behavior

Interior (`0 ≤ position ≤ pageCount - 1`): 1:1 tracking of gesture
input. No damping.

Exterior: `displacement = w · over / (over + w / 0.55)` (iOS rubber-band
formula, `RUBBER_BAND_RESISTANCE = 0.55`). Guarantees `displacement <
over`, asymptote at one page width beyond the last page.

On gesture release beyond the edges, the spring pulls `position` back
into `[0, pageCount - 1]` unconditionally (target is always clamped).

### 3.4 Input coverage

| Input | Effect |
|---|---|
| Wheel (trackpad horizontal, shift+wheel, vertical fallback) | `gesture` mode, `position` accumulates delta; wheel-idle (180 ms) triggers `endDrag` |
| Pointer (touch, pen, primary mouse) | `gesture` mode after 8 px displacement threshold; `pointerup`/`pointercancel` triggers `endDrag` |
| Keyboard ←/→ / PageUp / PageDown | `gotoPage(current ± 1)` |
| PageDots click | `gotoPage(idx)` |
| dragGrid `onEdgePan` | `gotoPage(current ± 1)` |
| `ItemEditDialog.onCreated` | `gotoPage(pageCount - 1)` |
| Site switch (`currentSite` change) | `reset()` (force jump to page 0) |
| `pageCount` shrink | `setPageCount(n)`, clamps target if needed |

All non-gesture inputs route through `gotoPage()` → `spring` mode with
current `velocity` preserved (or 0 if starting from `idle`). One curve,
one entry point.

### 3.5 Removed behaviors

- The mid-gesture `class:is-scrolling` no longer disables
  `backdrop-filter` or `box-shadow`. Cards keep their halos throughout.
- No `commit-as-you-go` mid-gesture page turns. The float `position`
  runs freely during the gesture; the settle projection determines the
  final page at release.
- No `queueMicrotask` arbitration between external `currentPage`
  changes and gesture state.

## 4. Architecture

### 4.1 Three layers

```
+page.svelte (DOM / event source / render sink)
     │
     ▼
src/lib/stores/pagerStore.ts (factory + rAF + Svelte store)
     │
     ▼
src/lib/util/pagerPhysics.ts (pure functions, zero side effects)
```

### 4.2 `pagerPhysics.ts` — pure

```typescript
export interface PagerState {
  position: number;   // float page index (0.37 = 37% between page 0 and 1)
  velocity: number;   // pages / second
  mode: 'idle' | 'gesture' | 'spring';
  target: number;     // integer page, only meaningful in 'spring' mode
}

export interface SpringParams {
  stiffness: number;  // k
  damping: number;    // c
}

export interface PagerConfig {
  spring: SpringParams;
  projectionMs: number;
  wheelIdleMs: number;
  rubberBandResistance: number;
  restEpsilon: { position: number; velocity: number };
}

export const LAUNCHPAD_DEFAULTS: PagerConfig = {
  spring:               { stiffness: 100, damping: 20 },
  projectionMs:         300,
  wheelIdleMs:          180,
  rubberBandResistance: 0.55,
  restEpsilon:          { position: 0.001, velocity: 0.001 }
};

// One integration step of a critically-damped spring toward `target`.
// Uses semi-implicit Euler for numerical stability at dt=16ms.
export function stepSpring(
  state: Pick<PagerState, 'position' | 'velocity'>,
  target: number,
  dt: number,
  params: SpringParams
): { position: number; velocity: number };

// Projected page after applying `velocity` for `projectionMs`.
// Clamps to [0, pageCount - 1].
export function projectSettleTarget(
  position: number,
  velocity: number,
  pageCount: number,
  projectionMs: number
): number;

// iOS rubber-band displacement:  w · over / (over + w / resistance)
// `over` >= 0, returns >= 0 and < w.
export function rubberBand(
  over: number,
  w: number,
  resistance: number
): number;

// Apply rubber-band clamping to `position` given `pageCount`. Interior:
// returns position unchanged. Exterior: pulls toward the edge with
// asymptotic damping.
export function clampWithRubberBand(
  position: number,
  pageCount: number,
  resistance: number
): number;

// Convenience: are we at rest for spring termination?
export function isAtRest(
  state: Pick<PagerState, 'position' | 'velocity'>,
  target: number,
  eps: { position: number; velocity: number }
): boolean;
```

**No `pagerWidth` parameter anywhere.** All physics is in page units.
The DOM boundary in `+page.svelte` converts px ↔ pages once per event.

### 4.3 `pagerStore.ts` — factory

```typescript
export interface PagerSnapshot {
  position: number;
  currentPage: number;    // Math.round(clamp(position, 0, pageCount-1))
  velocity: number;
  mode: PagerState['mode'];
  isMoving: boolean;      // mode !== 'idle'
}

export interface PagerStore {
  subscribe(fn: (s: PagerSnapshot) => void): () => void;
  beginDrag(): void;                     // captures current position as gesture start
  drag(deltaPages: number): void;        // absolute delta from gesture start, in pages
  endDrag(velocityPagesPerSec: number): void;
  wheel(deltaPages: number): void;       // incremental (accumulates internally)
                                         // resets internal idle timer
  gotoPage(idx: number): void;           // clamped to [0, pageCount-1]
  setPageCount(n: number): void;
  reset(): void;                         // jump to page 0, no animation
  destroy(): void;                       // cancel rAF, clear timers
}

export function createPager(opts?: {
  config?: Partial<PagerConfig>;
  initialPageCount?: number;
}): PagerStore;

export const pager: PagerStore = createPager();
```

Internal state machine:

- `idle`: rAF suspended, velocity = 0.
- `gesture`: rAF suspended; `position` written by `drag()` /
  `wheel()`; `clampWithRubberBand` applied on write.
- `spring`: rAF running; each frame `stepSpring(state, state.target,
  dt, config.spring)`; transitions to `idle` when `isAtRest`.

Transitions:

| From → To | Trigger |
|---|---|
| idle → gesture | `beginDrag()`, first `wheel()` after idle |
| gesture → spring | `endDrag(v)`, wheel-idle timer fires |
| idle → spring | `gotoPage(idx)`, `setPageCount(n)` (if position out of range), external command while mode was idle |
| spring → spring | `gotoPage(idx)` mid-spring (target changes, velocity retained) |
| spring → idle | `isAtRest` and `position === target` |
| gesture → idle | `reset()` (site switch) |
| spring → gesture | user starts a new gesture mid-animation |
| \* → idle | `destroy()` |

**Handshake at gesture → spring**: `state.velocity` is seeded from the
`endDrag(v)` argument (or the sampled wheel velocity). `state.target`
is set to `projectSettleTarget(state.position, state.velocity,
pageCount, projectionMs)`. rAF starts if not already running.

**Handshake at spring → spring**: `state.target` is overwritten,
`state.velocity` is retained. rAF continues.

**External command during gesture**: `gotoPage()` during `mode ===
'gesture'` is ignored — the user's finger owns `position` until
release, at which point `endDrag` runs the projection and picks the
target itself. `setPageCount()` during gesture updates the internal
`pageCount` for `endDrag`'s clamp step but does not touch `position` or
`target` mid-gesture.

### 4.4 `+page.svelte` — DOM boundary

Retained responsibilities:
- Measure `pagerWidth` / `pagerHeight` via ResizeObserver.
- Convert event coordinates to pages: `px / pagerWidth`.
- Sample gesture velocity (rolling 3-frame average).
- Enforce the 8 px pointer-pan threshold before capturing.
- Route `wheel` / `pointerdown/move/up/cancel` to store methods.
- Route keyboard `ArrowLeft/Right/PageUp/Down` to `pager.gotoPage`.
- Route `PageDots.onSelect` to `pager.gotoPage`.
- Route `dragGrid.onEdgePan` to `pager.gotoPage`.
- Route `ItemEditDialog.onCreated` to `pager.gotoPage(pageCount - 1)`.
- Route site change effect to `pager.reset()`.
- Route `pageCount` change effect to `pager.setPageCount(n)`.
- Bind `transform: translate3d(-$pager.position * pagerWidth, 0, 0)` on
  the `.track` element.
- Bind `class:is-scrolling={$pager.isMoving}` on `.canvas` for any
  future consumers (no visual rules attached in this spec).

Removed responsibilities: `offsetX` state, `animating` /
`dragActive` / `wheelGestureActive` flags, `animateToPage`,
`settleGesture`, `clampOffset`, `rubberBand`, `easeOutCubic`,
`queueMicrotask` arbitration, the two synchronization `$effect`s.

Net change: pager region drops from ~400 lines to ~200.

### 4.5 File-level changes

| File | Action |
|---|---|
| `src/lib/util/pagerPhysics.ts` | **New** — pure physics functions + `LAUNCHPAD_DEFAULTS` |
| `src/lib/util/pagerPhysics.test.ts` | **New** — 10 unit tests |
| `src/lib/stores/pagerStore.ts` | **New** — factory, rAF loop, wheel idle timer |
| `src/lib/stores/pagerStore.test.ts` | **New** — 10 integration tests using `vi.useFakeTimers()` |
| `src/lib/stores/pageStore.ts` | **Delete** |
| `src/routes/+page.svelte` | **Modify** — pager region rewritten; remove `.is-scrolling` visual rules |
| `src/lib/components/Nav/PageDots.svelte` | **Modify** — read `$pager.currentPage`, call `pager.gotoPage` |

## 5. i18n keys

None. This spec has no user-facing string changes.

## 6. Verification checklist

### 6.1 Automated (Vitest)

**`pagerPhysics.test.ts`**:

1. `stepSpring({pos:1, vel:0}, target=2, dt=0.016, {k:100,c:20})` — position moves toward target (positive delta), velocity becomes positive.
2. `stepSpring({pos:2, vel:0}, target=2, ...)` — no movement (at rest).
3. `projectSettleTarget(pos=0.4, vel=0, count=3, proj=300)` → 0 (no fling, rounds down).
4. `projectSettleTarget(pos=0.4, vel=1.5, count=3, proj=300)` → 1 (projection 0.85 rounds to 1).
5. `projectSettleTarget(pos=0.4, vel=-1.5, count=3, proj=300)` → 0 (reverse fling clamps at 0).
6. `projectSettleTarget(pos=2.5, vel=10, count=3, proj=300)` → 2 (clamps to last page).
7. `rubberBand(0, 1000, 0.55)` → 0.
8. `rubberBand(50, 1000, 0.55)` — result strictly less than 50 (real damping).
9. `rubberBand(10_000, 1000, 0.55)` — result approaches but does not exceed 1000 (asymptotic).
10. Running `stepSpring` in a loop from `{pos:0, vel:0}` toward `target=1` converges without overshooting past 1 (critically damped).

**`pagerStore.test.ts`** (uses `vi.useFakeTimers()`, mocks `requestAnimationFrame`):

1. Initial snapshot: `position=0, currentPage=0, mode='idle', velocity=0`.
2. `beginDrag()` + `drag(0.15)` + `endDrag(0)` + advance timers to rest → `currentPage=0` (below projection threshold, rubber-back).
3. `beginDrag()` + `drag(0.4)` + `endDrag(1.0)` + advance to rest → `currentPage=1` (projection 0.7 → 1).
4. `beginDrag()` + `drag(-0.3)` — `position < 0` and `|position| < 0.3` (rubber-band active during gesture).
5. `wheel(0.1)` × 3 + advance timer by 200 ms (past `wheelIdleMs=180`) → spring engaged, target set.
6. `gotoPage(2)` from idle → `mode='spring'`, `target=2`, `velocity=0`; advance to rest → `currentPage=2`.
7. `beginDrag()` + `gotoPage(2)` — ignored (`mode` remains `'gesture'`); `endDrag(0)` still runs projection.
8. `setPageCount(5)` then `gotoPage(4)` + advance to rest; `setPageCount(2)` — target auto-clamps to 1, spring pulls back.
9. `gotoPage(2)` → mid-flight `gotoPage(4)` — target updates, velocity retained, no mode reset.
10. `destroy()` — subsequent `beginDrag()` is a no-op; rAF frame count doesn't increase.

### 6.2 Manual (in dev server on real machine)

- [ ] Trackpad soft push (short displacement, low velocity) → single-page turn with visibly slow / gentle settle.
- [ ] Trackpad hard flick → multiple pages jumped, no rebound past the last one, no visible overshoot.
- [ ] Touchscreen (or `Pointer Events` DevTools emulation): drag 40% of viewport width and lift → single-page turn.
- [ ] Touchscreen fast flick → multi-page.
- [ ] Rapid keyboard `→ → →` (500 ms apart) → each triggers a spring toward the next target, velocity accumulates smoothly, no "restart" jitter.
- [ ] Click a `PageDots` far target (page 0 → page 3) → smooth spring across, no `easeOutCubic` "wall stop" at the end.
- [ ] Drag left on page 0 → rubber-band resists, position doesn't exceed one page width past origin, releasing snaps back with slight overshoot-free settle.
- [ ] Drag right on last page → symmetric to previous.
- [ ] Resize window during rest → `position` snaps to `currentPage * pagerWidth` without visible jump.
- [ ] Switch site (in multi-site mode) → immediate jump to page 0 (existing `reset()` semantic preserved).
- [ ] Card halos (`backdrop-filter` on folders, `box-shadow` on all cards) remain visible throughout gestures. If Chrome DevTools frame-rate meter shows sustained <55 fps on a mid-range MacBook, fall back to `filter: drop-shadow` + `contain: paint` (documented in Q8 alternatives) before shipping.
- [ ] Cross-boundary hand-off: while spring is animating (e.g. from a `gotoPage(3)` call), start a pointer drag — motion becomes 1:1 tracking immediately, no "wait for spring to finish" delay.

### 6.3 Static (spec-implementation-auditor)

Auditor should verify every acceptance point in §6 has a matching file:line in the diff, and every file in §4.5's action table appears in the diff.

## 7. Risks and open questions

1. **`stepSpring` numerical stability at variable dt**: If `dt` spikes past 32 ms (e.g. tab regain focus), semi-implicit Euler can slightly overshoot even for critically damped systems. Mitigation: clamp `dt` to 32 ms in the store's rAF loop before passing to `stepSpring`.
2. **Wheel-idle detection edge case**: macOS trackpad inertial streams can have 100–150 ms gaps mid-stream. `wheelIdleMs=180` should cover most, but if we see mid-flick "false settles", we can widen to 220 ms. This is a config value, not an architectural risk.
3. **Interaction with `dragGrid` during jiggle mode**: When `$jiggleMode === true`, pointer-down on `.pager` is guarded (returns early), so pager gesture doesn't fight card drag. This behavior is preserved from the current implementation.
4. **Reduced motion**: Out of scope. If needed later, `LAUNCHPAD_DEFAULTS` can be swapped for `{ stiffness: 300, damping: 40 }` (faster convergence, minimal visible motion) when `prefers-reduced-motion` is set. Non-breaking change.
5. **Test flakiness on rAF mocking**: `vi.useFakeTimers()` doesn't mock `requestAnimationFrame` by default. Store tests must install `vi.stubGlobal('requestAnimationFrame', ...)` or the equivalent Vitest helper. Standard pattern — no architectural concern.

## 8. Files touched (scope discipline)

Only these paths may be modified. Any diff outside this list is a scope
violation:

- `src/lib/util/pagerPhysics.ts` (new)
- `src/lib/util/pagerPhysics.test.ts` (new)
- `src/lib/stores/pagerStore.ts` (new)
- `src/lib/stores/pagerStore.test.ts` (new)
- `src/lib/stores/pageStore.ts` (delete)
- `src/routes/+page.svelte` (modify — pager region and imports only)
- `src/lib/components/Nav/PageDots.svelte` (modify — store binding only)

No changes to `Card.svelte`, `dragGrid.ts`, `visible.ts`, `paginate.ts`,
or any component outside the paths above.
