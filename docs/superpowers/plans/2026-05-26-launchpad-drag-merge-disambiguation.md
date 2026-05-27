# Launchpad Drag Merge / Reorder Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Launchpad drag behavior match macOS — item-on-item folder
creation requires a deliberate dwell, and surrounding cards visibly shift
to make a gap during reorder (in root grid, folder panel, and across
zones).

**Architecture:** Hand-rolled Pointer-Events action in `dragGrid.ts` is
extended with (1) a per-session layout snapshot of every drop-target's
slot rect, (2) a dwell state machine that fires `armed` at 200 ms and
`ready` at 600 ms on item targets, and (3) a per-tick shift computation
that translates each non-source card by `transform: translate(dx,dy)` to
open a slot at the cursor's insertion point. A new `cellShifts` store
delivers the per-card translation to `Card.svelte`.

**Tech Stack:** Svelte 5, TypeScript, Pointer Events, vitest. No new
runtime dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-26-launchpad-drag-merge-disambiguation-design.md`](../specs/2026-05-26-launchpad-drag-merge-disambiguation-design.md)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `web/src/lib/stores/dragMerge.ts` | Modify | Extend `MergeCandidate` with `phase`; add `cellShifts` store |
| `web/src/lib/util/dragGrid.ts` | Modify | New constants; extract pure helpers (`computeShifts`, `buildLayoutCache`, `cursorOnLeftHalfOf`); rewire `liftSource` / `applyHover` / `finish` |
| `web/src/lib/util/dragGrid.test.ts` | Create | Unit tests for the pure helpers |
| `web/src/lib/components/Nav/Card.svelte` | Modify | Subscribe to `cellShifts`; rename `merge-target`→`merge-ready`; add `merge-armed`; CSS for hidden source + transition |
| `web/src/routes/+page.svelte` | Modify | Pass new `onLayoutChange` callback wired to spring-load + edge-pan |

No changes expected in `InlineFolderExpand.svelte` or `+page.svelte`'s
`handleDrop` (which already supports `before/after/merge`).

---

## Task 1: Foundation — constants, types, stores

**Files:**
- Modify: `web/src/lib/stores/dragMerge.ts`
- Modify: `web/src/lib/util/dragGrid.ts:87-95` (constants block)

**Goal:** Behavior-neutral preparation. Add new constants, extend the
`MergeCandidate` type with a phase, and add a `cellShifts` store. Nothing
reads the new fields yet so behavior is unchanged.

- [ ] **Step 1: Read current `dragMerge.ts`** to understand existing types

```bash
cat web/src/lib/stores/dragMerge.ts
```

- [ ] **Step 2: Replace `dragMerge.ts` to add `phase` and `cellShifts`**

```ts
// web/src/lib/stores/dragMerge.ts
import { writable } from 'svelte/store';
import type { CardKind } from '$lib/util/dragGrid';

// Visual feedback during a drag session.
//
//   - dragSource: { id, kind } of the card currently being dragged. Set
//                 the moment the drag is "lifted" (cursor moved past
//                 LIFT_THRESHOLD_PX); cleared when the gesture ends.
//   - mergeCandidate: set whenever the cursor's drop intent on a target
//                     would be a merge. Card.svelte uses this to render
//                     the `.merge-armed` (faint) or `.merge-ready`
//                     (full) halo on the target Card cell.
//   - cellShifts: per-card translation in pixels driven by reorder
//                 preview. Card.svelte applies these as
//                 `transform: translate(dx px, dy px)` on the cell.
//                 An entry of {dx:0,dy:0} or no entry means no shift.

export type MergePhase = 'armed' | 'ready';

export interface MergeCandidate {
  id: number;
  kind: CardKind;
  phase: MergePhase;
}

export interface DragSourceMeta {
  id: number;
  kind: CardKind;
}

export const dragSource = writable<DragSourceMeta | null>(null);
export const mergeCandidate = writable<MergeCandidate | null>(null);
export const cellShifts = writable<Map<number, { dx: number; dy: number }>>(new Map());
```

- [ ] **Step 3: Update `dragGrid.ts` constants block**

Edit `web/src/lib/util/dragGrid.ts` lines 87-95 — replace the entire
constants block:

```ts
const LIFT_THRESHOLD_PX = 5;
const MERGE_INNER_FRACTION = 0.5; // tighter (was 0.6) — dwell-gated, can be smaller
const MERGE_ARM_MS = 200;          // arm fires (release ≥ here = merge)
const MERGE_READY_MS = 600;        // ready halo strengthens
const MERGE_CANCEL_MOVE_PX = 8;    // jitter tolerance during pre-arm
const SHIFT_DURATION_MS = 220;
// SHIFT_EASE is exposed via CSS variable on Card.svelte; not needed here
const HOVER_DWELL_MS = 500;        // existing spring-load (unchanged)
const EDGE_PAN_THRESHOLD_PX = 80;
const EDGE_PAN_DWELL_MS = 600;
const EDGE_PAN_INTERVAL_MS = 800;
const CLONE_OPACITY = 0.88;
const CLONE_LIFT_SCALE = 1.05;
const CLONE_ID = '__draggrid_clone__';
```

- [ ] **Step 4: Verify type-check passes**

Run: `cd web && pnpm check`
Expected: 0 errors. (The new `phase` field on `MergeCandidate` is set
nowhere yet, but the field is additive so existing reads still type.)

Note: `Card.svelte:103` reads `$mergeCandidate?.id === card.id`. That's
a `number === number` check that doesn't touch `phase`. Still compiles.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/stores/dragMerge.ts web/src/lib/util/dragGrid.ts
git commit -m "$(cat <<'EOF'
refactor(launchpad): extend MergeCandidate with phase and add cellShifts store

Foundation for dwell-gated merge: store now distinguishes 'armed' vs
'ready' phases of merge intent, and a new cellShifts store carries
per-card translation deltas for reorder preview. No behavior change yet.
EOF
)"
```

---

## Task 2: Pure shift math + unit tests (TDD)

**Files:**
- Modify: `web/src/lib/util/dragGrid.ts` (export new pure helpers)
- Create: `web/src/lib/util/dragGrid.test.ts`

**Goal:** A pure function `computeShifts(input)` returns the per-card
translation map for any source/target combination. It has zero DOM
dependency and is fully unit-tested.

- [ ] **Step 1: Write the failing test file**

Create `web/src/lib/util/dragGrid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeShifts, type SlotRect } from './dragGrid';

// Helper: build a fake bucket of N slots laid out in one row.
//   slot i has rect {left: i*100, top: 0, width: 80, height: 80}
function row(n: number, zone = 'root'): SlotRect[] {
  const out: SlotRect[] = [];
  for (let i = 0; i < n; i++) {
    const left = i * 100;
    out.push({
      zone,
      logicalIdx: i,
      cardId: 1000 + i,
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
    expect(out.get(1000)).toBeUndefined();              // c0 unchanged
    expect(out.get(1004)).toBeUndefined();              // c4 unchanged
    expect(out.get(1001)).toBeUndefined();              // src never shifted
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
});

describe('computeShifts — cross zone', () => {
  it('closes source zone gap and opens target zone slot', () => {
    // src in root at idx 2; drop into folder panel at idx 1
    const root = row(4, 'root');
    const folder = row(3, 'folder:5');
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1002,        // root c2
      sourceLogicalIdx: 2,
      targetZone: 'folder:5',
      dropIdx: 1,
      buckets: { root, 'folder:5': folder },
      mergeCollapse: false
    });
    // Source zone: cards at idx > 2 shift left by 1
    expect(out.get(1003)).toEqual({ dx: -100, dy: 0 }); // root c3 → idx 2
    expect(out.get(1000)).toBeUndefined();
    expect(out.get(1001)).toBeUndefined();
    expect(out.get(1002)).toBeUndefined();              // src not shifted

    // Target zone: cards at idx >= 1 shift right by 1.
    // Folder cards are 1000..1002 in this synthetic test (row() reuses ids).
    // Adjust: row() in folder uses ids 1000+i, same as root → for clarity use distinct buckets in this test.
  });

  it('closes source zone gap (no target shifts when target zone empty)', () => {
    const root = row(4, 'root');
    const folder: SlotRect[] = [];
    const out = computeShifts({
      sourceZone: 'root',
      sourceCardId: 1003,        // root c3
      sourceLogicalIdx: 3,
      targetZone: 'folder:5',
      dropIdx: 0,
      buckets: { root, 'folder:5': folder },
      mergeCollapse: false
    });
    // Source zone: nothing after idx 3
    expect(out.get(1003)).toBeUndefined();
    // No target zone shifts since folder is empty
    expect(out.size).toBe(0);
  });
});
```

(The test file imports `computeShifts` and `SlotRect` from `./dragGrid`
— they don't exist yet. The id collision in the cross-zone test is a
real concern; we'll fix in Step 3 by giving `row()` a distinct id base
per zone.)

- [ ] **Step 2: Fix the test helper to use distinct ids per zone**

Edit `dragGrid.test.ts` — replace `row()` with:

```ts
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
```

And update the cross-zone tests to use distinct id bases:

```ts
it('closes source zone gap and opens target zone slot', () => {
  const root = row(4, 'root', 1000);   // ids 1000..1003
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
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd web && pnpm test:unit src/lib/util/dragGrid.test.ts`
Expected: All tests FAIL with `computeShifts is not a function` /
import error.

- [ ] **Step 4: Add `SlotRect` and `computeShifts` to `dragGrid.ts`**

Insert these at the top of `web/src/lib/util/dragGrid.ts` (after the
existing exports `CardKind`, `DropIntent`, `CardMeta`, etc., and after
the constants block):

```ts
export interface SlotRect {
  zone: string;          // 'root' | `folder:${number}`
  logicalIdx: number;
  cardId: number;
  rect: DOMRect;
}

export interface ComputeShiftsInput {
  sourceZone: string;
  sourceCardId: number;
  sourceLogicalIdx: number;
  targetZone: string;
  /** Logical index in targetZone where the source would land. */
  dropIdx: number;
  /** Maps zone name to its full snapshot, sorted by logicalIdx. */
  buckets: Record<string, SlotRect[]>;
  /** When true (merge armed/ready or folder target), all shifts collapse. */
  mergeCollapse: boolean;
}

/**
 * Per-card translation (dx, dy) needed to render reorder preview.
 * Pure: returns the same output for the same input. Skips the source
 * card. Returns an entry only if the card needs a non-zero translation.
 */
export function computeShifts(
  input: ComputeShiftsInput
): Map<number, { dx: number; dy: number }> {
  const result = new Map<number, { dx: number; dy: number }>();
  if (input.mergeCollapse) return result;

  const { sourceZone, sourceCardId, sourceLogicalIdx, targetZone, dropIdx, buckets } = input;

  if (sourceZone === targetZone) {
    const bucket = buckets[targetZone] ?? [];
    if (sourceLogicalIdx === dropIdx) return result;
    for (const slot of bucket) {
      if (slot.cardId === sourceCardId) continue;
      const i = slot.logicalIdx;
      let newIdx = i;
      if (sourceLogicalIdx < dropIdx && i > sourceLogicalIdx && i <= dropIdx) {
        newIdx = i - 1;
      } else if (sourceLogicalIdx > dropIdx && i >= dropIdx && i < sourceLogicalIdx) {
        newIdx = i + 1;
      }
      if (newIdx === i) continue;
      const targetSlot = bucket.find((s) => s.logicalIdx === newIdx);
      if (!targetSlot) continue;
      result.set(slot.cardId, {
        dx: targetSlot.rect.left - slot.rect.left,
        dy: targetSlot.rect.top - slot.rect.top
      });
    }
    return result;
  }

  // Cross-zone: close source gap; open target slot.
  const srcBucket = buckets[sourceZone] ?? [];
  for (const slot of srcBucket) {
    if (slot.cardId === sourceCardId) continue;
    const i = slot.logicalIdx;
    if (i <= sourceLogicalIdx) continue;
    const newIdx = i - 1;
    const targetSlot = srcBucket.find((s) => s.logicalIdx === newIdx);
    if (!targetSlot) continue;
    result.set(slot.cardId, {
      dx: targetSlot.rect.left - slot.rect.left,
      dy: targetSlot.rect.top - slot.rect.top
    });
  }

  const tgtBucket = buckets[targetZone] ?? [];
  for (const slot of tgtBucket) {
    const i = slot.logicalIdx;
    if (i < dropIdx) continue;
    const newIdx = i + 1;
    // newIdx may be == bucket.length (extrapolated). Use cellAdvance.
    const targetSlot = tgtBucket.find((s) => s.logicalIdx === newIdx);
    let dx: number;
    let dy: number;
    if (targetSlot) {
      dx = targetSlot.rect.left - slot.rect.left;
      dy = targetSlot.rect.top - slot.rect.top;
    } else {
      // Extrapolate using the per-step advance from this bucket.
      const adv = cellAdvance(tgtBucket);
      if (!adv) continue;
      dx = adv.dx;
      dy = adv.dy;
    }
    result.set(slot.cardId, { dx, dy });
  }
  return result;
}

/** Per-step displacement vector between consecutive slot rects in a zone. */
export function cellAdvance(bucket: SlotRect[]): { dx: number; dy: number } | null {
  if (bucket.length < 2) return null;
  const a = bucket.find((s) => s.logicalIdx === 0)?.rect;
  const b = bucket.find((s) => s.logicalIdx === 1)?.rect;
  if (!a || !b) return null;
  return { dx: b.left - a.left, dy: b.top - a.top };
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd web && pnpm test:unit src/lib/util/dragGrid.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/util/dragGrid.ts web/src/lib/util/dragGrid.test.ts
git commit -m "$(cat <<'EOF'
feat(launchpad): pure computeShifts function with unit tests

Per-card translation map for reorder preview. Same-zone shifts cards
between source and drop indexes; cross-zone closes source's gap and
opens a target slot. Returns empty when merge intent is committed.
EOF
)"
```

---

## Task 3: Layout cache builder + helpers

**Files:**
- Modify: `web/src/lib/util/dragGrid.ts` (add `LayoutCache`, `buildLayoutCache`, `cursorOnLeftHalfOf`)
- Modify: `web/src/lib/util/dragGrid.test.ts` (add test for `cursorOnLeftHalfOf`)

**Goal:** Functions that snapshot the current grid state at lift time
into a `LayoutCache`, plus a small helper used by drop intent
resolution. The DOM-walking part is hard to unit-test without jsdom
fakery, so we lean on `cursorOnLeftHalfOf` (pure) for tests and verify
the cache builder via integration (Task 5).

- [ ] **Step 1: Add the failing test for `cursorOnLeftHalfOf`**

Append to `web/src/lib/util/dragGrid.test.ts`:

```ts
import { cursorOnLeftHalfOf } from './dragGrid';

describe('cursorOnLeftHalfOf', () => {
  it('returns true when cursor is left of slot center', () => {
    const rect = new DOMRect(100, 0, 80, 80); // [100, 180]
    expect(cursorOnLeftHalfOf(rect, 120)).toBe(true);  // 120 < 140 (center)
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
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `cd web && pnpm test:unit src/lib/util/dragGrid.test.ts`
Expected: 3 new tests FAIL with `cursorOnLeftHalfOf is not a function`.
Existing computeShifts tests still PASS.

- [ ] **Step 3: Add `LayoutCache`, `buildLayoutCache`, `cursorOnLeftHalfOf` to `dragGrid.ts`**

Insert below the `cellAdvance` function added in Task 2:

```ts
export interface CardIdEntry {
  zone: string;
  logicalIdx: number;
  rect: DOMRect;
}

export interface LayoutCache {
  byZone: Map<string, SlotRect[]>;          // sorted by logicalIdx
  byCardId: Map<number, CardIdEntry>;
  cellAdvanceByZone: Map<string, { dx: number; dy: number }>;
}

/**
 * Snapshot all [data-card-id] cells inside `node`, grouped by their
 * nearest [data-zone] ancestor. Source's own cell is included so its
 * logical position is recoverable, but the consumer treats source as
 * "the gap" and skips shifting it.
 */
export function buildLayoutCache(node: HTMLElement): LayoutCache {
  const byZone = new Map<string, SlotRect[]>();
  const byCardId = new Map<number, CardIdEntry>();
  const cells = node.querySelectorAll<HTMLElement>('[data-card-id]');
  // First pass: collect all cells with rects, grouped by zone.
  const collected: Array<{ cell: HTMLElement; meta: CardMeta; rect: DOMRect }> = [];
  cells.forEach((cell) => {
    const meta = readMetaFromCell(cell);
    if (!meta) return; // skip add-tile sentinel and malformed
    collected.push({ cell, meta, rect: cell.getBoundingClientRect() });
  });
  // Group by zone, sort by document order (which mirrors logicalIdx
  // because the grid renders in sortOrder).
  const byZoneRaw = new Map<string, Array<{ meta: CardMeta; rect: DOMRect }>>();
  for (const { meta, rect } of collected) {
    const list = byZoneRaw.get(meta.zone) ?? [];
    list.push({ meta, rect });
    byZoneRaw.set(meta.zone, list);
  }
  // Second pass: assign logicalIdx in DOM order, build SlotRect arrays.
  for (const [zone, items] of byZoneRaw) {
    const slots: SlotRect[] = items.map((item, idx) => ({
      zone,
      logicalIdx: idx,
      cardId: item.meta.id,
      rect: item.rect
    }));
    byZone.set(zone, slots);
    for (const slot of slots) {
      byCardId.set(slot.cardId, {
        zone,
        logicalIdx: slot.logicalIdx,
        rect: slot.rect
      });
    }
  }
  // Per-zone cellAdvance for extrapolation.
  const cellAdvanceByZone = new Map<string, { dx: number; dy: number }>();
  for (const [zone, slots] of byZone) {
    const adv = cellAdvance(slots);
    if (adv) cellAdvanceByZone.set(zone, adv);
  }
  return { byZone, byCardId, cellAdvanceByZone };
}

/**
 * Pure: is cursorX on the left half of a slot's rect?
 * Center exactly is treated as right-half (so before/after split has a
 * deterministic tie-break).
 */
export function cursorOnLeftHalfOf(rect: DOMRect, cursorX: number): boolean {
  return cursorX < rect.left + rect.width / 2;
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `cd web && pnpm test:unit src/lib/util/dragGrid.test.ts`
Expected: All tests PASS (the 4 from Task 2 + 3 new ones).

- [ ] **Step 5: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/util/dragGrid.ts web/src/lib/util/dragGrid.test.ts
git commit -m "$(cat <<'EOF'
feat(launchpad): layout cache builder and cursorOnLeftHalfOf helper

buildLayoutCache snapshots every [data-card-id] cell's logical index
and rect, grouped by [data-zone]. Used at drag lift to keep insertion
math stable independent of mid-drag transform shifts.
EOF
)"
```

---

## Task 4: Add dwell session fields and helpers

**Files:**
- Modify: `web/src/lib/util/dragGrid.ts:97-115` (DragSession interface) plus internal helpers

**Goal:** Extend `DragSession` with the fields the dwell state machine
needs, and add private helper functions to start/cancel arming. Not yet
wired into `applyHover` — purely additive.

- [ ] **Step 1: Read the current `DragSession` interface for context**

Run: `grep -n 'interface DragSession' web/src/lib/util/dragGrid.ts`
Expected: shows the interface around line 97.

- [ ] **Step 2: Replace the `DragSession` interface in `dragGrid.ts`**

Find lines 97-115 (the `interface DragSession { ... }` block) and
replace with:

```ts
interface DragSession {
  sourceCell: HTMLElement;
  source: CardMeta;
  startX: number;
  startY: number;
  cursorX: number;
  cursorY: number;
  lifted: boolean;
  clone: HTMLElement | null;
  cloneOffsetX: number;
  cloneOffsetY: number;
  rafToken: number | null;
  // Existing spring-load timer (folder panel auto-open).
  dwellTimer: ReturnType<typeof setTimeout> | null;
  dwellTargetId: number | null;
  edgePanTimer: ReturnType<typeof setTimeout> | null;
  edgePanDirection: EdgePanDirection | null;
  hover: DragHoverInfo;
  pointerId: number;
  // New (Task 4): layout snapshot, populated at lift.
  layoutCache: LayoutCache | null;
  sourceLogicalIdx: number;
  // New (Task 4): merge dwell state machine.
  mergeArmTimer: ReturnType<typeof setTimeout> | null;
  mergeReadyTimer: ReturnType<typeof setTimeout> | null;
  mergeArmTargetId: number | null;
  mergeArmStartX: number;
  mergeArmStartY: number;
  /** True once arm timer fires; persists through ready. The drop semantics
   *  flip from reorder→merge based on this flag. */
  mergeArmFired: boolean;
}
```

- [ ] **Step 3: Update the session-init block in `onPointerDown`**

Find the session creation around line 178 (`session = { sourceCell: cell, ... }`)
and replace with:

```ts
session = {
  sourceCell: cell,
  source: meta,
  startX: e.clientX,
  startY: e.clientY,
  cursorX: e.clientX,
  cursorY: e.clientY,
  lifted: false,
  clone: null,
  cloneOffsetX: 0,
  cloneOffsetY: 0,
  rafToken: null,
  dwellTimer: null,
  dwellTargetId: null,
  edgePanTimer: null,
  edgePanDirection: null,
  hover: { target: null, intent: null, hoverZone: meta.zone, outOfZone: false },
  pointerId: e.pointerId,
  layoutCache: null,
  sourceLogicalIdx: -1,
  mergeArmTimer: null,
  mergeReadyTimer: null,
  mergeArmTargetId: null,
  mergeArmStartX: 0,
  mergeArmStartY: 0,
  mergeArmFired: false
};
```

- [ ] **Step 4: Add private helpers `cancelMergeArm` and `startMergeArm`**

Insert these inside the `dragGrid` action body, just below the existing
`cancelDwell` function:

```ts
function cancelMergeArm() {
  if (!session) return;
  if (session.mergeArmTimer) {
    clearTimeout(session.mergeArmTimer);
    session.mergeArmTimer = null;
  }
  if (session.mergeReadyTimer) {
    clearTimeout(session.mergeReadyTimer);
    session.mergeReadyTimer = null;
  }
  session.mergeArmTargetId = null;
  session.mergeArmFired = false;
  mergeCandidate.set(null);
}

function startMergeArmForItem(targetId: number, kind: CardKind) {
  if (!session) return;
  cancelMergeArm();
  session.mergeArmTargetId = targetId;
  session.mergeArmFired = false;
  session.mergeArmStartX = session.cursorX;
  session.mergeArmStartY = session.cursorY;

  session.mergeArmTimer = setTimeout(() => {
    if (!session) return;
    if (session.mergeArmTargetId !== targetId) return;
    // Defensive: if the cursor wandered past tolerance, do not arm.
    const dx = session.cursorX - session.mergeArmStartX;
    const dy = session.cursorY - session.mergeArmStartY;
    if (Math.hypot(dx, dy) > MERGE_CANCEL_MOVE_PX) {
      cancelMergeArm();
      return;
    }
    session.mergeArmFired = true;
    mergeCandidate.set({ id: targetId, kind, phase: 'armed' });
  }, MERGE_ARM_MS);

  session.mergeReadyTimer = setTimeout(() => {
    if (!session) return;
    if (session.mergeArmTargetId !== targetId) return;
    if (!session.mergeArmFired) return; // arm cancelled before ready
    mergeCandidate.set({ id: targetId, kind, phase: 'ready' });
  }, MERGE_READY_MS);
}

function setMergeImmediateForFolder(targetId: number) {
  if (!session) return;
  cancelMergeArm();
  session.mergeArmTargetId = targetId;
  session.mergeArmFired = true;
  mergeCandidate.set({ id: targetId, kind: 'folder', phase: 'ready' });
}
```

- [ ] **Step 5: Add cleanup of these timers to `finish`**

Find `finish(canceled: boolean)` around line 402. Add `cancelMergeArm()`
to the cleanup section. Replace this section:

```ts
    if (s.rafToken != null) cancelAnimationFrame(s.rafToken);
    if (s.dwellTimer) clearTimeout(s.dwellTimer);
    if (s.edgePanTimer) clearTimeout(s.edgePanTimer);
```

with:

```ts
    if (s.rafToken != null) cancelAnimationFrame(s.rafToken);
    if (s.dwellTimer) clearTimeout(s.dwellTimer);
    if (s.edgePanTimer) clearTimeout(s.edgePanTimer);
    if (s.mergeArmTimer) clearTimeout(s.mergeArmTimer);
    if (s.mergeReadyTimer) clearTimeout(s.mergeReadyTimer);
```

And just before `mergeCandidate.set(null)` (already in `finish`),
ensure the cellShifts store is also cleared. Replace:

```ts
    mergeCandidate.set(null);
    dragSource.set(null);
```

with:

```ts
    mergeCandidate.set(null);
    dragSource.set(null);
    cellShifts.set(new Map());
```

And add the import at the top of the file. Find the existing import:

```ts
import { mergeCandidate, dragSource } from '$lib/stores/dragMerge';
```

Replace with:

```ts
import { mergeCandidate, dragSource, cellShifts } from '$lib/stores/dragMerge';
```

- [ ] **Step 6: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 7: Sanity-run all tests (still no integration)**

Run: `cd web && pnpm test:unit`
Expected: All existing + new tests PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/util/dragGrid.ts
git commit -m "$(cat <<'EOF'
feat(launchpad): dwell session state and merge-arm helpers

Adds layoutCache, sourceLogicalIdx, and dwell timers/state to
DragSession. Introduces startMergeArmForItem / setMergeImmediateForFolder
/ cancelMergeArm. Not wired into applyHover yet — Task 5 does that.
EOF
)"
```

---

## Task 5: Wire layout cache + dwell + shifts into `applyHover`

**Files:**
- Modify: `web/src/lib/util/dragGrid.ts:265-300` (`liftSource`)
- Modify: `web/src/lib/util/dragGrid.ts:302-332` (`computeHover`)
- Modify: `web/src/lib/util/dragGrid.ts:334-379` (`applyHover`)

**Goal:** Build the layout cache when the drag lifts; then on every
rAF tick, classify intent → drive dwell state machine → compute shifts
→ publish to `cellShifts`. This is the integration step.

- [ ] **Step 1: Build layout cache at lift**

Find `liftSource` around line 265. After the existing line
`document.body.appendChild(clone);`, add:

```ts
    session.layoutCache = buildLayoutCache(node);
    const srcEntry = session.layoutCache.byCardId.get(session.source.id);
    session.sourceLogicalIdx = srcEntry?.logicalIdx ?? 0;
```

- [ ] **Step 2: Replace `computeHover` to use layout cache for hits**

Find `computeHover` (around line 302) and replace it. The new version
also returns the target's `logicalIdx`:

```ts
function computeHover(s: DragSession): DragHoverInfo {
  const { cursorX, cursorY, source } = s;
  const stack = document.elementsFromPoint(cursorX, cursorY);
  let hoverZone: string | null = null;
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.id === CLONE_ID) continue;
    if (hoverZone == null) {
      const zoneEl = el.closest('[data-zone]') as HTMLElement | null;
      if (zoneEl && node.contains(zoneEl)) {
        hoverZone = zoneEl.dataset.zone ?? null;
      }
    }
    const cell = el.closest('[data-card-id]');
    if (!(cell instanceof HTMLElement)) continue;
    if (!node.contains(cell)) continue;
    const meta = readMetaFromCell(cell);
    if (!meta) continue;
    if (meta.id === source.id) continue;
    const r = cell.getBoundingClientRect();
    const intent = classifyIntent(r, cursorX, cursorY);
    return { target: meta, intent, hoverZone: meta.zone, outOfZone: false };
  }
  return { target: null, intent: null, hoverZone, outOfZone: hoverZone == null };
}
```

(Logically unchanged — this is a no-op replacement just to keep the
signature obvious. We rely on `session.layoutCache` for shift compute,
not for hit-test.)

- [ ] **Step 3: Replace `applyHover` to drive dwell + shifts**

Find `applyHover` and replace the full function body:

```ts
function applyHover(next: DragHoverInfo) {
  if (!session) return;
  const prev = session.hover;
  session.hover = next;

  if (prev.hoverZone !== next.hoverZone) {
    options.onHoverZoneChange?.(prev.hoverZone, next.hoverZone);
  }

  // --- Merge dwell state machine ---
  // Item targets need a 200ms arm gate. Folder targets are immediate.
  // Non-merge intent or different target → cancel arming.
  const isMergeItem =
    next.intent === 'merge' && next.target?.kind === 'item' && next.target.id != null;
  const isMergeFolder =
    next.intent === 'merge' && next.target?.kind === 'folder' && next.target.id != null;

  if (!isMergeItem && !isMergeFolder) {
    if (session.mergeArmTargetId != null) cancelMergeArm();
  } else if (isMergeItem) {
    if (session.mergeArmTargetId !== next.target!.id) {
      // Switching targets: restart arming.
      startMergeArmForItem(next.target!.id, 'item');
    } else if (!session.mergeArmFired) {
      // Pre-arm jitter check.
      const dx = session.cursorX - session.mergeArmStartX;
      const dy = session.cursorY - session.mergeArmStartY;
      if (Math.hypot(dx, dy) > MERGE_CANCEL_MOVE_PX) {
        startMergeArmForItem(next.target!.id, 'item'); // restart from current pos
      }
    }
  } else if (isMergeFolder) {
    if (session.mergeArmTargetId !== next.target!.id) {
      setMergeImmediateForFolder(next.target!.id);
    }
  }

  // --- Spring-load (folder panel auto-open) — unchanged behavior ---
  // Restrict to: source.kind === 'item' AND source.zone === 'root' AND
  // target.kind === 'folder'. Same conditions as before.
  const isSpringTarget =
    next.intent === 'merge' &&
    next.target?.kind === 'folder' &&
    next.target.id != null &&
    session.source.kind === 'item' &&
    session.source.zone === 'root';
  const sameTarget =
    prev.target?.id === next.target?.id && prev.intent === next.intent;
  if (!sameTarget) cancelDwell();
  if (isSpringTarget && session.dwellTargetId !== next.target!.id) {
    cancelDwell();
    const tid = next.target!.id;
    session.dwellTargetId = tid;
    session.dwellTimer = setTimeout(() => {
      if (!session) return;
      if (session.dwellTargetId !== tid) return;
      options.onSpringLoad?.(tid);
    }, HOVER_DWELL_MS);
  }

  // --- Shift compute and publish ---
  publishShifts(next);
}
```

- [ ] **Step 4: Add the new `publishShifts` function**

Insert just below `applyHover` (and above `cancelDwell`):

```ts
function publishShifts(next: DragHoverInfo) {
  if (!session || !session.layoutCache) {
    cellShifts.set(new Map());
    return;
  }
  const lc = session.layoutCache;
  const target = next.target;
  // Determine whether merge gate is active (collapse all shifts).
  const mergeCollapse =
    target != null &&
    next.intent === 'merge' &&
    (target.kind === 'folder' || session.mergeArmFired);

  // Determine target zone + dropIdx.
  let targetZone: string | null = null;
  let dropIdx = 0;
  if (target) {
    targetZone = target.zone;
    const tEntry = lc.byCardId.get(target.id);
    if (!tEntry) {
      cellShifts.set(new Map());
      return;
    }
    // For pre-arm item merge, fall through to side-based.
    let effIntent: DropIntent = next.intent ?? 'after';
    if (effIntent === 'merge' && target.kind === 'item' && !session.mergeArmFired) {
      effIntent = cursorOnLeftHalfOf(tEntry.rect, session.cursorX) ? 'before' : 'after';
    }
    dropIdx = effIntent === 'before' ? tEntry.logicalIdx : tEntry.logicalIdx + 1;
  } else if (next.hoverZone) {
    // No target but inside a zone → append at end.
    targetZone = next.hoverZone;
    const bucket = lc.byZone.get(targetZone) ?? [];
    dropIdx = bucket.length;
  } else {
    cellShifts.set(new Map());
    return;
  }

  const buckets: Record<string, SlotRect[]> = {};
  for (const [zone, slots] of lc.byZone) buckets[zone] = slots;

  const shifts = computeShifts({
    sourceZone: session.source.zone,
    sourceCardId: session.source.id,
    sourceLogicalIdx: session.sourceLogicalIdx,
    targetZone,
    dropIdx,
    buckets,
    mergeCollapse
  });
  cellShifts.set(shifts);
}
```

- [ ] **Step 5: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Run unit tests**

Run: `cd web && pnpm test:unit`
Expected: All tests PASS (still pure function tests, the integration is
not under test).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/util/dragGrid.ts
git commit -m "$(cat <<'EOF'
feat(launchpad): wire layout cache, dwell, and shift preview in dragGrid

liftSource builds the per-session layout cache. applyHover drives the
dwell state machine (item: 200/600 ms two-stage; folder: instant) and
republishes cellShifts each tick. mergeCandidate now includes phase.
EOF
)"
```

---

## Task 6: Resolve final intent in `finish`

**Files:**
- Modify: `web/src/lib/util/dragGrid.ts:430-435` (the `onDrop` call)

**Goal:** Drop semantics flip from raw geometric intent to **resolved**
intent: if `mergeArmFired` true → merge; if item target without arm →
fall back to before/after by cursor side; otherwise pass through.

- [ ] **Step 1: Add `resolveFinalIntent` helper above `finish`**

Insert right above the `finish` function:

```ts
function resolveFinalIntent(s: DragSession): DragHoverInfo {
  const t = s.hover.target;
  if (s.mergeArmFired && t) {
    return { ...s.hover, intent: 'merge' };
  }
  if (s.hover.intent === 'merge' && t && t.kind === 'item') {
    if (!s.layoutCache) return { ...s.hover, intent: 'after' };
    const entry = s.layoutCache.byCardId.get(t.id);
    if (!entry) return { ...s.hover, intent: 'after' };
    const intent: DropIntent = cursorOnLeftHalfOf(entry.rect, s.cursorX) ? 'before' : 'after';
    return { ...s.hover, intent };
  }
  return s.hover;
}
```

- [ ] **Step 2: Update `finish` to use `resolveFinalIntent`**

Find the `onDrop` call at the end of `finish` (around line 430-435):

```ts
    if (s.lifted && !canceled) {
      options.onDrop?.({
        source: s.source,
        ...s.hover
      });
    }
```

Replace with:

```ts
    if (s.lifted && !canceled) {
      options.onDrop?.({
        source: s.source,
        ...resolveFinalIntent(s)
      });
    }
```

- [ ] **Step 3: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Run all tests**

Run: `cd web && pnpm test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/util/dragGrid.ts
git commit -m "$(cat <<'EOF'
feat(launchpad): resolve drop intent based on merge-arm gate

resolveFinalIntent: dropping on an item where the dwell never fired
falls back to before/after by cursor side. Releasing in armed/ready
state commits merge. Folder targets always merge.
EOF
)"
```

---

## Task 7: Card.svelte visual updates

**Files:**
- Modify: `web/src/lib/components/Nav/Card.svelte`

**Goal:** Cell subscribes to `cellShifts` and applies a `transform:
translate(...)` style. Halo class becomes two-tier (`merge-armed` /
`merge-ready`). Source cell goes invisible (opacity 0) while dragging.
CSS adds the shift transition.

- [ ] **Step 1: Read current Card.svelte head**

Run: `grep -n 'mergeCandidate\|merge-target\|use:longPress' web/src/lib/components/Nav/Card.svelte`
Expected: lines around 10, 103, 106, 197-198.

- [ ] **Step 2: Update the script imports + per-card shift derivation**

Find this near top of `<script>`:

```ts
  import { mergeCandidate } from '$lib/stores/dragMerge';
```

Replace with:

```ts
  import { mergeCandidate, cellShifts } from '$lib/stores/dragMerge';
```

Then add this derivation alongside the other reactive declarations
inside the script (anywhere after `card` is in scope; the existing
file uses Svelte 5 runes so derivations live in `$derived`):

```ts
  const shift = $derived($cellShifts.get(card.id) ?? { dx: 0, dy: 0 });
  const mergePhase = $derived(
    $mergeCandidate?.id === card.id ? $mergeCandidate.phase : null
  );
```

- [ ] **Step 3: Update the `<div class="cell">` element**

Find the cell template (currently around line 100-107):

```svelte
<div
  class="cell"
  class:jiggle={$jiggleMode}
  class:merge-target={$mergeCandidate?.id === card.id}
  data-card-id={card.id}
  data-card-kind={card.kind}
  use:longPress={{ onTrigger: onLongPress }}
>
```

Replace with:

```svelte
<div
  class="cell"
  class:jiggle={$jiggleMode}
  class:merge-armed={mergePhase === 'armed'}
  class:merge-ready={mergePhase === 'ready'}
  data-card-id={card.id}
  data-card-kind={card.kind}
  style:transform={shift.dx === 0 && shift.dy === 0
    ? null
    : `translate(${shift.dx}px, ${shift.dy}px)`}
  use:longPress={{ onTrigger: onLongPress }}
>
```

- [ ] **Step 4: Update the CSS section**

Find the CSS block starting near line 143 (`<style lang="scss">`).
Locate the `.cell.merge-target .card, .cell.merge-target .folder` rule
(line ~197-198). Replace the entire `merge-target` rule with the new
two-tier:

Old:
```scss
  /* Visual cue for "release here to merge / reparent". The hover
   * threshold (500ms) flips this on by setting the cell class. */
  .cell.merge-target .card,
  .cell.merge-target .folder {
    box-shadow:
      0 0 0 4px var(--c-accent, #4a6cf7),
      0 0 22px rgba(74, 108, 247, 0.55);
    transform: scale(1.06);
    transition:
      box-shadow 0.15s ease,
```

New:
```scss
  /* Visual cue for "release here to merge / reparent". Two tiers:
   * - merge-armed: appears at MERGE_ARM_MS (200 ms) into a stationary
   *   hover. Faint halo + small scale. Releasing here ALSO commits a
   *   merge (the gate is "armed", not "ready").
   * - merge-ready: promotes at MERGE_READY_MS (600 ms). Stronger halo,
   *   larger scale. Functionally identical to armed for drop, but a
   *   clearer "release now = build folder" signal.
   * Folder targets are always set to ready immediately. */
  .cell.merge-armed .card,
  .cell.merge-armed .folder {
    box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.5);
    transform: scale(1.02);
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }
  .cell.merge-ready .card,
  .cell.merge-ready .folder {
    box-shadow:
      0 0 0 4px var(--c-accent, #4a6cf7),
      0 0 22px rgba(74, 108, 247, 0.55);
    transform: scale(1.06);
    transition:
      box-shadow 0.15s ease,
```

(Keep the trailing `transform 0.15s ease;` and closing brace from the
old block — they apply to `.merge-ready` now.)

- [ ] **Step 5: Add cell shift transition + hidden source rules**

Inside the same `<style>` block, find the `.cell { ... }` rule at the
top (around line 155). After it, add:

```scss
  /* Reorder preview translation. The cell uses `style:transform` set by
   * cellShifts; this keeps the inner card/folder element free for the
   * jiggle and merge-state transforms (they don't compose otherwise). */
  .cell {
    transition: transform var(--shift-duration, 220ms) cubic-bezier(0.4, 0, 0.2, 1);
  }
  /* While this cell is the active drag source, hide it so the empty
   * slot is visible at the source's logical position. The clone follows
   * the cursor (managed by dragGrid). pointer-events:none keeps the
   * hidden cell from intercepting elementsFromPoint hits. */
  .cell[data-dragging='true'] {
    opacity: 0;
    pointer-events: none;
  }
```

- [ ] **Step 6: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 7: Quick visual smoke test (dev server)**

Run in one terminal: `cd web && pnpm dev`
Open http://127.0.0.1:5173. After login, long-press a card to enter
jiggle mode. Drag a card across the row.

Expected: surrounding cards visibly shift to make a gap. Halo only
appears after stopping on another item ≥ 200 ms.

(If the dev server can't start because the Rust backend isn't running,
either start it via the existing `docker-compose.yml` flow, or skip
this step and rely on Task 10 for full verification.)

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/components/Nav/Card.svelte
git commit -m "$(cat <<'EOF'
feat(launchpad): card visual reorder shift and two-tier merge halo

Card subscribes to cellShifts and applies translate transform; merge
halo splits into merge-armed (faint, 200ms) and merge-ready (full,
600ms). Source cell goes invisible while dragging so the gap is shown.
EOF
)"
```

---

## Task 8: `+page.svelte` — rebuild cache on layout-changing events

**Files:**
- Modify: `web/src/routes/+page.svelte` (the `dragGrid` use directive and
  surrounding callbacks)

**Goal:** When the folder panel spring-loads or the page changes
mid-drag, rebuild the layout cache so subsequent ticks have correct
slot rects.

- [ ] **Step 1: Read the current dragGrid call site**

Run: `grep -n 'dragGrid\|onSpringLoad\|onEdgePan' web/src/routes/+page.svelte`
Expected: lines around 411-419 (the `<div class="canvas" use:dragGrid>` block).

- [ ] **Step 2: Expose a layoutCache rebuilder from the dragGrid action**

In `web/src/lib/util/dragGrid.ts`, find the action's `return` block
near the end:

```ts
  return {
    update(next: DragGridOptions) {
      options = next;
    },
    destroy() {
      ...
    }
  };
```

Replace with:

```ts
  return {
    update(next: DragGridOptions) {
      options = next;
    },
    /** Rebuilds the layout cache. Callers (page-level callbacks) invoke
     *  this after layout-changing events (spring-load, edge-pan) so
     *  subsequent ticks have correct slot rects. */
    rebuildLayoutCache() {
      if (session?.lifted) {
        session.layoutCache = buildLayoutCache(node);
        const srcEntry = session.layoutCache.byCardId.get(session.source.id);
        session.sourceLogicalIdx = srcEntry?.logicalIdx ?? session.sourceLogicalIdx;
      }
    },
    destroy() {
      ...
    }
  };
```

(Keep the destroy body intact.)

Svelte action types: `dragGrid` returns `ActionReturn<DragGridOptions>`
implicitly. Adding a method requires explicit typing. Update the
exported function signature near the top of the file:

```ts
export function dragGrid(
  node: HTMLElement,
  opts: DragGridOptions
): { update(next: DragGridOptions): void; rebuildLayoutCache(): void; destroy(): void } {
```

- [ ] **Step 3: Capture the action return in `+page.svelte`**

Find the `<div class="canvas">` block (around line 411). The action is
currently used via `use:dragGrid`. Svelte actions can't return a
handle through `use:` directly, so we'll wrap manually:

Old (around line 411-419):
```svelte
<div
  class="canvas"
  use:dragGrid={{
    enabled: $jiggleMode && $sessionStore.authed,
    onSpringLoad: handleSpringLoad,
    onEdgePan: handleEdgePan,
    onHoverZoneChange: handleHoverZoneChange,
    onDrop: handleDrop
  }}
>
```

Replace with the same use directive but capture the return through a
helper. In the `<script>` section near other state declarations, add:

```ts
  let dragGridHandle: { rebuildLayoutCache(): void } | null = null;

  function dragGridAction(node: HTMLElement, opts: Parameters<typeof dragGrid>[1]) {
    const ret = dragGrid(node, opts);
    dragGridHandle = ret;
    return {
      update(next: typeof opts) {
        ret.update(next);
      },
      destroy() {
        dragGridHandle = null;
        ret.destroy();
      }
    };
  }
```

Then change the use directive:

```svelte
<div
  class="canvas"
  use:dragGridAction={{
    enabled: $jiggleMode && $sessionStore.authed,
    onSpringLoad: handleSpringLoad,
    onEdgePan: handleEdgePan,
    onHoverZoneChange: handleHoverZoneChange,
    onDrop: handleDrop
  }}
>
```

- [ ] **Step 4: Wire `handleSpringLoad` and `handleEdgePan` to call rebuild**

Find `handleSpringLoad` and `handleEdgePan` (use grep). Each currently
performs its primary action (open folder / pan page). Update both to
also schedule a layout cache rebuild after the DOM has settled:

```ts
  import { tick } from 'svelte';

  async function handleSpringLoad(folderId: number) {
    openFolderId = folderId;
    await tick();          // wait for InlineFolderExpand to mount its cells
    dragGridHandle?.rebuildLayoutCache();
  }

  async function handleEdgePan(direction: 'prev' | 'next') {
    // existing pager-advance logic ...
    await tick();
    dragGridHandle?.rebuildLayoutCache();
  }
```

(If `tick` is already imported elsewhere in the file, don't double-import.)

- [ ] **Step 5: Type-check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/util/dragGrid.ts web/src/routes/+page.svelte
git commit -m "$(cat <<'EOF'
feat(launchpad): rebuild drag layout cache on spring-load and edge-pan

Layout-changing events mid-drag invalidate the cache; expose
rebuildLayoutCache() and call it from +page.svelte after tick().
EOF
)"
```

---

## Task 9: Manual verification via dev server

**Files:** None modified. Pure verification.

**Goal:** Walk through the full acceptance checklist from the spec
(§9.1 + §9.3) on a real running app.

- [ ] **Step 1: Start backend + frontend**

If the project's standard dev flow uses docker-compose for the Rust
backend, start it first per the project's existing convention:

```bash
docker-compose up -d   # if applicable
cd web && pnpm dev     # foreground; logs in this terminal
```

Open http://127.0.0.1:5173 in a browser.

- [ ] **Step 2: Seed at least 6 root items + 1 folder + 1 nested item**

Use the existing admin UI (`?admin=1` or whatever the project supports)
to create test cards. If existing dev data is sufficient, use that.

- [ ] **Step 3: Run the spec §9.1 manual verification checklist**

For each item below, perform the gesture and verify the visible result
matches the description. Tick off as you go.

- [ ] Drag root card across row. Surrounding cards visibly shift to
      make a gap following the cursor. **No halo** on any card during
      quick movement.
- [ ] Drag root card directly on top of another item card and stop.
      Within ~200 ms a faint halo appears on target. Within ~600 ms it
      fully brightens (scale 1.06 + strong shadow). Release: folder
      created (toast confirmation).
- [ ] Drag root card on top of another item, stop briefly (< 200 ms),
      then move away. **No halo flicker** during the brief stop. Move
      to between two other cards. Release: reorder committed at the
      visible gap.
- [ ] Drag root card on top of an existing folder card. Halo appears
      immediately (no dwell — folders go straight to ready). Release:
      card becomes child of that folder.
- [ ] Drag root card on top of a folder card and **hold for 500 ms**.
      Folder panel opens (existing spring-load). Release inside panel:
      card is added to that folder at insertion point with shift
      preview visible inside the panel.
- [ ] Drag a card from inside a folder panel out to the root grid.
      Root cards shift to make a gap at insertion point. Source
      zone (folder panel) shows its cards close ranks. Release: card
      moves to root.
- [ ] Drag from inside a folder panel and drop on empty area outside
      any zone (`outOfZone`). Card moves to root end (existing branch 4
      of `handleDrop`).
- [ ] During drag, source's slot stays visibly empty (gap shown) at
      its original position when in source zone, or "closed" when
      cursor is in another zone.
- [ ] After releasing, all cards animate to final positions smoothly
      (no jump-and-snap) over ~220 ms.

- [ ] **Step 4: Run §9.3 regression checks**

- [ ] Type a search query in the search box. Drag is disabled — no
      jiggle, no halo, no shifts on attempting drag.
- [ ] Drag near left/right viewport edge for ≥ 600 ms. Page advances
      via existing edge-pan; after page change, cards animate to new
      layout and shift preview restarts.
- [ ] Log out. Long-press any card. Jiggle mode does not enter
      (`sessionStore.authed === false`).
- [ ] Out of jiggle mode: click a card body. Page navigates as before.
- [ ] In jiggle mode: click the `−` (delete) button on a card. Confirm
      dialog appears; the click did not start a drag.

- [ ] **Step 5: Touch verification (optional)**

If you have a touch device or use Chrome DevTools touch emulation:
re-run §9.1 checklist on touch input. Pointer Events should give
identical behavior; flag any divergence as a bug.

- [ ] **Step 6: Final lint + test sweep**

```bash
cd web && pnpm lint && pnpm check && pnpm test:unit
```

Expected: all pass. Fix any warnings before moving on.

- [ ] **Step 7: No commit (verification only)**

This task produces no code changes. If verification surfaces a bug,
loop back to the relevant earlier task, fix, and re-run §9.1.

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Implemented in task |
|--------------|---------------------|
| 3.1 Reorder shifts | Task 5 (publishShifts), Task 7 (CSS transition) |
| 3.2 Merge dwell timeline (200 ms armed, 600 ms ready) | Task 4 (helpers), Task 5 (applyHover wiring), Task 7 (two halo classes) |
| 3.3 Folder targets — instant merge + spring-load | Task 5 (`setMergeImmediateForFolder`, kept spring-load logic) |
| 3.4 Cross-zone shifts | Task 2 (computeShifts cross-zone branch), Task 8 (rebuild on spring-load) |
| 3.5 Folder source — reorder only | Inherited from existing `handleDrop` branch 2 + `setMergeImmediate` only fires for kind=folder targets |
| 4.1 LayoutCache | Task 3 (builder), Task 4 (session field), Task 5 (build at lift) |
| 4.2 DragSession state additions | Task 4 |
| 4.3 Hit-test live `elementsFromPoint` | Task 5 (`computeHover` unchanged in approach) |
| 4.4 Shift computation | Task 2 (pure), Task 5 (integration) |
| 4.5 Dwell state machine | Task 4 (helpers), Task 5 (state-machine entry conditions) |
| 4.6 Drop intent resolution | Task 6 |
| 5 Constants | Task 1 |
| 6 CSS | Task 7 |
| 7 File changes | All tasks combined |
| 8 Risks | Mitigated as listed; rebuild cache covers spring-load/edge-pan |
| 9.1 Manual verification | Task 9 |
| 9.3 Regression | Task 9 |
| 9.4 Unit tests | Task 2, Task 3 |

**Placeholders / TBDs:** none.

**Type consistency check:**
- `MergeCandidate.phase: 'armed' | 'ready'` — used in Task 1 (define),
  Task 4 (set in helpers), Task 7 (read in Card.svelte). Consistent.
- `LayoutCache.byCardId` — defined in Task 3 with `{zone, logicalIdx, rect}`.
  Used in Task 5 (`lc.byCardId.get(target.id)`) and Task 6
  (`s.layoutCache.byCardId.get(t.id)`). Consistent.
- `cellShifts: Writable<Map<number, {dx,dy}>>` — defined in Task 1, set
  in Task 5 (`publishShifts`), cleared in Task 4 (`finish`), read in
  Task 7 (`Card.svelte`). Consistent.
- `computeShifts` signature — defined in Task 2; called in Task 5 with
  matching keys (`sourceZone`, `sourceCardId`, `sourceLogicalIdx`,
  `targetZone`, `dropIdx`, `buckets`, `mergeCollapse`). Consistent.

**Out-of-task items:** none. Plan covers spec end-to-end.
