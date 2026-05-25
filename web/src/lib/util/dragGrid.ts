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
import { mergeCandidate, dragSource } from '$lib/stores/dragMerge';

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
  /** Called on pointerup. Consumer commits the drop. */
  onDrop?: (info: DragDropInfo) => void;
}

const LIFT_THRESHOLD_PX = 5;
const MERGE_INNER_FRACTION = 0.6; // inner 60% of card → merge
const HOVER_DWELL_MS = 500;
const EDGE_PAN_THRESHOLD_PX = 80;
const EDGE_PAN_DWELL_MS = 600;
const EDGE_PAN_INTERVAL_MS = 800;
const CLONE_OPACITY = 0.88;
const CLONE_LIFT_SCALE = 1.05;
const CLONE_ID = '__draggrid_clone__';

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
  dwellTimer: ReturnType<typeof setTimeout> | null;
  dwellTargetId: number | null;
  edgePanTimer: ReturnType<typeof setTimeout> | null;
  edgePanDirection: EdgePanDirection | null;
  hover: DragHoverInfo;
  pointerId: number;
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

  function cellFromEvent(e: PointerEvent): HTMLElement | null {
    if (!(e.target instanceof Element)) return null;
    const cell = e.target.closest('[data-card-id]');
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
      pointerId: e.pointerId
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

    if (next.intent === 'merge' && next.target) {
      mergeCandidate.set({ id: next.target.id, kind: next.target.kind });
    } else {
      mergeCandidate.set(null);
    }

    const isSpringTarget =
      next.intent === 'merge' && next.target?.kind === 'folder' && next.target.id != null;
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
  }

  function cancelDwell() {
    if (!session) return;
    if (session.dwellTimer) {
      clearTimeout(session.dwellTimer);
      session.dwellTimer = null;
    }
    session.dwellTargetId = null;
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
