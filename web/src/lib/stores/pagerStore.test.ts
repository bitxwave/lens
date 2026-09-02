import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createPager } from './pagerStore';

/**
 * rAF + performance.now mocking pattern.
 *
 * Vitest 2.x' `vi.useFakeTimers()` doesn't fake requestAnimationFrame
 * by default. We stub the globals directly:
 *   - rAF pushes callback onto a queue; nothing runs until `tick()`.
 *   - `performance.now()` reads a mutable timestamp we bump per tick.
 *   - setTimeout uses fake timers so wheel-idle can advance via
 *     vi.advanceTimersByTime().
 */

let rafQueue: Array<{ id: number; cb: (t: number) => void }>;
let rafSeq = 0;
let mockTs = 0;

function installRafMocks() {
  rafQueue = [];
  rafSeq = 0;
  mockTs = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    const id = ++rafSeq;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const i = rafQueue.findIndex((q) => q.id === id);
    if (i >= 0) rafQueue.splice(i, 1);
  });
  vi.stubGlobal('performance', { now: () => mockTs });
}

/** Advance simulated wall clock by `dtMs` and fire all pending rAF callbacks. */
function tickFrame(dtMs = 16) {
  mockTs += dtMs;
  const q = rafQueue.splice(0);
  for (const { cb } of q) cb(mockTs);
}

/** Tick frames until the rAF queue drains (spring reached rest). */
function tickUntilRest(maxFrames = 300) {
  for (let i = 0; i < maxFrames; i++) {
    if (rafQueue.length === 0) return i;
    tickFrame();
  }
  throw new Error(`spring did not settle within ${maxFrames} frames`);
}

beforeEach(() => {
  installRafMocks();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createPager - initial state', () => {
  it('snapshot at construction is idle at page 0', () => {
    const p = createPager({ initialPageCount: 3 });
    const s = get({ subscribe: p.subscribe });
    expect(s).toMatchObject({
      position: 0,
      currentPage: 0,
      velocity: 0,
      mode: 'idle',
      isMoving: false
    });
  });
});

describe('createPager - pointer gesture', () => {
  it('short drag below projection threshold snaps back to origin', () => {
    const p = createPager({ initialPageCount: 3 });
    p.setPageCount(3);
    p.beginDrag();
    p.drag(0.15);
    p.endDrag(0);
    tickUntilRest();
    const s = get({ subscribe: p.subscribe });
    expect(s.currentPage).toBe(0);
    expect(s.mode).toBe('idle');
  });

  it('drag past projection threshold turns one page', () => {
    const p = createPager({ initialPageCount: 3 });
    p.beginDrag();
    p.drag(0.4); // 40% of a page
    p.endDrag(1.0); // + 1.0 page/s * 0.3s = 0.7 → round → 1
    tickUntilRest();
    const s = get({ subscribe: p.subscribe });
    expect(s.currentPage).toBe(1);
  });

  it('rubber-band engages when dragged past the low edge', () => {
    const p = createPager({ initialPageCount: 3 });
    p.beginDrag();
    p.drag(-0.3);
    const s = get({ subscribe: p.subscribe });
    expect(s.position).toBeLessThan(0);
    expect(s.position).toBeGreaterThan(-0.3); // damping in effect
    expect(s.mode).toBe('gesture');
  });
});

describe('createPager - wheel gesture', () => {
  it('accumulates wheel deltas and settles on idle timer', () => {
    const p = createPager({ initialPageCount: 3 });
    // Space wheel deltas 16ms apart so sampleWheelVelocity() has real
    // per-sample dt to divide by. tickFrame(16) bumps mockTs; no rAF is
    // running mid-gesture so no frame callbacks fire.
    p.wheel(0.1);
    tickFrame(16);
    p.wheel(0.1);
    tickFrame(16);
    p.wheel(0.1);
    // Just before idle window closes: still in gesture.
    expect(get({ subscribe: p.subscribe }).mode).toBe('gesture');
    // Sample window: 3 samples spanning 32ms, sum of samples[1..2] = 0.2 pages
    //   → velocity = 0.2 / 0.032 = 6.25 pages/sec
    // Position after three wheel(0.1) = 0.3
    //   → projection = round(0.3 + 6.25 * 0.3) = round(2.175) = 2
    //   → clamp to pageCount - 1 = 2
    // Advance past wheelIdleMs (180ms default) to fire endWheelGesture.
    vi.advanceTimersByTime(200);
    tickUntilRest();
    const s = get({ subscribe: p.subscribe });
    expect(s.mode).toBe('idle');
    expect(s.currentPage).toBe(2);
  });
});

describe('createPager - external commands', () => {
  it('gotoPage from idle springs to target', () => {
    const p = createPager({ initialPageCount: 3 });
    p.gotoPage(2);
    // Immediately after gotoPage: mode should be spring.
    expect(get({ subscribe: p.subscribe }).mode).toBe('spring');
    tickUntilRest();
    const s = get({ subscribe: p.subscribe });
    expect(s.currentPage).toBe(2);
    expect(s.mode).toBe('idle');
  });

  it('gotoPage during gesture is ignored', () => {
    const p = createPager({ initialPageCount: 5 });
    p.beginDrag();
    p.drag(0.1);
    p.gotoPage(4);
    // Still in gesture, target NOT hijacked.
    const s = get({ subscribe: p.subscribe });
    expect(s.mode).toBe('gesture');
    // Release with low velocity: projection lands on 0, not 4.
    p.endDrag(0);
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(0);
  });

  it('setPageCount shrinks with clamping', () => {
    const p = createPager({ initialPageCount: 5 });
    p.gotoPage(4);
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(4);
    // Shrink to 2 pages: pager should retarget to page 1 (= new max).
    p.setPageCount(2);
    tickUntilRest();
    const s = get({ subscribe: p.subscribe });
    expect(s.currentPage).toBe(1);
  });

  it('mid-spring gotoPage retargets without mode reset', () => {
    const p = createPager({ initialPageCount: 5 });
    p.gotoPage(2);
    // Run a few frames — mid-spring.
    tickFrame();
    tickFrame();
    tickFrame();
    expect(get({ subscribe: p.subscribe }).mode).toBe('spring');
    p.gotoPage(4);
    expect(get({ subscribe: p.subscribe }).mode).toBe('spring'); // no reset
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(4);
  });

  it('reset jumps to page 0 and cancels animation', () => {
    const p = createPager({ initialPageCount: 5 });
    p.gotoPage(3);
    tickFrame();
    tickFrame();
    p.reset();
    const s = get({ subscribe: p.subscribe });
    expect(s.position).toBe(0);
    expect(s.currentPage).toBe(0);
    expect(s.mode).toBe('idle');
    expect(rafQueue.length).toBe(0);
  });

  it('destroy stops the rAF loop', () => {
    const p = createPager({ initialPageCount: 3 });
    p.gotoPage(2);
    expect(rafQueue.length).toBeGreaterThan(0);
    p.destroy();
    expect(rafQueue.length).toBe(0);
    // Subsequent gotoPage does not restart.
    p.gotoPage(1);
    expect(rafQueue.length).toBe(0);
  });
});

describe('createPager - edge cases', () => {
  it('pageCount=1 clamps all inputs to page 0', () => {
    const p = createPager({ initialPageCount: 1 });
    p.gotoPage(3);
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(0);
    p.beginDrag();
    p.drag(0.4);
    // Rubber-band engaged; position is dampened, not clamped hard.
    const s1 = get({ subscribe: p.subscribe });
    expect(s1.position).toBeGreaterThan(0);
    expect(s1.position).toBeLessThan(0.4);
    p.endDrag(5.0);
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(0);
  });

  it('dt clamp: huge frame gap does not overshoot the spring target', () => {
    const p = createPager({ initialPageCount: 3 });
    p.gotoPage(2);
    // Simulate a tab-regain: skip forward 500ms in one rAF callback.
    // The frame loop should clamp dt internally to 32ms so the spring
    // takes a normal step, not a 500ms leap.
    tickFrame(500);
    const posAfter = get({ subscribe: p.subscribe }).position;
    expect(posAfter).toBeGreaterThan(0);
    expect(posAfter).toBeLessThan(2.01); // no overshoot past target
    // Confirm we can still finish normally.
    tickUntilRest();
    expect(get({ subscribe: p.subscribe }).currentPage).toBe(2);
  });
});
