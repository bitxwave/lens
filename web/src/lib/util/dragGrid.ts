// LaunchPad-style drag for a card canvas.
//
// Why a hand-rolled action instead of a library:
//  - svelte-dnd-action / SortableJS / dnd-kit's Sortable layer all use
//    FLIP shifting: the moment the cursor passes over a target the
//    target slides out of the way. That mechanic actively defeats the
//    "dwell on target" detection LaunchPad needs (drop-on-item creates
//    folder; drop-on-folder spring-loads).
//  - pragmatic-drag-and-drop is headless but built on HTML5 DnD, so iOS
//    Safari touch is broken (open issue #204).
//  - interact.js works but is ~30 KB and the LaunchPad-specific
//    semantics still need writing in callbacks.
//
// So we implement the gesture directly on Pointer Events. Touch comes
// for free (Pointer Events unify mouse / pen / touch). The action is
// attached to a wrapper that contains every drop-receiving card (the
// root grid AND the folder expansion panel when it's open). This lets
// us handle cross-zone drags — e.g. drag from root, spring-load a
// folder, drop inside the now-open panel — without separate actions
// having to coordinate.
//
// Zones: each card cell has [data-card-id] and [data-card-kind]. A
// nearest ancestor [data-zone] disambiguates which container the cell
// belongs to (`root` for the home grid, `folder:<id>` for the panel
// grid). Drop classification is inside-the-target-rect: the inner 60%
// is "merge"; the outer ring is "before" or "after" depending on side.
//
// The action does NOT mutate layout during drag — the source stays in
// its original cell (jiggling) while a position:fixed clone follows
// the cursor. This is what keeps hit-tests reliable.

import { browser } from '$app/environment';
import { mergeCandidate, dragSource, cellShifts } from '$lib/stores/dragMerge';

export type CardKind = 'folder' | 'item';
export type DropIntent = 'merge' | 'before' | 'after';

export interface CardMeta {
  id: number;
  kind: CardKind;
  zone: string; // 'root' | `folder:${number}`
}

export interface DragHoverInfo {
  target: CardMeta | null;
  intent: DropIntent | null;
  /** Cursor is over a known [data-zone] container but not over any card. */
  hoverZone: string | null;
  /** Cursor is outside every [data-zone] (e.g. into the bare backdrop). */
  outOfZone: boolean;
}

export interface DragDropInfo extends DragHoverInfo {
  source: CardMeta;
}

export type EdgePanDirection = 'prev' | 'next';

export interface DragGridOptions {
  /** Drag is gated on this. When false, pointerdown is a no-op. */
  enabled: boolean;
  /**
   * Spring-load callback. Fires when cursor is hovering with merge intent
   * over a folder target for ≥ HOVER_DWELL_MS during an active drag.
   * Consumer typically opens the folder so the user can drop inside it.
   */
  onSpringLoad?: (folderId: number) => void;
  /**
   * Edge-pan callback. Fires when cursor dwells within EDGE_PAN_THRESHOLD_PX
   * of the viewport left/right edge for EDGE_PAN_DWELL_MS during an active
   * drag, then keeps re-firing every EDGE_PAN_INTERVAL_MS until the cursor
   * leaves the edge zone or the drag ends. Consumer typically advances the
   * pager so a card can be dragged across pages.
   */
  onEdgePan?: (direction: EdgePanDirection) => void;
  /**
   * Fires whenever the cursor's current hover zone changes during an
   * active drag (e.g. user drags from a folder panel out onto the
   * root grid). Use it to react to "leaving" a zone — like closing
   * the folder panel when the user starts dragging a card out of it.
   */
  onHoverZoneChange?: (prev: string | null, next: string | null) => void;
  /** Called on pointerup. Consumer commits the drop. May be async; if it
   *  returns a Promise, dragGrid keeps the visual drag state (`cellShifts`,
   *  `data-dragging`, `mergeCandidate`) in place until the Promise resolves,
   *  then clears it in the same microtask as the consumer's data refetch.
   *  This avoids a "snap back to original positions, then snap to new
   *  positions" flicker when the consumer is committing a server-side
   *  reorder. */
  onDrop?: (info: DragDropInfo) => void | Promise<void>;
}

const LIFT_THRESHOLD_PX = 5;
/** Fraction of the target cell area that the dragged card must overlap
 *  for a merge intent to register. Lowered from 0.85 → 0.55: at 0.85
 *  the user had to drop the card almost dead-centre, which felt
 *  unresponsive — they could brush past a target with the cursor
 *  clearly inside it and the halo still wouldn't light. 0.55 keeps
 *  the halo from triggering on a glancing pass (≥ half the target
 *  must be covered) but accepts the natural "I'm hovering over this
 *  one" gesture that humans actually make. */
const MERGE_OVERLAP_FRACTION = 0.55;
/** Arm fires after this dwell. Was 200ms — short enough but the halo
 *  during armed phase was so subtle that users only "felt" the merge
 *  state once ready hit at 600ms. Halved + bumped armed visual weight
 *  so the feedback arrives sooner and is unmistakable. */
const MERGE_ARM_MS = 120;
/** Ready promotes halo to its strongest form. Tightened to 380ms
 *  (was 600) so a deliberate hover converges to the "release now"
 *  prompt within a single perceptual tick after armed shows. */
const MERGE_READY_MS = 380;
/** Pre-arm jitter tolerance. Bumped 8 → 14 — at 8px a steady but
 *  imperfect mouse hold (or trembling finger on touch) was restarting
 *  the timer enough that armed never converged. 14 swallows the
 *  jitter without letting an obvious side-step still count as hover. */
const MERGE_CANCEL_MOVE_PX = 14;
/** Reorder shift transition duration. Exported so callers (e.g. the
 *  page using dragGrid) can set `--shift-duration` on the canvas to
 *  keep CSS in sync. Card.svelte falls back to this value if the var
 *  is unset. Lowered 220ms → 160ms: the shift was visibly lagging
 *  behind cursor movement on quick drags, making the layout feel
 *  rubbery rather than responsive. */
export const SHIFT_DURATION_MS = 160;
// SHIFT_EASE is exposed via CSS variable on Card.svelte; not needed here
const HOVER_DWELL_MS = 500; // existing spring-load (unchanged)
const EDGE_PAN_THRESHOLD_PX = 80;
/** Edge-pan first-fire dwell. 600ms felt unresponsive when the user
 *  reached the edge and had to wait — they'd assume it wasn't going
 *  to advance and back off. 350ms still gives a clear "deliberate"
 *  threshold without feeling stuck. */
const EDGE_PAN_DWELL_MS = 350;
/** Subsequent page-turn cadence after the first fire — long enough
 *  that the user can stop on a target page; was 800ms which felt
 *  sluggish when crossing 3+ pages. */
const EDGE_PAN_INTERVAL_MS = 600;
/** Half-width of the dead zone around a slot's vertical center-line
 *  used by resolveDropIdx to prevent before/after flip-flopping when
 *  the cursor sits right on the center. Without this, natural mouse
 *  jitter around a slot's midpoint would flip `dropIdx` between
 *  `baseIdx` and `baseIdx+1` every rAF tick, and every neighboring
 *  card would jitter one column left/right per flip — visible as the
 *  "cards jumping back and forth" symptom when trying to aim precisely
 *  at a folder or item target. 16px picks up almost all micro-tremor
 *  while still leaving ~70% of a 120px card's width outside the dead
 *  zone (so deliberate side-of-target aiming still responds instantly).
 *  Only engages when the cursor is on the SAME anchor slot as the
 *  previous tick — a fresh slot uses the normal 50/50 half-split. */
const DROP_SIDE_HYSTERESIS_PX = 16;
const CLONE_OPACITY = 0.88;
const CLONE_LIFT_SCALE = 1.05;
const CLONE_ID = '__draggrid_clone__';

export interface SlotRect {
  zone: string; // 'root' | `folder:${number}`
  logicalIdx: number;
  cardId: number;
  kind: CardKind;
  rect: DOMRect;
}

/** Resolved CSS-grid geometry for a single zone. Used by computeShifts'
 *  cross-zone target extrapolation so the last real card wraps to row
 *  N+1 col 0 instead of being pushed off-grid to the right when its
 *  newIdx would land on a new row. Without this, a folder with one
 *  full row at lift time gets a horizontal scrollbar mid-drag — the
 *  shifted card extrapolates by one column-step horizontally and
 *  ends up past the grid's last track. */
export interface GridGeometry {
  /** Number of columns the grid actually creates at lift time. Read
   *  from `getComputedStyle(grid).gridTemplateColumns` which resolves
   *  `repeat(auto-fill, 120px)` to an explicit space-separated list. */
  colCount: number;
  /** row-gap in px (parsed from CSS `gap`). */
  rowGap: number;
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
  /** Optional resolved grid geometry per zone. When present, the
   *  cross-zone target extrapolation wraps to the next row instead
   *  of stepping horizontally past the last column. Tests omit this
   *  and fall back to the legacy single-row col-step behaviour. */
  gridGeometryByZone?: Record<string, GridGeometry>;
  /** When true (merge armed/ready or folder target), all shifts collapse. */
  mergeCollapse: boolean;
}

/**
 * Per-card translation (dx, dy) needed to render reorder preview.
 * Pure: returns the same output for the same input. Skips the source
 * card. Returns an entry only if the card needs a non-zero translation.
 */
export function computeShifts(input: ComputeShiftsInput): Map<number, { dx: number; dy: number }> {
  const result = new Map<number, { dx: number; dy: number }>();
  if (input.mergeCollapse) return result;
  // Defensive: sourceLogicalIdx -1 means source isn't in the cache yet
  // (e.g. between pointerdown and lift). Don't compute shifts.
  if (input.sourceLogicalIdx < 0) return result;

  const { sourceZone, sourceLogicalIdx, targetZone, dropIdx, buckets } = input;

  if (sourceZone === targetZone) {
    const bucket = buckets[targetZone] ?? [];
    // Post-removal semantics: source is display:none and NOT in the
    // bucket (buildLayoutCache skips [data-dragging='true']). The
    // remaining siblings already sit in the compacted CSS-grid
    // positions the user sees.
    //
    // Drop-on-own-slot no-op: dropIdx === sourceLogicalIdx means
    // "insert source back where it lifted from". In post-removal
    // coords that leaves everyone at their current visual position,
    // so no shifts should be emitted. (sourceLogicalIdx is the
    // PRE-removal dataIdx of the source; comparing it to the
    // POST-removal dropIdx is valid here because both are counted
    // from the same start-of-bucket. After the source is removed,
    // every sibling with pre-idx > sourceLogicalIdx has post-idx =
    // pre-idx - 1; inserting source back at post-idx sourceLogicalIdx
    // restores the original ordering.)
    if (sourceLogicalIdx === dropIdx) return result;
    // Target open: slot i in [dropIdx, N-1] shifts one cell to the
    // right to reveal an insertion gap for the incoming source.
    for (const slot of bucket) {
      const i = slot.logicalIdx;
      if (i < dropIdx) continue;
      const newIdx = i + 1;
      const targetSlot = bucket.find((s) => s.logicalIdx === newIdx);
      let dx: number;
      let dy: number;
      if (targetSlot) {
        dx = targetSlot.rect.left - slot.rect.left;
        dy = targetSlot.rect.top - slot.rect.top;
      } else {
        // Trailing slot has nowhere real to shift to; use the shared
        // extrapolator so wrap-aware geometry produces a sensible
        // next-row anchor.
        const tgtGeo = input.gridGeometryByZone?.[targetZone];
        const targetPos = extrapolateSlotPosition(bucket, newIdx, tgtGeo);
        if (!targetPos) continue;
        dx = targetPos.left - slot.rect.left;
        dy = targetPos.top - slot.rect.top;
      }
      result.set(slot.cardId, { dx, dy });
    }
    return result;
  }

  // Cross-zone: only open the target slot. Do NOT close the source
  // zone's gap during the drag — the source's slot stays visibly empty
  // where it lifted from, and neighbours in the source zone stay
  // completely still. This matches Launchpad: when you drag an icon
  // from the home grid into an opened folder, the icons behind you on
  // the home grid do not shuffle around to fill the hole. They only
  // reflow after the drop commits, when the data refetch renders the
  // new order. Keeping the source zone still also stops the "root
  // cards jump while I'm reordering inside a folder" complaint.

  const tgtBucket = buckets[targetZone] ?? [];
  const tgtGeo = input.gridGeometryByZone?.[targetZone];
  /* Per-page root zones ("root:p<idx>") need cross-page wrap when an
   * insertion pushes the last card off the bottom of the page. We
   * can't extrapolate inside the same bucket (that yields a phantom
   * 4th row stuck below the visible page); instead, the overflow card
   * should travel to the FIRST slot of the next page's bucket. The
   * next page is currently transformed off-screen by the pager, so
   * its slot rect is in real screen coords (negative or > viewport)
   * — translating to it visually shows the card "leaving for next
   * page", which is exactly what's about to happen on commit. */
  const pagedRootMatch = /^root:p(\d+)$/.exec(targetZone);
  const nextPageBucket: SlotRect[] | null = pagedRootMatch
    ? (buckets[`root:p${Number(pagedRootMatch[1]) + 1}`] ?? null)
    : null;
  for (const slot of tgtBucket) {
    const i = slot.logicalIdx;
    if (i < dropIdx) continue;
    const newIdx = i + 1;
    // newIdx may be == bucket.length (extrapolated past the last real
    // slot). With grid geometry we can wrap correctly to the next row.
    const targetSlot = tgtBucket.find((s) => s.logicalIdx === newIdx);
    let dx: number;
    let dy: number;
    if (targetSlot) {
      dx = targetSlot.rect.left - slot.rect.left;
      dy = targetSlot.rect.top - slot.rect.top;
    } else if (pagedRootMatch) {
      // Overflowing past this page's rendered slots. Two sub-cases:
      //   a) The next page exists → the overflow card will end up as
      //      slot 0 of that page after commit. Anchor to it so mid-drag
      //      it visually flies off toward the neighbouring page (its
      //      slot rect lives in real screen coords, currently
      //      translated off-screen by the pager).
      //   b) We're on the LAST page and it isn't full (e.g. page has
      //      2 cards and we're inserting at idx 0). newIdx for the
      //      trailing card lands at a slot that's a valid CSS-grid
      //      cell IN THIS SAME PAGE — the next visible column/row.
      //      Extrapolate geometrically so the trailing card slides
      //      into that empty cell, instead of getting stuck (which
      //      leaves the just-shifted first card visually stacked on
      //      top of it).
      const wrapTarget = nextPageBucket?.find((s) => s.logicalIdx === 0);
      if (wrapTarget) {
        dx = wrapTarget.rect.left - slot.rect.left;
        dy = wrapTarget.rect.top - slot.rect.top;
      } else {
        const targetPos = extrapolateSlotPosition(tgtBucket, newIdx, tgtGeo);
        if (!targetPos) continue;
        dx = targetPos.left - slot.rect.left;
        dy = targetPos.top - slot.rect.top;
      }
    } else {
      const targetPos = extrapolateSlotPosition(tgtBucket, newIdx, tgtGeo);
      if (!targetPos) continue;
      dx = targetPos.left - slot.rect.left;
      dy = targetPos.top - slot.rect.top;
    }
    result.set(slot.cardId, { dx, dy });
  }
  return result;
}

/** Predicts the (left, top) of a virtual slot at `newIdx` past the last
 *  real slot in `bucket`. Geometry-aware when `geo` is provided: wraps
 *  to row N+1 col 0 when newIdx crosses a column boundary, which is the
 *  CSS-grid behaviour at drop time. Without geometry, falls back to a
 *  single per-step advance from the last real slot — correct for one
 *  step within the current row, off-grid past it. */
function extrapolateSlotPosition(
  bucket: SlotRect[],
  newIdx: number,
  geo: GridGeometry | undefined
): { left: number; top: number } | null {
  if (bucket.length === 0) return null;
  const slot0 = bucket.find((s) => s.logicalIdx === 0);
  if (!slot0) return null;

  if (geo && geo.colCount > 0) {
    const slot1 = bucket.find((s) => s.logicalIdx === 1);
    const colAdvance = slot1 ? slot1.rect.left - slot0.rect.left : slot0.rect.width;
    // Prefer measuring the row step from an existing 2nd-row slot;
    // when the bucket is single-row, fall back to (cardHeight + rowGap).
    let rowAdvance = 0;
    for (const s of bucket) {
      if (Math.floor(s.logicalIdx / geo.colCount) === 1) {
        rowAdvance = s.rect.top - slot0.rect.top;
        break;
      }
    }
    if (rowAdvance === 0) rowAdvance = slot0.rect.height + geo.rowGap;

    const col = newIdx % geo.colCount;
    const row = Math.floor(newIdx / geo.colCount);
    return {
      left: slot0.rect.left + col * colAdvance,
      top: slot0.rect.top + row * rowAdvance
    };
  }

  // Legacy single-row extrapolation.
  const adv = cellAdvance(bucket);
  if (!adv) return null;
  const lastReal = bucket.reduce((max, s) => (s.logicalIdx > max.logicalIdx ? s : max), bucket[0]);
  const steps = newIdx - lastReal.logicalIdx;
  return {
    left: lastReal.rect.left + adv.dx * steps,
    top: lastReal.rect.top + adv.dy * steps
  };
}

/** Per-step displacement vector between consecutive slot rects in a zone. */
export function cellAdvance(bucket: SlotRect[]): { dx: number; dy: number } | null {
  if (bucket.length < 2) return null;
  const a = bucket.find((s) => s.logicalIdx === 0)?.rect;
  const b = bucket.find((s) => s.logicalIdx === 1)?.rect;
  if (!a || !b) return null;
  return { dx: b.left - a.left, dy: b.top - a.top };
}

export interface CardIdEntry {
  zone: string;
  logicalIdx: number;
  rect: DOMRect;
}

export interface LayoutCache {
  byZone: Map<string, SlotRect[]>; // sorted by logicalIdx
  byCardId: Map<number, CardIdEntry>;
  /** Per-zone displacement vector between consecutive slots. Absent for
   *  zones with <2 cells (single-slot zones can't infer an advance);
   *  callers must handle a missing entry gracefully. */
  cellAdvanceByZone: Map<string, { dx: number; dy: number }>;
  /** Pre-computed `byZone` as a Record for direct use by computeShifts.
   *  Built once at lift / cache rebuild so the per-rAF publishShifts
   *  doesn't reallocate. */
  bucketsRecord: Record<string, SlotRect[]>;
  /** Resolved CSS-grid geometry per zone. Drives wrap-aware extrapolation
   *  in computeShifts. Absent for zones whose grid container can't be
   *  resolved (defensive — callers fall back to legacy col-step). */
  gridGeometryByZone: Record<string, GridGeometry>;
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
  // First pass: collect all cells with rects, grouped by zone. Cells
  // marked `data-dragging='true'` are the active drag source — Card
  // .cell rule sets them to `display: none`, so their rects would be
  // all-zero AND their DOM-order slot would bump every sibling's
  // logicalIdx by 1. Skipping them yields a **post-removal** view:
  // sibling slots' rects reflect the compacted CSS-grid layout the
  // user sees, and their logicalIdx runs 0..N-2 without the source.
  // dropIdx returned from resolveDropIdx and consumed by
  // reorderEntries all live in this same post-removal coordinate
  // system.
  const collected: Array<{ cell: HTMLElement; meta: CardMeta; rect: DOMRect }> = [];
  cells.forEach((cell) => {
    if (cell.dataset.dragging === 'true') return;
    const meta = readMetaFromCell(cell);
    if (!meta) return; // skip add-tile sentinel and malformed
    collected.push({ cell, meta, rect: cell.getBoundingClientRect() });
  });
  // Track one grid-container element per zone (the cell's parent in
  // both root and folder templates is the [data-zone] grid div) so we
  // can read CSS-resolved column count and row gap.
  const gridByZone = new Map<string, HTMLElement>();
  for (const { cell, meta } of collected) {
    if (gridByZone.has(meta.zone)) continue;
    const parent = cell.parentElement;
    if (parent instanceof HTMLElement) gridByZone.set(meta.zone, parent);
  }
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
      kind: item.meta.kind,
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
  // The "+ new item" affordance is hidden visually during an active
  // drag (via CSS rule on .canvas:has([data-card-id][data-dragging])
  // .add-cell { visibility: hidden }), so it doesn't need to be in
  // the layout cache. Keeping it out also avoids the bookkeeping
  // around phantom-slot extrapolation, which couldn't reliably wrap
  // to the next row in CSS auto-fill grids.
  // Per-zone cellAdvance for extrapolation.
  const cellAdvanceByZone = new Map<string, { dx: number; dy: number }>();
  for (const [zone, slots] of byZone) {
    const adv = cellAdvance(slots);
    if (adv) cellAdvanceByZone.set(zone, adv);
  }
  // Pre-build the Record form for computeShifts. Built once here, reused
  // every rAF tick by publishShifts.
  const bucketsRecord: Record<string, SlotRect[]> = {};
  for (const [zone, slots] of byZone) bucketsRecord[zone] = slots;
  // Read CSS-grid geometry per zone for wrap-aware extrapolation.
  const gridGeometryByZone: Record<string, GridGeometry> = {};
  for (const [zone, gridEl] of gridByZone) {
    const cs = getComputedStyle(gridEl);
    // gridTemplateColumns resolves repeat(auto-fill, 120px) to an
    // explicit list like "120px 120px 120px 120px" — count entries.
    const cols = cs.gridTemplateColumns
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean);
    const colCount = cols.length;
    if (colCount <= 0) continue;
    const rowGap = parseFloat(cs.rowGap) || 0;
    gridGeometryByZone[zone] = { colCount, rowGap };
  }
  return { byZone, byCardId, cellAdvanceByZone, bucketsRecord, gridGeometryByZone };
}

/**
 * Pure: is cursorX on the left half of a slot's rect?
 * Center exactly is treated as right-half (so before/after split has a
 * deterministic tie-break).
 */
export function cursorOnLeftHalfOf(rect: DOMRect, cursorX: number): boolean {
  return cursorX < rect.left + rect.width / 2;
}

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
  /** Source cell's physical dimensions captured at lift. Card width
   *  and height don't change mid-drag (responsive breakpoints don't
   *  shift while pointer is held), so we cache once and reuse for
   *  classifyIntent's overlap math. Reading these from layoutCache is
   *  unsafe: rebuildLayoutCache after spring-load runs while the
   *  source's folder panel has been unmounted by onHoverZoneChange,
   *  so the rebuilt cache has no entry for source.id. With that
   *  fallback giving 0×0 dims, classifyIntent's overlapArea falls to
   *  zero and never returns 'merge', so isMergeFolder/isMergeItem
   *  never trip — meaning a release on a folder card after spring-
   *  load reorders next to the folder instead of reparenting into it. */
  sourceLiftWidth: number;
  sourceLiftHeight: number;
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
  /** Hysteresis: cardId of the slot resolveDropIdx picked as nearest on
   *  the previous tick, plus which side (left | right) was chosen.
   *  While the anchor stays the same, side only flips when the cursor
   *  crosses the center by more than DROP_SIDE_HYSTERESIS_PX — kills
   *  the "cards jitter at target" symptom around a slot midpoint. */
  lastDropAnchorCardId: number | null;
  lastDropSide: 'left' | 'right' | null;
}

function readMetaFromCell(cell: HTMLElement): CardMeta | null {
  const idAttr = cell.dataset.cardId;
  const kindAttr = cell.dataset.cardKind;
  if (!idAttr || !kindAttr) return null;
  const id = Number(idAttr);
  if (!Number.isFinite(id) || id < 0) return null; // sentinels (add tile) opt out
  if (kindAttr !== 'folder' && kindAttr !== 'item') return null;
  const zoneEl = cell.closest('[data-zone]') as HTMLElement | null;
  const zone = zoneEl?.dataset.zone ?? 'root';
  return { id, kind: kindAttr, zone };
}

/**
 * Classify the cursor's intent relative to a target slot.
 *
 * Merge requires the dragged card itself to overlap the target by
 * `MERGE_OVERLAP_FRACTION` of the smaller card's area — i.e. the user
 * has visually placed the cards mostly on top of each other. This is
 * stricter than "cursor in inner N% of target" (which fires whenever
 * the cursor brushes the middle, even with the dragged card barely
 * touching).
 *
 * Falls back to before/after by cursor side when overlap is below the
 * threshold.
 */
function classifyIntent(target: DOMRect, dragged: DOMRect, cursorX: number): DropIntent {
  const overlapW = Math.max(
    0,
    Math.min(target.right, dragged.right) - Math.max(target.left, dragged.left)
  );
  const overlapH = Math.max(
    0,
    Math.min(target.bottom, dragged.bottom) - Math.max(target.top, dragged.top)
  );
  const overlapArea = overlapW * overlapH;
  const targetArea = target.width * target.height;
  const draggedArea = dragged.width * dragged.height;
  const minArea = Math.min(targetArea, draggedArea);
  if (minArea > 0 && overlapArea / minArea >= MERGE_OVERLAP_FRACTION) {
    return 'merge';
  }
  return cursorX < target.left + target.width / 2 ? 'before' : 'after';
}

export function dragGrid(
  node: HTMLElement,
  opts: DragGridOptions
): {
  update(next: DragGridOptions): void;
  rebuildLayoutCache(): void;
  destroy(): void;
} {
  let options = opts;
  let session: DragSession | null = null;
  // Tracks the last cellShifts Map written to the store. publishShifts
  // skips writes when the new shifts are value-equal, sparing every Card
  // subscriber a re-render per rAF tick.
  let lastPublishedShifts: Map<number, { dx: number; dy: number }> = new Map();

  function shiftsEqual(
    a: Map<number, { dx: number; dy: number }>,
    b: Map<number, { dx: number; dy: number }>
  ): boolean {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      const w = b.get(k);
      if (!w || w.dx !== v.dx || w.dy !== v.dy) return false;
    }
    return true;
  }

  function setShifts(next: Map<number, { dx: number; dy: number }>) {
    if (shiftsEqual(next, lastPublishedShifts)) return;
    lastPublishedShifts = next;
    cellShifts.set(next);
  }

  function cellFromEvent(e: PointerEvent): HTMLElement | null {
    if (!(e.target instanceof Element)) return null;
    // Only the main .card / .folder button (or its <img> child) starts a
    // drag. Other buttons inside the cell — the delete −, the rename
    // label, the rename input — want their own click semantics, so we
    // bail here. Without this guard pointerdown on those controls would
    // start a drag session and the preventDefault() that follows
    // suppresses their click.
    const handle = e.target.closest('button.card, button.folder');
    if (!handle) return null;
    const cell = handle.closest('[data-card-id]');
    if (!(cell instanceof HTMLElement)) return null;
    if (!node.contains(cell)) return null;
    return cell;
  }

  function onDragStart(e: DragEvent) {
    // HTML5 native drag (e.g. on <img>) preempts PointerEvents and fires
    // pointercancel on the active gesture, which would silently kill our
    // drag mid-stream. Suppress it everywhere inside this zone.
    e.preventDefault();
  }

  function onPointerDown(e: PointerEvent) {
    if (!options.enabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    const meta = readMetaFromCell(cell);
    if (!meta) return;

    // Belt-and-braces: also call preventDefault on pointerdown so the
    // browser doesn't start a native selection / drag interpretation.
    e.preventDefault();

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
      sourceLiftWidth: 0,
      sourceLiftHeight: 0,
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
      mergeArmFired: false,
      lastDropAnchorCardId: null,
      lastDropSide: null
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
  }

  function onPointerMove(e: PointerEvent) {
    if (!session) return;
    if (e.pointerId !== session.pointerId) return;
    session.cursorX = e.clientX;
    session.cursorY = e.clientY;

    if (!session.lifted) {
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (Math.hypot(dx, dy) >= LIFT_THRESHOLD_PX) {
        liftSource(e);
      }
      return;
    }

    if (session.rafToken == null) {
      session.rafToken = requestAnimationFrame(tick);
    }
  }

  function tick() {
    if (!session) return;
    session.rafToken = null;
    if (!session.lifted) return;
    const { cursorX, cursorY, clone } = session;
    if (clone) {
      clone.style.transform = `translate(${cursorX - session.cloneOffsetX}px, ${cursorY - session.cloneOffsetY}px) scale(${CLONE_LIFT_SCALE})`;
    }
    const next = computeHover(session);
    applyHover(next);
    applyEdgePan(detectEdgePan(cursorX));
  }

  function detectEdgePan(cursorX: number): EdgePanDirection | null {
    if (cursorX <= EDGE_PAN_THRESHOLD_PX) return 'prev';
    if (cursorX >= window.innerWidth - EDGE_PAN_THRESHOLD_PX) return 'next';
    return null;
  }

  function applyEdgePan(direction: EdgePanDirection | null) {
    if (!session) return;
    if (direction === session.edgePanDirection) return;
    cancelEdgePan();
    if (!direction) return;
    session.edgePanDirection = direction;
    const repeat = () => {
      if (!session || session.edgePanDirection !== direction) return;
      options.onEdgePan?.(direction);
      session.edgePanTimer = setTimeout(repeat, EDGE_PAN_INTERVAL_MS);
    };
    session.edgePanTimer = setTimeout(repeat, EDGE_PAN_DWELL_MS);
  }

  function cancelEdgePan() {
    if (!session) return;
    if (session.edgePanTimer) {
      clearTimeout(session.edgePanTimer);
      session.edgePanTimer = null;
    }
    session.edgePanDirection = null;
  }

  function liftSource(e: PointerEvent) {
    if (!session) return;
    const r = session.sourceCell.getBoundingClientRect();
    session.cloneOffsetX = e.clientX - r.left;
    session.cloneOffsetY = e.clientY - r.top;
    session.sourceLiftWidth = r.width;
    session.sourceLiftHeight = r.height;

    const clone = session.sourceCell.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-card-id');
    clone.removeAttribute('data-card-kind');
    clone.id = CLONE_ID;
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '9999';
    clone.style.opacity = String(CLONE_OPACITY);
    clone.style.transition = 'none';
    clone.style.transformOrigin = 'top left';
    // Initial clone position anchors to the current CURSOR, not the
    // source cell's original rect. The source is about to be removed
    // from CSS layout (display:none via [data-dragging]), so its
    // siblings will slide forward to fill the gap. If the clone
    // stayed at the source's original screen coords, it would visually
    // overlay whichever sibling just moved into that slot — the user
    // would see "the source is still here", indistinguishable from
    // the un-lifted state. Positioning at cursor immediately produces
    // the "held card is at my finger, not in the grid" affordance.
    clone.style.transform = `translate(${e.clientX - session.cloneOffsetX}px, ${e.clientY - session.cloneOffsetY}px) scale(${CLONE_LIFT_SCALE})`;
    document.body.appendChild(clone);

    // Two-phase cache build so we capture BOTH the source's pre-removal
    // dataIdx AND the post-removal geometry the compacted grid presents
    // to the drag interaction:
    //   1. preCache includes source (data-dragging not set yet) so we
    //      can read sourceLogicalIdx (used for "drop on own slot →
    //      no-op" detection and cross-zone renumber in +page.svelte).
    //   2. Set data-dragging='true' — CSS sends the source cell to
    //      display:none, browser reflows the grid, neighbours slide
    //      forward and close the gap.
    //   3. Rebuild layoutCache now that the compacted layout is
    //      final: getBoundingClientRect reads post-reflow positions,
    //      and buildLayoutCache skips the dragging cell so sibling
    //      slots take idx 0..N-2 (post-removal numbering matching the
    //      reorderEntries `bucket.filter(!source)` view).
    const preCache = buildLayoutCache(node);
    const preEntry = preCache.byCardId.get(session.source.id);
    session.sourceLogicalIdx = preEntry?.logicalIdx ?? 0;

    session.sourceCell.dataset.dragging = 'true';
    session.layoutCache = buildLayoutCache(node);
    session.lifted = true;
    session.clone = clone;

    try {
      session.sourceCell.setPointerCapture(session.pointerId);
    } catch {
      /* some browsers reject capture after handler returns; window listeners cover us */
    }

    dragSource.set({ id: session.source.id, kind: session.source.kind });
  }

  function computeHover(s: DragSession): DragHoverInfo {
    const { cursorX, cursorY, source } = s;
    // The dragged card's current screen rect — needed for overlap-based
    // merge classification. Width/height come from the lift-time snapshot
    // (s.sourceLiftWidth/Height), not from layoutCache: after spring-
    // load rebuilds the cache, the source's folder panel has already
    // been unmounted by onHoverZoneChange, so byCardId.get(source.id)
    // returns undefined. Card dimensions don't change mid-drag anyway,
    // so the lift-time values are the right reference for the entire
    // session. Position still comes from cursor + cloneOffset because
    // the dragged clone follows the cursor.
    const draggedRect = new DOMRect(
      cursorX - s.cloneOffsetX,
      cursorY - s.cloneOffsetY,
      s.sourceLiftWidth,
      s.sourceLiftHeight
    );
    const stack = document.elementsFromPoint(cursorX, cursorY);
    let hoverZone: string | null = null;
    for (const el of stack) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.id === CLONE_ID) continue;
      // Track the topmost zone we cross even when no card is hit.
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
      // Zone gate: elementsFromPoint returns the FULL stack under the
      // cursor, including cards visually covered by an overlaying panel
      // (folder expansion, dialog, etc.). Without this gate, hovering
      // inside an open folder panel over its blurred backdrop would
      // still surface the root card beneath as a target, which then
      // flipped hoverZone to root, tore down the folder mid-drag, and
      // triggered a spurious folder→root reparent on release. Only
      // accept a target whose zone matches the topmost hoverZone we
      // already resolved from the same stack.
      if (hoverZone != null && meta.zone !== hoverZone) continue;
      const r = cell.getBoundingClientRect();
      const intent = classifyIntent(r, draggedRect, cursorX);
      return { target: meta, intent, hoverZone: meta.zone, outOfZone: false };
    }
    return {
      target: null,
      intent: null,
      hoverZone,
      outOfZone: hoverZone == null
    };
  }

  function applyHover(next: DragHoverInfo) {
    if (!session) return;
    const prev = session.hover;
    session.hover = next;

    if (prev.hoverZone !== next.hoverZone) {
      options.onHoverZoneChange?.(prev.hoverZone, next.hoverZone);
    }

    // --- Merge dwell state machine ---
    // Item targets need a 200ms arm gate. Folder targets are immediate.
    // Folders can't be nested inside other cards (folder source can
    // only ever be reordered), so we only arm merge candidates when
    // the source is an item.
    //
    // Both also gate on target being a root zone. Inside an open folder
    // panel a "merge" cursor is ambiguous (you can't nest folders, and
    // every child is already in a folder), so the drop handler in
    // +page.svelte coerces merge→before/after there. We mirror that
    // here so the halo never lights up on a target the drop won't
    // honour — otherwise the user sees a blue ring promising auto-
    // folder while a release silently reorders instead.
    //
    // NOTE: zone "root" got split into per-page "root:p<idx>" by
    // +page.svelte to fix cross-page shift math. startsWith('root')
    // recognises both the legacy single-bucket form and the new
    // per-page form so merge arming + halo work in either layout.
    const sourceIsItem = session.source.kind === 'item';
    const targetInRoot = next.target?.zone.startsWith('root') ?? false;
    const isMergeItem =
      sourceIsItem &&
      next.intent === 'merge' &&
      next.target?.kind === 'item' &&
      next.target.id != null &&
      targetInRoot;
    const isMergeFolder =
      sourceIsItem &&
      next.intent === 'merge' &&
      next.target?.kind === 'folder' &&
      next.target.id != null &&
      targetInRoot;

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

    // --- Spring-load (folder panel auto-open) ---
    // Fires when an item-card source dwells on a folder-kind target. We
    // intentionally do NOT restrict by source.zone: dragging a child
    // card from one folder to another folder in root needs the second
    // folder to spring open the same way root→folder does. When the
    // source folder's panel is still mounted, the cursor is physically
    // inside the panel (fixed-position, z-index 80+) and
    // elementsFromPoint never resolves to a root folder card behind it,
    // so spring-load can't accidentally fire on the wrong target. Once
    // the cursor crosses out, onHoverZoneChange unmounts that panel,
    // root becomes hit-testable, and dwell on the new folder card
    // re-opens correctly.
    const isSpringTarget =
      next.intent === 'merge' &&
      next.target?.kind === 'folder' &&
      next.target.id != null &&
      session.source.kind === 'item';
    const sameTarget = prev.target?.id === next.target?.id && prev.intent === next.intent;
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

  // Hot path: runs every rAF tick during a drag. Recomputes per-card
  // shifts; setShifts skips redundant store writes when the result is
  // value-equal to the previous tick.
  //
  // Anchor selection: instead of relying on elementsFromPoint to hit a
  // specific cell, we always pick the slot closest to the cursor (in
  // the current hover zone). This keeps the gap responsive even when
  // the cursor sits in the empty space between cards — where the DOM
  // hit-test would return null and shifts would otherwise stop.
  function publishShifts(next: DragHoverInfo) {
    if (!session || !session.layoutCache) {
      setShifts(new Map());
      return;
    }
    const lc = session.layoutCache;
    const target = next.target;
    // Determine whether merge gate is active (collapse all shifts).
    // Three cases collapse:
    //   1. Folder targets — releasing here is always merge-into-folder.
    //   2. Root item targets after the dwell timer has fired (mergeArmFired
    //      ⇒ release will auto-folder).
    //   3. Item targets inside an open folder panel — the drop handler
    //      coerces merge→before there (no nested folders), so previewing
    //      a moving stack while the cursor sits in the centre would just
    //      twitch between left- and right-half snap predictions and end
    //      with the user seeing a different layout than they aimed at.
    //      Collapsing matches the OLD pre-halo-gate behaviour minus the
    //      blue ring (which is suppressed in applyHover for the same
    //      target.zone reason).
    const mergeCollapse =
      target != null &&
      next.intent === 'merge' &&
      (target.kind === 'folder' || session.mergeArmFired || !target.zone.startsWith('root'));
    if (mergeCollapse) {
      // Don't open an insertion gap, but DO close the source's own
      // gap so its hidden slot doesn't show as a visible empty space
      // between siblings (the source cell stays opacity:0 in its CSS-
      // grid slot to keep the layout cache rect stable, so without
      // this shift you'd see e.g. row-2 PRC and yellow-folder spaced
      // 6× wider than the column gap because source sits between
      // them invisibly).
      setShifts(computeSourceGapClose(session));
      return;
    }

    // Resolve which zone we're computing shifts in.
    //
    // Rules:
    //  1. If the user is actively hovering a specific card (`target`
    //     is non-null), that card's zone wins — this is an explicit
    //     cross-zone drop preview.
    //  2. Otherwise, if hoverZone matches the source's zone, use it
    //     (same-zone reorder).
    //  3. Otherwise (hoverZone is another zone with no card target,
    //     or hoverZone is null), emit no shifts. This is the key
    //     guard against "root cards jump when the cursor drifts out
    //     of an open folder panel": without it, hoverZone flipping
    //     from `folder:X` to `root:pN` would immediately trigger a
    //     root-side reorder preview even though the user hasn't
    //     picked a root target yet.
    let targetZone: string;
    if (target) {
      targetZone = target.zone;
    } else if (next.hoverZone === session.source.zone) {
      targetZone = next.hoverZone;
    } else {
      setShifts(new Map());
      return;
    }

    const dropIdx = resolveDropIdx(targetZone, session.cursorX, session.cursorY);
    if (dropIdx == null) {
      setShifts(new Map());
      return;
    }

    setShifts(
      computeShifts({
        sourceZone: session.source.zone,
        sourceCardId: session.source.id,
        sourceLogicalIdx: session.sourceLogicalIdx,
        targetZone,
        dropIdx,
        buckets: lc.bucketsRecord,
        gridGeometryByZone: lc.gridGeometryByZone,
        mergeCollapse: false
      })
    );
  }

  /** Shifts every non-source slot in the source's own zone whose
   *  logicalIdx is greater than the source's by one slot earlier, so
   *  the source's hidden CSS-grid slot doesn't appear as a visible
   *  gap when shifts are otherwise suppressed (mergeCollapse path).
   *  Same math as computeShifts' cross-zone source-zone close-gap loop,
   *  isolated for callers that want close-only without insertion. */
  function computeSourceGapClose(s: DragSession): Map<number, { dx: number; dy: number }> {
    const result = new Map<number, { dx: number; dy: number }>();
    if (!s.layoutCache) return result;
    if (s.sourceLogicalIdx < 0) return result;
    const srcBucket = s.layoutCache.byZone.get(s.source.zone) ?? [];
    for (const slot of srcBucket) {
      if (slot.cardId === s.source.id) continue;
      const i = slot.logicalIdx;
      if (i <= s.sourceLogicalIdx) continue;
      const newIdx = i - 1;
      const targetSlot = srcBucket.find((sl) => sl.logicalIdx === newIdx);
      if (!targetSlot) continue;
      result.set(slot.cardId, {
        dx: targetSlot.rect.left - slot.rect.left,
        dy: targetSlot.rect.top - slot.rect.top
      });
    }
    return result;
  }

  // Returns the post-removal drop idx in `zone` for a cursor at
  // (cursorX, cursorY), or null when the zone is empty / has only the
  // source itself.
  //
  // Algorithm:
  //   1. Find the non-source slot whose center is nearest the cursor.
  //   2. Decide before/after by which half of that slot the cursor is on.
  //   3. Subtract 1 from the anchor's logicalIdx if (sameZone && source
  //      sits before the anchor), since `dropIdx` is interpreted in the
  //      post-source-removal coordinate system by computeShifts and the
  //      `+page.svelte` `handleDrop` reorderEntries math.
  /** Slot's on-screen rect at the current tick = original layoutCache
   *  rect translated by the currently-published cellShift. Used by
   *  resolveDropIdx / resolveFinalIntent so anchor selection and
   *  before/after side judgement match what the user sees, NOT the
   *  static lift-time layout. Without this, once compaction shifts
   *  neighbours by ±1 column, the cursor visually hovering card X
   *  would still pick the ORIGINAL-position nearest slot (typically a
   *  neighbour), the pick would flip anchor every rAF as the cursor
   *  micro-moved, and cellShifts would emit inconsistent deltas —
   *  visible as "cards jump back and forth" and label overlap after
   *  a few drags. */
  function visualRect(slot: SlotRect): {
    left: number;
    top: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } {
    const shift = lastPublishedShifts.get(slot.cardId);
    const left = slot.rect.left + (shift?.dx ?? 0);
    const top = slot.rect.top + (shift?.dy ?? 0);
    return {
      left,
      top,
      width: slot.rect.width,
      height: slot.rect.height,
      centerX: left + slot.rect.width / 2,
      centerY: top + slot.rect.height / 2
    };
  }

  function resolveDropIdx(zone: string, cursorX: number, cursorY: number): number | null {
    if (!session || !session.layoutCache) return null;
    const slots = session.layoutCache.byZone.get(zone) ?? [];
    let nearest: SlotRect | null = null;
    let nearestVisual: ReturnType<typeof visualRect> | null = null;
    let nearestDist = Infinity;
    for (const slot of slots) {
      if (slot.cardId === session.source.id) continue;
      const vr = visualRect(slot);
      const d = Math.hypot(cursorX - vr.centerX, cursorY - vr.centerY);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = slot;
        nearestVisual = vr;
      }
    }
    if (!nearest || !nearestVisual) {
      // Empty zone (or only source in it) → drop at index 0.
      return 0;
    }
    // Distance gate: bail to "append" only when the cursor is off the
    // grid entirely.
    const cellReach = Math.max(nearestVisual.width, nearestVisual.height) * 1.2;
    if (nearestDist > cellReach) {
      let bucketLen = 0;
      for (const s of slots) {
        if (s.cardId === session.source.id) continue;
        if (s.logicalIdx + 1 > bucketLen) bucketLen = s.logicalIdx + 1;
      }
      // Anchor lost while far from any card — reset hysteresis so a
      // fresh approach starts with the normal half-split.
      session.lastDropAnchorCardId = null;
      session.lastDropSide = null;
      return bucketLen;
    }

    // Side choice with hysteresis. Center comes from the VISUAL rect
    // (post-shift) so a card that just slid one column left is judged
    // against its new midline, not its original one.
    const centerX = nearestVisual.centerX;
    const sameAnchor = session.lastDropAnchorCardId === nearest.cardId;
    let side: 'left' | 'right';
    if (sameAnchor && session.lastDropSide) {
      if (session.lastDropSide === 'left') {
        side = cursorX > centerX + DROP_SIDE_HYSTERESIS_PX ? 'right' : 'left';
      } else {
        side = cursorX < centerX - DROP_SIDE_HYSTERESIS_PX ? 'left' : 'right';
      }
    } else {
      side = cursorX < centerX ? 'left' : 'right';
    }
    session.lastDropAnchorCardId = nearest.cardId;
    session.lastDropSide = side;

    // layoutCache is post-removal (buildLayoutCache skips the dragging
    // source), so nearest.logicalIdx is already in the coordinate
    // system that reorderEntries.insertAt consumes (`without = bucket
    // .filter(!source)`). No sourceLogicalIdx compensation needed.
    return side === 'left' ? nearest.logicalIdx : nearest.logicalIdx + 1;
  }

  function cancelDwell() {
    if (!session) return;
    if (session.dwellTimer) {
      clearTimeout(session.dwellTimer);
      session.dwellTimer = null;
    }
    session.dwellTargetId = null;
  }

  // Internal: clear timers + arming state, but leave mergeCandidate alone.
  // Used when transitioning into a NEW merge candidate (e.g. swapping
  // targets) so subscribers don't see a transient null pulse.
  function clearMergeArmInternal() {
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
  }

  function cancelMergeArm() {
    clearMergeArmInternal();
    mergeCandidate.set(null);
  }

  function startMergeArmForItem(targetId: number, kind: CardKind) {
    if (!session) return;
    // Switching targets: clear previous candidate so any subscriber sees
    // null in between (matches reorder semantics — no card is "merging").
    cancelMergeArm();
    session.mergeArmTargetId = targetId;
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
    // Folders go straight to ready — skip the null-pulse that
    // cancelMergeArm would emit, since subscribers should transition
    // directly from prior state to this folder being ready.
    clearMergeArmInternal();
    session.mergeArmTargetId = targetId;
    session.mergeArmFired = true;
    mergeCandidate.set({ id: targetId, kind: 'folder', phase: 'ready' });
  }

  function onPointerUp(e: PointerEvent) {
    if (!session) return;
    if (e.pointerId !== session.pointerId) return;
    finish(false);
  }

  function onPointerCancel(e: PointerEvent) {
    if (!session) return;
    if (e.pointerId !== session.pointerId) return;
    finish(true);
  }

  function resolveFinalIntent(s: DragSession): DragHoverInfo {
    const t = s.hover.target;
    if (s.mergeArmFired && t) {
      return { ...s.hover, intent: 'merge' };
    }
    if (s.hover.intent === 'merge' && t && t.kind === 'item') {
      if (!s.layoutCache) return { ...s.hover, intent: 'after' };
      const slot = s.layoutCache.byZone.get(t.zone)?.find((r) => r.cardId === t.id);
      if (!slot) return { ...s.hover, intent: 'after' };
      // Use the target's visual rect (original + current cellShift) so
      // before/after resolution matches what the user sees. Reading
      // slot.rect alone would compare cursor against the pre-shift
      // midpoint and misjudge sides after any compaction.
      const vr = visualRect(slot);
      const intent: DropIntent = s.cursorX < vr.centerX ? 'before' : 'after';
      return { ...s.hover, intent };
    }
    // No target was hit by elementsFromPoint, but the cursor is still
    // inside a known zone (e.g. between two cards). Synthesize the
    // closest non-source slot so handleDrop has something to anchor on.
    // Without this, drops in the gaps between cards silently no-op.
    if (!t && s.hover.hoverZone && s.layoutCache) {
      const slots = s.layoutCache.byZone.get(s.hover.hoverZone) ?? [];
      let nearest: SlotRect | null = null;
      let nearestVisual: ReturnType<typeof visualRect> | null = null;
      let nearestDist = Infinity;
      for (const slot of slots) {
        if (slot.cardId === s.source.id) continue;
        const vr = visualRect(slot);
        const d = Math.hypot(s.cursorX - vr.centerX, s.cursorY - vr.centerY);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = slot;
          nearestVisual = vr;
        }
      }
      if (nearest && nearestVisual) {
        const intent: DropIntent = s.cursorX < nearestVisual.centerX ? 'before' : 'after';
        return {
          ...s.hover,
          target: { id: nearest.cardId, kind: nearest.kind, zone: nearest.zone },
          intent
        };
      }
    }
    return s.hover;
  }

  function finish(canceled: boolean) {
    if (!session) return;
    const s = session;
    session = null;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);

    if (s.rafToken != null) cancelAnimationFrame(s.rafToken);
    if (s.dwellTimer) clearTimeout(s.dwellTimer);
    if (s.edgePanTimer) clearTimeout(s.edgePanTimer);
    if (s.mergeArmTimer) clearTimeout(s.mergeArmTimer);
    if (s.mergeReadyTimer) clearTimeout(s.mergeReadyTimer);

    if (s.clone) {
      s.clone.remove();
      s.clone = null;
    }

    try {
      s.sourceCell.releasePointerCapture(s.pointerId);
    } catch {
      /* ignore */
    }

    // Visual drag state (cellShifts, data-dragging, mergeCandidate,
    // dragSource) is the union of "what the user sees mid-drag" and
    // must stay coherent with the data the cards bind to. If we tear
    // it down synchronously while the consumer is still committing a
    // server-side reorder, the cells snap back to their pre-drag
    // logical positions, then snap forward to the new positions when
    // the refetch lands — a visible double flicker on the dropped
    // card and its neighbors.
    //
    // Strategy: cleanupVisualState below clears all of it in one
    // microtask. We run it either (a) immediately for a canceled drag
    // / synchronous onDrop, or (b) after onDrop's Promise resolves —
    // which by convention means the consumer has finished both the
    // server roundtrip and the store refetch, so the next Svelte
    // render flush will see new data AND cleared shifts in the same
    // pass. No flicker.
    const cells =
      s.lifted && !canceled ? Array.from(node.querySelectorAll<HTMLElement>('[data-card-id]')) : [];
    // While we wait, suppress transitions on the cells so the eventual
    // shift-clear is an instant snap rather than a 220ms slide. With
    // Strategy (b) the snap is invisible because data + shifts clear
    // in lockstep.
    for (const cell of cells) cell.style.transition = 'none';

    const cleanupVisualState = () => {
      delete s.sourceCell.dataset.dragging;
      mergeCandidate.set(null);
      dragSource.set(null);
      cellShifts.set(new Map());
      lastPublishedShifts = new Map();
      if (cells.length) {
        // Two rAF frames is empirically enough for the data render to
        // flush before we restore transitions.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const cell of cells) cell.style.transition = '';
          });
        });
      }
    };

    if (s.lifted && !canceled) {
      const result = options.onDrop?.({
        source: s.source,
        ...resolveFinalIntent(s)
      });
      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).then(cleanupVisualState, cleanupVisualState);
        return;
      }
    }
    cleanupVisualState();
  }

  if (browser) {
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('dragstart', onDragStart);
  }

  return {
    update(next: DragGridOptions) {
      options = next;
    },
    /** Rebuilds the layout cache. Callers (page-level callbacks) invoke
     *  this after layout-changing events (spring-load, edge-pan) so
     *  subsequent ticks have correct slot rects. No-op when no drag is
     *  active. */
    rebuildLayoutCache() {
      if (session?.lifted) {
        session.layoutCache = buildLayoutCache(node);
        const srcEntry = session.layoutCache.byCardId.get(session.source.id);
        session.sourceLogicalIdx = srcEntry?.logicalIdx ?? session.sourceLogicalIdx;
      }
    },
    destroy() {
      if (browser) {
        node.removeEventListener('pointerdown', onPointerDown);
        node.removeEventListener('dragstart', onDragStart);
      }
      if (session) finish(true);
    }
  };
}
