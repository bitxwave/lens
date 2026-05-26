import { describe, it, expect } from 'vitest';
import { computeShifts, type SlotRect } from './dragGrid';

// vitest runs in node env (no jsdom/happy-dom installed); the action's
// type signatures use DOMRect, but computeShifts only reads .left/.top.
// Provide a minimal polyfill so the test rect literals compile and run.
if (typeof globalThis.DOMRect === 'undefined') {
  class DOMRectPolyfill {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
    get left() {
      return this.x;
    }
    get top() {
      return this.y;
    }
    get right() {
      return this.x + this.width;
    }
    get bottom() {
      return this.y + this.height;
    }
    toJSON() {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        left: this.left,
        top: this.top,
        right: this.right,
        bottom: this.bottom
      };
    }
  }
  // @ts-expect-error - polyfill for node test env
  globalThis.DOMRect = DOMRectPolyfill;
}

// Helper: build a fake bucket of N slots laid out in one row.
//   slot i has rect {left: i*100, top: 0, width: 80, height: 80}
function row(n: number, zone = 'root', idBase = 1000): SlotRect[] {
  const out: SlotRect[] = [];
  for (let i = 0; i < n; i++) {
    const left = i * 100;
    out.push({
      zone,
      logicalIdx: i,
      cardId: idBase + i,
      rect: new DOMRect(left, 0, 80, 80)
    });
  }
  return out;
}

describe('computeShifts — same zone', () => {
  it('returns empty map when source and drop are at same index (no-op)', () => {
    const bucket = row(5);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001, // c1 at idx 1
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 1,
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.size).toBe(0);
  });

  it('shifts cards in (srcIdx, dropIdx] left by 1 when moving forward', () => {
    // src=c1 at idx 1, drop at idx 3: cards at idx 2, 3 shift left by one cell
    const bucket = row(5);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001,
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 3,
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.get(1002)).toEqual({ dx: -100, dy: 0 }); // c2
    expect(out.get(1003)).toEqual({ dx: -100, dy: 0 }); // c3
    expect(out.get(1000)).toBeUndefined(); // c0 unchanged
    expect(out.get(1004)).toBeUndefined(); // c4 unchanged
    expect(out.get(1001)).toBeUndefined(); // src never shifted
  });

  it('shifts cards in [dropIdx, srcIdx) right by 1 when moving backward', () => {
    // src=c3 at idx 3, drop at idx 1: cards at idx 1, 2 shift right by one cell
    const bucket = row(5);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1003,
      sourceLogicalIdx: 3,
      targetZone: 'root',
      dropIdx: 1,
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.get(1001)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(1002)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(1000)).toBeUndefined();
    expect(out.get(1004)).toBeUndefined();
  });

  it('returns empty map when mergeCollapse is true', () => {
    const bucket = row(5);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001,
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 3,
      buckets: { root: bucket },
      mergeCollapse: true
    });
    expect(out.size).toBe(0);
  });

  it('returns empty when sourceLogicalIdx is negative (defensive)', () => {
    // -1 sentinel means the source isn't in any bucket cache yet (e.g.
    // pointerdown registered before the layout snapshot caught up).
    // computeShifts must not produce nonsensical shifts in that state.
    const bucket = row(5);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 9999,
      sourceLogicalIdx: -1,
      targetZone: 'root',
      dropIdx: 2,
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.size).toBe(0);
  });
});

describe('computeShifts — cross zone', () => {
  it('closes source zone gap and opens target zone slot', () => {
    const root = row(4, 'root', 1000); // ids 1000..1003
    const folder = row(3, 'folder:5', 2000); // ids 2000..2002
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1002,
      sourceLogicalIdx: 2,
      targetZone: 'folder:5',
      dropIdx: 1,
      buckets: { root, 'folder:5': folder },
      mergeCollapse: false
    });
    // Source zone close: c3 → -1 slot
    expect(out.get(1003)).toEqual({ dx: -100, dy: 0 });
    expect(out.get(1000)).toBeUndefined();
    expect(out.get(1001)).toBeUndefined();
    // Target zone open: idx ≥ 1 shifted +1
    expect(out.get(2001)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(2002)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(2000)).toBeUndefined();
  });

  it('closes source zone gap (no target shifts when target zone empty)', () => {
    const root = row(4, 'root', 1000);
    const folder: SlotRect[] = [];
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1003,
      sourceLogicalIdx: 3,
      targetZone: 'folder:5',
      dropIdx: 0,
      buckets: { root, 'folder:5': folder },
      mergeCollapse: false
    });
    expect(out.size).toBe(0); // nothing after idx 3 in src; target empty
  });

  it('extrapolates target shift via cellAdvance when last card shifts past end', () => {
    // target has 3 cards (idx 0, 1, 2); drop at idx 1 → cards at idx 1, 2
    // shift forward. Card at idx 1 → 2 hits a real slot (direct lookup);
    // card at idx 2 → 3 has no slot in the bucket → cellAdvance fallback.
    const folder = row(3, 'folder:5', 2000);
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 9999, // not in any bucket; src zone has no cards
      sourceLogicalIdx: 0,
      targetZone: 'folder:5',
      dropIdx: 1,
      buckets: { root: [], 'folder:5': folder },
      mergeCollapse: false
    });
    expect(out.get(2001)).toEqual({ dx: 100, dy: 0 }); // direct lookup (idx 1 → 2 exists)
    expect(out.get(2002)).toEqual({ dx: 100, dy: 0 }); // extrapolated (idx 2 → 3 doesn't exist)
    expect(out.get(2000)).toBeUndefined();
  });
});
