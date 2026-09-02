import { writable } from 'svelte/store';
import {
  LAUNCHPAD_DEFAULTS,
  clampWithRubberBand,
  isAtRest,
  projectSettleTarget,
  stepSpring,
  type PagerConfig,
  type PagerState
} from '../util/pagerPhysics';

/**
 * Snapshot: what the store publishes to subscribers.
 *
 * `position` is the float source of truth; `currentPage` is the derived
 * integer used by dot indicators / keyboard-target math. `isMoving`
 * powers optional per-frame visual cues (currently unused).
 */
export interface PagerSnapshot {
  position: number;
  currentPage: number;
  velocity: number;
  mode: PagerState['mode'];
  isMoving: boolean;
}

export interface PagerStore {
  subscribe(fn: (s: PagerSnapshot) => void): () => void;
  /** Latch current position as the gesture's anchor. Cancels any in-flight spring. */
  beginDrag(): void;
  /** Delta from the gesture's start position, in PAGES. */
  drag(deltaPagesFromStart: number): void;
  /** End pointer gesture; velocity in PAGES/SEC seeds the settle spring. */
  endDrag(velocityPagesPerSec: number): void;
  /**
   * Incremental wheel delta (PAGES). First delta implicitly starts a
   * gesture. A silence of `wheelIdleMs` ends it via the internal timer,
   * using velocity sampled from the last 3 deltas.
   */
  wheel(deltaPages: number): void;
  /** Spring to integer page `idx`. Ignored during pointer/wheel gesture. */
  gotoPage(idx: number): void;
  /** Update total page count. Clamps position/target if needed. */
  setPageCount(n: number): void;
  /** Hard reset: jump to page 0, no animation. */
  reset(): void;
  /** Tear down rAF and timers (component destroy). */
  destroy(): void;
}

interface CreatePagerOpts {
  config?: Partial<PagerConfig>;
  initialPageCount?: number;
}

/**
 * Factory. All physics constants come from `pagerPhysics.LAUNCHPAD_DEFAULTS`
 * unless overridden via `opts.config`.
 *
 * The state machine has three modes:
 *   idle:    rAF suspended, velocity = 0.
 *   gesture: rAF suspended; `position` written directly by drag/wheel
 *            with rubber-band clamping.
 *   spring:  rAF running; each frame steps `stepSpring` toward `target`;
 *            transitions to idle when `isAtRest`.
 */
export function createPager(opts?: CreatePagerOpts): PagerStore {
  const config: PagerConfig = {
    ...LAUNCHPAD_DEFAULTS,
    ...(opts?.config ?? {}),
    spring: { ...LAUNCHPAD_DEFAULTS.spring, ...(opts?.config?.spring ?? {}) },
    restEpsilon: { ...LAUNCHPAD_DEFAULTS.restEpsilon, ...(opts?.config?.restEpsilon ?? {}) }
  };

  let pageCount = Math.max(1, opts?.initialPageCount ?? 1);

  const state: PagerState = { position: 0, velocity: 0, mode: 'idle', target: 0 };

  const store = writable<PagerSnapshot>({
    position: 0,
    currentPage: 0,
    velocity: 0,
    mode: 'idle',
    isMoving: false
  });

  let rafId: number | null = null;
  let lastFrameTs = 0;
  let destroyed = false;

  // Pointer gesture bookkeeping (start-anchored absolute delta).
  let dragStartPos = 0;

  /**
   * Integer page the current gesture (pointer OR wheel) started from.
   * Used at settle time by `projectSettleTarget`'s displacement rule
   * so a slow drag past ~30% of a page commits one page even when the
   * velocity-only projection would round back. Set at `beginDrag()`
   * and at the first `wheel()` call that enters gesture mode.
   */
  let gestureStartPage = 0;

  // Wheel gesture bookkeeping: gestures accumulate incrementally via
  // `state.position + deltaPages`; velocity is sampled from a rolling window.
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  /** [ts_ms, deltaPages] sample window, last 3 entries. */
  let wheelSamples: Array<[number, number]> = [];

  function currentPageDerived(): number {
    const maxT = Math.max(0, pageCount - 1);
    const clamped = Math.max(0, Math.min(maxT, state.position));
    return Math.round(clamped);
  }

  function publish() {
    store.set({
      position: state.position,
      currentPage: currentPageDerived(),
      velocity: state.velocity,
      mode: state.mode,
      isMoving: state.mode !== 'idle'
    });
  }

  function startRaf() {
    if (destroyed) return;
    if (rafId !== null) return;
    lastFrameTs = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopRaf() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function frame(now: number) {
    // Clamp dt to a sane range so a tab regain (huge dt) can't yeet the
    // spring past its target.
    const dt = Math.min(0.032, Math.max(0.001, (now - lastFrameTs) / 1000));
    lastFrameTs = now;

    if (state.mode === 'spring') {
      const next = stepSpring(state, state.target, dt, config.spring);
      state.position = next.position;
      state.velocity = next.velocity;

      if (isAtRest(state, state.target, config.restEpsilon)) {
        state.position = state.target;
        state.velocity = 0;
        state.mode = 'idle';
        publish();
        rafId = null;
        return;
      }
    }
    publish();
    rafId = requestAnimationFrame(frame);
  }

  function sampleWheelVelocity(): number {
    if (wheelSamples.length < 2) return 0;
    const first = wheelSamples[0];
    const last = wheelSamples[wheelSamples.length - 1];
    const dtSec = (last[0] - first[0]) / 1000;
    if (dtSec <= 0) return 0;
    let sumDelta = 0;
    for (let i = 1; i < wheelSamples.length; i++) sumDelta += wheelSamples[i][1];
    return sumDelta / dtSec;
  }

  function endWheelGesture() {
    if (state.mode !== 'gesture') return;
    const velocity = sampleWheelVelocity();
    const target = projectSettleTarget(
      state.position,
      velocity,
      pageCount,
      config.projectionMs,
      config.displacementThreshold,
      gestureStartPage
    );
    state.velocity = velocity;
    state.target = target;
    state.mode = 'spring';
    wheelSamples = [];
    wheelIdleTimer = null;
    startRaf();
    publish();
  }

  return {
    subscribe: store.subscribe,

    beginDrag() {
      // Cancel any in-flight spring — the finger owns position now.
      stopRaf();
      if (wheelIdleTimer) {
        clearTimeout(wheelIdleTimer);
        wheelIdleTimer = null;
      }
      wheelSamples = [];
      dragStartPos = state.position;
      gestureStartPage = Math.round(state.position);
      state.mode = 'gesture';
      publish();
    },

    drag(deltaPagesFromStart: number) {
      if (state.mode !== 'gesture') return;
      const raw = dragStartPos + deltaPagesFromStart;
      state.position = clampWithRubberBand(raw, pageCount, config.rubberBandResistance);
      publish();
    },

    endDrag(velocityPagesPerSec: number) {
      if (state.mode !== 'gesture') return;
      const target = projectSettleTarget(
        state.position,
        velocityPagesPerSec,
        pageCount,
        config.projectionMs,
        config.displacementThreshold,
        gestureStartPage
      );
      state.velocity = velocityPagesPerSec;
      state.target = target;
      state.mode = 'spring';
      startRaf();
      publish();
    },

    wheel(deltaPages: number) {
      // Cancel any in-flight spring — user is re-engaging.
      if (state.mode === 'spring') {
        stopRaf();
      }
      if (state.mode !== 'gesture') {
        wheelSamples = [];
        gestureStartPage = Math.round(state.position);
        state.mode = 'gesture';
      }
      const now = performance.now();
      wheelSamples.push([now, deltaPages]);
      if (wheelSamples.length > 3) wheelSamples.shift();

      // Wheel deltas are RELATIVE — accumulate by adding deltaPages
      // directly to state.position; clampWithRubberBand handles bounds.
      const raw = state.position + deltaPages;
      state.position = clampWithRubberBand(raw, pageCount, config.rubberBandResistance);

      if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
      wheelIdleTimer = setTimeout(endWheelGesture, config.wheelIdleMs);

      publish();
    },

    gotoPage(idx: number) {
      // Reject NaN/Infinity so a bad caller can't poison state.target
      // into permanent NaN (would freeze the spring loop indefinitely).
      if (!Number.isFinite(idx)) return;
      // Q1 isolation: user's gesture owns position until release.
      if (state.mode === 'gesture') return;
      const maxT = Math.max(0, pageCount - 1);
      const target = Math.max(0, Math.min(maxT, Math.round(idx)));
      state.target = target;
      state.mode = 'spring';
      // velocity is retained (mid-spring gotoPage) or 0 (from idle).
      startRaf();
      publish();
    },

    setPageCount(n: number) {
      // Reject NaN/Infinity: Math.floor(NaN) is NaN and would poison
      // pageCount, breaking every derived clamp downstream.
      if (!Number.isFinite(n)) return;
      pageCount = Math.max(1, Math.floor(n));
      const maxT = Math.max(0, pageCount - 1);

      if (state.mode === 'gesture') {
        // Don't preempt the gesture; endDrag will clamp via projection.
        publish();
        return;
      }

      // Retarget if out of range.
      if (state.position > maxT || state.target > maxT || state.position < 0) {
        state.target = Math.max(0, Math.min(maxT, Math.round(state.position)));
        state.mode = 'spring';
        startRaf();
      }
      publish();
    },

    reset() {
      stopRaf();
      if (wheelIdleTimer) {
        clearTimeout(wheelIdleTimer);
        wheelIdleTimer = null;
      }
      wheelSamples = [];
      state.position = 0;
      state.velocity = 0;
      state.target = 0;
      state.mode = 'idle';
      publish();
    },

    destroy() {
      destroyed = true;
      stopRaf();
      if (wheelIdleTimer) {
        clearTimeout(wheelIdleTimer);
        wheelIdleTimer = null;
      }
      state.mode = 'idle';
    }
  };
}

/** Module-level singleton used by `+page.svelte`. */
export const pager: PagerStore = createPager();
