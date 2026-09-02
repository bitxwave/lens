import { describe, it, expect } from 'vitest';
import { computeShifts, cursorOnLeftHalfOf, type SlotRect } from './dragGrid';

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
      kind: 'item',
      rect: new DOMRect(left, 0, 80, 80)
    });
  }
  return out;
}

// NOTE: buckets in same-zone tests **exclude** the source card, matching
// the post-removal view buildLayoutCache produces after Card.svelte's
// [data-dragging='true'] rule sets the source to display:none. `row()`
// is a plain helper generating N ids starting from idBase, so caller
// picks a `sourceCardId` that's NOT in the bucket — that's the
// post-removal contract.

describe('computeShifts — same zone', () => {
  it('drop back on source original slot: empty shifts (no-op)', () => {
    // sourceLogicalIdx is the source's PRE-removal dataIdx; dropIdx is
    // post-removal. Dropping at dropIdx === sourceLogicalIdx means
    // "insert source right back where it lifted from", restoring
    // original order. No neighbour needs to move visually.
    // Bucket has 4 siblings (source id=1001 was pre-idx 1 and is
    // display:none, so it's absent). Sibling ids: 1000, 1002, 1003, 1004.
    const bucket: SlotRect[] = [
      { zone: 'root', logicalIdx: 0, cardId: 1000, kind: 'item', rect: new DOMRect(0, 0, 80, 80) },
      {
        zone: 'root',
        logicalIdx: 1,
        cardId: 1002,
        kind: 'item',
        rect: new DOMRect(100, 0, 80, 80)
      },
      {
        zone: 'root',
        logicalIdx: 2,
        cardId: 1003,
        kind: 'item',
        rect: new DOMRect(200, 0, 80, 80)
      },
      { zone: 'root', logicalIdx: 3, cardId: 1004, kind: 'item', rect: new DOMRect(300, 0, 80, 80) }
    ];
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001,
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 1, // == sourceLogicalIdx
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.size).toBe(0);
  });

  it('opens a gap: slots at i >= dropIdx shift +1 (post-removal target-open)', () => {
    // Source was pre-idx 1 (display:none, absent from cache). Bucket
    // shows siblings at post-idx 0..3. User aims dropIdx=2. Slots at
    // post-idx 2 and 3 must slide one cell right to make room for the
    // returning source; slots < 2 don't move.
    const bucket: SlotRect[] = [
      { zone: 'root', logicalIdx: 0, cardId: 1000, kind: 'item', rect: new DOMRect(0, 0, 80, 80) },
      {
        zone: 'root',
        logicalIdx: 1,
        cardId: 1002,
        kind: 'item',
        rect: new DOMRect(100, 0, 80, 80)
      },
      {
        zone: 'root',
        logicalIdx: 2,
        cardId: 1003,
        kind: 'item',
        rect: new DOMRect(200, 0, 80, 80)
      },
      { zone: 'root', logicalIdx: 3, cardId: 1004, kind: 'item', rect: new DOMRect(300, 0, 80, 80) }
    ];
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001,
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 2,
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.get(1000)).toBeUndefined(); // before dropIdx
    expect(out.get(1002)).toBeUndefined(); // at dropIdx boundary NOT included? i<dropIdx skipped, i=1 skipped
    expect(out.get(1003)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(1004)).toEqual({ dx: 100, dy: 0 });
  });

  it('drop at end (append): no shifts, gap opens past last real slot', () => {
    // dropIdx === bucket.length means "insert source at the tail".
    // No sibling has logicalIdx >= dropIdx, so no shifts fire.
    const bucket: SlotRect[] = [
      { zone: 'root', logicalIdx: 0, cardId: 1000, kind: 'item', rect: new DOMRect(0, 0, 80, 80) },
      {
        zone: 'root',
        logicalIdx: 1,
        cardId: 1002,
        kind: 'item',
        rect: new DOMRect(100, 0, 80, 80)
      }
    ];
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1001,
      sourceLogicalIdx: 1,
      targetZone: 'root',
      dropIdx: 2, // == bucket.length
      buckets: { root: bucket },
      mergeCollapse: false
    });
    expect(out.size).toBe(0);
  });

  it('returns empty map when mergeCollapse is true', () => {
    const bucket = row(4); // any 4 siblings, source not in this bucket
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
    const bucket = row(4);
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
  it('opens target zone slot and leaves source zone completely still', () => {
    // Launchpad semantics: dragging an icon from the home grid into an
    // opened folder does NOT compact the home grid. Only the target
    // (folder) opens a slot for the incoming icon; the source zone
    // reflows on data refetch after the drop, not during the drag.
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
    // Source zone: everyone stays put — no shift entries for root cards.
    for (let id = 1000; id < 1004; id++) {
      expect(out.get(id)).toBeUndefined();
    }
    // Target zone: idx ≥ dropIdx shifted +1.
    expect(out.get(2001)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(2002)).toEqual({ dx: 100, dy: 0 });
    expect(out.get(2000)).toBeUndefined();
  });

  it('empty target zone produces no shifts (source zone still untouched)', () => {
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
    expect(out.size).toBe(0);
  });

  it('cross-page: source page unchanged, target page opens a slot', () => {
    // Regression: dragging from page 0 into page 1 must not shuffle
    // page 0 cards around. Only page 1 receives shifts.
    const srcPage = row(3, 'root:p0', 1000);
    const tgtPage = row(4, 'root:p1', 2000);
    const out = computeShifts({
      sourceZone: 'root:p0',
      sourceCardId: 1000,
      sourceLogicalIdx: 0,
      targetZone: 'root:p1',
      dropIdx: 4, // append past last real slot on page 1
      buckets: { 'root:p0': srcPage, 'root:p1': tgtPage },
      mergeCollapse: false
    });
    // Source page unchanged.
    for (let id = 1000; id < 1003; id++) {
      expect(out.get(id)).toBeUndefined();
    }
    // Target page: append past last slot means no existing slot is at
    // i >= dropIdx (i < 4 for all four slots idx 0..3), so target too
    // gets no shifts — the incoming card lands at idx 4 with no
    // displacement of existing ones.
    for (let id = 2000; id < 2004; id++) {
      expect(out.get(id)).toBeUndefined();
    }
  });

  it('paged-root last page: extrapolates shift when nextPage bucket is absent', () => {
    // Regression: with only ONE page in root:p0 and TWO cards on the
    // last page root:p1, inserting at idx 0 needs card at idx 1 to
    // shift to idx 2. The nextPage lookup (`root:p2`) returns nothing
    // because there is no page 2 yet. Prior behaviour was to `continue`
    // and skip the shift, leaving the trailing card visually stacked
    // on top of the just-shifted first card. The correct behaviour is
    // to fall back to `extrapolateSlotPosition`, which finds a valid
    // grid cell in the SAME page (next column / next row).
    const srcPage = row(3, 'root:p0', 1000); // src on page 0
    // Build a 4-col grid on page 1 with 2 cards. Card idx 0 sits at
    // (0, y0); card idx 1 sits at (col, y0). Extrapolation for idx 2
    // should land at (2*col, y0).
    const tgtPage: SlotRect[] = [
      {
        zone: 'root:p1',
        logicalIdx: 0,
        cardId: 2000,
        kind: 'item',
        rect: new DOMRect(0, 0, 80, 80)
      },
      {
        zone: 'root:p1',
        logicalIdx: 1,
        cardId: 2001,
        kind: 'item',
        rect: new DOMRect(100, 0, 80, 80)
      }
    ];
    const out = computeShifts({
      sourceZone: 'root:p0',
      sourceCardId: 1000,
      sourceLogicalIdx: 0,
      targetZone: 'root:p1',
      dropIdx: 0,
      buckets: { 'root:p0': srcPage, 'root:p1': tgtPage },
      // Explicit 4-col geometry so extrapolate can wrap correctly.
      gridGeometryByZone: {
        'root:p1': { colCount: 4, rowGap: 0 }
      },
      mergeCollapse: false
    });
    // Existing behaviour still holds: card at idx 0 shifts +1 slot.
    expect(out.get(2000)).toEqual({ dx: 100, dy: 0 });
    // Regression bit: card at idx 1 must ALSO shift, into extrapolated
    // idx 2 position (col 2 of row 0 → left = 2 * 100 = 200).
    expect(out.get(2001)).toEqual({ dx: 100, dy: 0 });
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

describe('cursorOnLeftHalfOf', () => {
  it('returns true when cursor is left of slot center', () => {
    const rect = new DOMRect(100, 0, 80, 80); // [100, 180]
    expect(cursorOnLeftHalfOf(rect, 120)).toBe(true); // 120 < 140 (center)
  });

  it('returns false when cursor is right of slot center', () => {
    const rect = new DOMRect(100, 0, 80, 80);
    expect(cursorOnLeftHalfOf(rect, 160)).toBe(false); // 160 > 140
  });

  it('returns false when cursor is exactly at center (right-half tie-break)', () => {
    const rect = new DOMRect(100, 0, 80, 80);
    expect(cursorOnLeftHalfOf(rect, 140)).toBe(false); // exactly at center
  });
});
