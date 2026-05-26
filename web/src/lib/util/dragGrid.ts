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
  /** Called on pointerup. Consumer commits the drop. */
  onDrop?: (info: DragDropInfo) => void;
}

const LIFT_THRESHOLD_PX = 5;
const MERGE_INNER_FRACTION = 0.5; // tighter (was 0.6) — dwell-gated, can be smaller
const MERGE_ARM_MS = 200; // arm fires (release ≥ here = merge)
const MERGE_READY_MS = 600; // ready halo strengthens
const MERGE_CANCEL_MOVE_PX = 8; // jitter tolerance during pre-arm
const SHIFT_DURATION_MS = 220;
// SHIFT_EASE is exposed via CSS variable on Card.svelte; not needed here
const HOVER_DWELL_MS = 500; // existing spring-load (unchanged)
const EDGE_PAN_THRESHOLD_PX = 80;
const EDGE_PAN_DWELL_MS = 600;
const EDGE_PAN_INTERVAL_MS = 800;
const CLONE_OPACITY = 0.88;
const CLONE_LIFT_SCALE = 1.05;
const CLONE_ID = '__draggrid_clone__';

export interface SlotRect {
  zone: string; // 'root' | `folder:${number}`
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
export function computeShifts(input: ComputeShiftsInput): Map<number, { dx: number; dy: number }> {
  const result = new Map<number, { dx: number; dy: number }>();
  if (input.mergeCollapse) return result;
  // Defensive: sourceLogicalIdx -1 means source isn't in the cache yet
  // (e.g. between pointerdown and lift). Don't compute shifts.
  if (input.sourceLogicalIdx < 0) return result;

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
  // Pre-build the Record form for computeShifts. Built once here, reused
  // every rAF tick by publishShifts.
  const bucketsRecord: Record<string, SlotRect[]> = {};
  for (const [zone, slots] of byZone) bucketsRecord[zone] = slots;
  return { byZone, byCardId, cellAdvanceByZone, bucketsRecord };
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

function classifyIntent(r: DOMRect, x: number, y: number): DropIntent {
  const cx = (x - r.left) / r.width;
  const cy = (y - r.top) / r.height;
  const inner = (1 - MERGE_INNER_FRACTION) / 2; // 0.2 if fraction=0.6
  if (cx >= inner && cx <= 1 - inner && cy >= inner && cy <= 1 - inner) {
    return 'merge';
  }
  return cx < 0.5 ? 'before' : 'after';
}

export function dragGrid(node: HTMLElement, opts: DragGridOptions) {
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
    clone.style.transform = `translate(${r.left}px, ${r.top}px) scale(${CLONE_LIFT_SCALE})`;
    document.body.appendChild(clone);

    session.layoutCache = buildLayoutCache(node);
    const srcEntry = session.layoutCache.byCardId.get(session.source.id);
    session.sourceLogicalIdx = srcEntry?.logicalIdx ?? 0;

    session.sourceCell.dataset.dragging = 'true';
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
      const r = cell.getBoundingClientRect();
      const intent = classifyIntent(r, cursorX, cursorY);
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
  function publishShifts(next: DragHoverInfo) {
    if (!session || !session.layoutCache) {
      setShifts(new Map());
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
        setShifts(new Map());
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
      setShifts(new Map());
      return;
    }

    const shifts = computeShifts({
      sourceZone: session.source.zone,
      sourceCardId: session.source.id,
      sourceLogicalIdx: session.sourceLogicalIdx,
      targetZone,
      dropIdx,
      buckets: lc.bucketsRecord,
      mergeCollapse
    });
    setShifts(shifts);
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
    delete s.sourceCell.dataset.dragging;

    try {
      s.sourceCell.releasePointerCapture(s.pointerId);
    } catch {
      /* ignore */
    }

    mergeCandidate.set(null);
    dragSource.set(null);
    // Reset both store and dedup tracker so the next drag session
    // starts from a clean baseline.
    cellShifts.set(new Map());
    lastPublishedShifts = new Map();

    if (s.lifted && !canceled) {
      options.onDrop?.({
        source: s.source,
        ...s.hover
      });
    }
  }

  if (browser) {
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('dragstart', onDragStart);
  }

  return {
    update(next: DragGridOptions) {
      options = next;
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
