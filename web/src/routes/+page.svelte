<script lang="ts">
  import { tick } from 'svelte';
  import { navDataStore } from '$lib/stores/navData';
  import {
    rootCards,
    searchHits,
    hasActiveFilter,
    clearFilters,
    currentSite
  } from '$lib/stores/visible';
  import { jiggleMode } from '$lib/stores/jiggle';
  import { sessionStore } from '$lib/stores/session';
  import { pager } from '$lib/stores/pagerStore';
  import Card from '$lib/components/Nav/Card.svelte';
  import InlineFolderExpand from '$lib/components/Nav/InlineFolderExpand.svelte';
  import JiggleHost from '$lib/components/Nav/JiggleHost.svelte';
  import PageDots from '$lib/components/Nav/PageDots.svelte';
  import EmptyState from '$lib/components/Nav/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ItemEditDialog from '$lib/components/Editor/ItemEditDialog.svelte';
  import NewItemAffordance from '$lib/components/Editor/NewItemAffordance.svelte';
  import { reorderCards, autoFolder, patchCard } from '$lib/api/cards';
  import { toast } from '$lib/components/ui/toast';
  import { ApiError } from '$lib/api/client';
  import { t } from '$lib/i18n/store';
  import type { Card as CardType } from '$lib/types/card';
  import {
    dragGrid,
    type DragDropInfo,
    type DropIntent,
    type EdgePanDirection
  } from '$lib/util/dragGrid';
  import { dragSource } from '$lib/stores/dragMerge';
  import { chunk } from '$lib/util/paginate';

  function describeError(e: unknown): string {
    if (e instanceof ApiError) return e.message ?? e.code;
    if (e instanceof Error) return e.message;
    return $t('error.unknown');
  }

  const siteTitle = $derived($navDataStore.bundle?.meta.siteName ?? '');

  let editTarget = $state<CardType | null>(null);
  let createForParentId = $state<number | null>(null);
  let editDialogOpen = $state(false);

  /** Currently expanded folder. null = none. */
  let openFolderId = $state<number | null>(null);

  /** Handle to the dragGrid action so page-level callbacks can rebuild
   *  the layout cache after layout-changing events (spring-load, edge-pan). */
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

  // ──────── Pager (P1: horizontal pages + dot indicator) ────────
  //
  // Page geometry is computed from the live `.pager` rect, NOT from
  // hard-coded breakpoint buckets. Earlier the page size was a function
  // of `window.innerWidth` only (35 / 24 / 20), while the .grid used
  // `repeat(auto-fill, 120px)` — a layout decided independently by the
  // browser from the container's actual width. The two would disagree
  // (e.g. window 1100px → page=35 designed as 7×5, but the grid actually
  // fitted 6 columns), so cards spilled to a 6th row and visually
  // overflowed instead of paginating. We now derive both `cols` and
  // `rows` from the same measured rect and pin the grid's column count
  // explicitly so layout and pagination can never drift apart.

  /** Card cell + gap geometry. Must stay in sync with .grid CSS below
   *  and Card.svelte's .cell width / mobile breakpoint. */
  const CARD_W_DESKTOP = 120;
  const CARD_GAP_X_DESKTOP = 28;
  const CARD_W_MOBILE = 72;
  const CARD_GAP_X_MOBILE = 16;
  /** Cell height ≈ card art (120) + gap-3 (~12) + label line (~20) on
   *  desktop; halved on mobile. We add a small safety margin so a row
   *  partially clipped by the footer doesn't get counted. */
  const CELL_H_DESKTOP = 168;
  const CELL_H_MOBILE = 108;
  const CARD_GAP_Y_DESKTOP = 36;
  const CARD_GAP_Y_MOBILE = 24;

  /** Mobile breakpoint mirrors .grid @media (max-width: 500px). */
  function isMobileWidth(w: number) {
    return w <= 500;
  }

  /** Pager rect — measured live via ResizeObserver. SSR-safe defaults. */
  let pagerWidth = $state(1024);
  let pagerHeight = $state(640);

  /** Maximum grid content width per page. The pager itself spans the
   *  full viewport so the swipe / scroll-snap area feels Launchpad-
   *  sized, but each page's grid stays inside this cap so column
   *  density on a wide monitor doesn't balloon to 10+ columns —
   *  preserving the original ~6-column visual rhythm. Mobile uses a
   *  smaller cap that mirrors the previous mobile bucket. */
  const GRID_MAX_DESKTOP = 1024;
  const GRID_MAX_MOBILE = 360;

  /** Minimum left/right breathing room between the grid edge and the
   *  viewport edge. Without this, when the viewport is at or below
   *  the grid cap (e.g. a 1024-wide window) cards sit flush against
   *  the screen edge and look cramped — see the screenshot the user
   *  sent. Mirrored in CSS via `.page { padding: 0 var(--page-gutter) }`. */
  const PAGE_GUTTER_DESKTOP = 48;
  const PAGE_GUTTER_MOBILE = 16;

  /** Effective grid width — `pagerWidth` clamped to the max cap, AFTER
   *  reserving the safe gutter on both sides. This is the number that
   *  drives `cols`, NOT `pagerWidth` directly: a fullbleed pager
   *  doesn't mean a fullbleed grid. */
  const gridContentWidth = $derived.by(() => {
    const mobile = isMobileWidth(pagerWidth);
    const cap = mobile ? GRID_MAX_MOBILE : GRID_MAX_DESKTOP;
    const gutter = mobile ? PAGE_GUTTER_MOBILE : PAGE_GUTTER_DESKTOP;
    const usable = Math.max(0, pagerWidth - gutter * 2);
    return Math.min(usable, cap);
  });

  /** Columns that fit within the grid's content cap (NOT pager width). */
  const cols = $derived.by(() => {
    const cw = isMobileWidth(pagerWidth) ? CARD_W_MOBILE : CARD_W_DESKTOP;
    const gx = isMobileWidth(pagerWidth) ? CARD_GAP_X_MOBILE : CARD_GAP_X_DESKTOP;
    // (cols * cw) + ((cols - 1) * gx) <= gridContentWidth
    // → cols <= (gridContentWidth + gx) / (cw + gx)
    return Math.max(1, Math.floor((gridContentWidth + gx) / (cw + gx)));
  });

  /** Rows that fit at the current pager height. */
  const rows = $derived.by(() => {
    const mobile = isMobileWidth(pagerWidth);
    const ch = mobile ? CELL_H_MOBILE : CELL_H_DESKTOP;
    const gy = mobile ? CARD_GAP_Y_MOBILE : CARD_GAP_Y_DESKTOP;
    return Math.max(1, Math.floor((pagerHeight + gy) / (ch + gy)));
  });

  const pageSize = $derived(cols * rows);

  /** Inline width for the .grid so its column count tracks `cols`
   *  exactly, instead of relying on auto-fill (which the browser
   *  recomputes from container width independently of `pageSize`). */
  const gridStyle = $derived.by(() => {
    const cw = isMobileWidth(pagerWidth) ? CARD_W_MOBILE : CARD_W_DESKTOP;
    return `grid-template-columns: repeat(${cols}, ${cw}px);`;
  });

  /** Pages of root cards, never empty (chunk yields at least one page). */
  const pages = $derived(chunk($rootCards, pageSize));
  const pageCount = $derived(pages.length);

  // ──────── Pager wiring ────────
  // All animation runs through the `pager` store (see docs/superpowers/
  // specs/2026-07-16-launchpad-pager-physics-design.md). This component
  // is now just an event source + DOM sink: measure the rect, convert
  // px ↔ pages, forward events, translate the track.

  /** Keep the store's page count in sync with reactive derivation. */
  $effect(() => {
    pager.setPageCount(pageCount);
  });

  /** Reset to page 0 whenever the ACTIVE SITE VALUE changes.
   *
   *  Guarded against navDataStore re-emissions: `$currentSite` is
   *  derived from navDataStore, so any refetch() (drag drop, edit
   *  save, etc.) re-emits currentSite even when the site value is
   *  unchanged. Without this guard the effect fired `pager.reset()`
   *  after every drop and the pager jumped back to page 0 mid-edit.
   *  Track the last-seen site value and reset only on a genuine
   *  transition. */
  let lastSiteValue: string | null | undefined = undefined;
  $effect(() => {
    const v = $currentSite.site?.value ?? null;
    if (lastSiteValue === undefined) {
      // First run: latch without resetting (pager starts at 0 anyway).
      lastSiteValue = v;
      return;
    }
    if (v !== lastSiteValue) {
      lastSiteValue = v;
      pager.reset();
    }
  });

  /** Outer pager element — captures wheel/pointer events. */
  let pagerEl = $state<HTMLDivElement | null>(null);
  /** Inner track — the thing we translate3d. */
  let trackEl = $state<HTMLDivElement | null>(null);

  /** Track .pager rect via ResizeObserver (unchanged approach). */
  $effect(() => {
    if (!pagerEl) return;
    const r0 = pagerEl.getBoundingClientRect();
    pagerWidth = r0.width;
    pagerHeight = r0.height;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        pagerWidth = e.contentRect.width;
        pagerHeight = e.contentRect.height;
      }
    });
    ro.observe(pagerEl);
    return () => ro.disconnect();
  });

  /** px → pages helpers. Bound to the live rect. */
  const pxToPages = (px: number): number => (pagerWidth > 0 ? px / pagerWidth : 0);
  const pxPerMsToPagesPerSec = (v: number): number =>
    pagerWidth > 0 ? (v * 1000) / pagerWidth : 0;

  /** Track transform. Reactive on $pager.position and pagerWidth. */
  const trackStyle = $derived(`transform: translate3d(${-$pager.position * pagerWidth}px, 0, 0);`);

  // ──── Wheel handling ─────────────────────────────
  /** Trackpad / mouse-wheel sensitivity multiplier. Kept as a named
   *  knob (not inlined) so future tuning stays a single-line change.
   *  1 = raw wheel delta maps 1:1 to page fraction (baseline).
   *  Values > 1 make trackpad flicks turn pages with less finger
   *  travel; > 3 tends to feel over-eager. Mouse wheel delta per
   *  notch is 100px+, so a single wheel click still turns one page
   *  regardless of gain — the knob is really only felt on trackpad. */
  const WHEEL_GAIN = 1;

  function onWheel(e: WheelEvent) {
    if (!pagerEl) return;
    // Use horizontal delta if present; fall back to vertical (mouse
    // wheel + shift, or vertical-only wheels) so users without a
    // horizontal axis can still page.
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (dx === 0) return;
    e.preventDefault();
    pager.wheel(pxToPages(dx) * WHEEL_GAIN);
  }

  // ──── Pointer handling ───────────────────────────
  /** Distance the pointer must travel before we count it as a pan
   *  (below this, the user is just clicking a card). */
  const POINTER_PAN_THRESHOLD = 8;

  let dragStartX = 0;
  let dragLastX = 0;
  let dragLastTs = 0;
  let dragVelocityPxPerMs = 0;
  let dragActive = false;
  let dragCaptured = false;

  function onPointerDown(e: PointerEvent) {
    if ($jiggleMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragActive = true;
    dragCaptured = false;
    dragStartX = e.clientX;
    dragLastX = e.clientX;
    dragLastTs = performance.now();
    dragVelocityPxPerMs = 0;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragActive || !pagerEl) return;
    const totalDx = e.clientX - dragStartX;
    if (!dragCaptured) {
      if (Math.abs(totalDx) < POINTER_PAN_THRESHOLD) return;
      dragCaptured = true;
      pagerEl.setPointerCapture(e.pointerId);
      // First real pan frame: commit to the gesture.
      pager.beginDrag();
    }
    const now = performance.now();
    const dt = Math.max(1, now - dragLastTs);
    // Velocity: positive = finger toward start = content advancing forward.
    dragVelocityPxPerMs = -((e.clientX - dragLastX) / dt);
    dragLastX = e.clientX;
    dragLastTs = now;

    // Forward the ABSOLUTE delta from the gesture's start. Positive
    // pager delta = content forward, so we negate the pointer dx
    // (finger moves left → content moves right in pager space).
    pager.drag(pxToPages(-totalDx));
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragActive) return;
    if (dragCaptured && pagerEl) {
      try {
        pagerEl.releasePointerCapture(e.pointerId);
      } catch {
        // pointer was already released by the browser — ignore
      }
    }
    const wasCaptured = dragCaptured;
    dragActive = false;
    dragCaptured = false;
    if (!wasCaptured) return; // click, not a pan
    pager.endDrag(pxPerMsToPagesPerSec(dragVelocityPxPerMs));
  }

  /** Keyboard ←/→ / PageUp / PageDown turn pages, but only when no input is focused. */
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
      return;
    if (editDialogOpen || $hasActiveFilter) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      pager.gotoPage($pager.currentPage - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      pager.gotoPage($pager.currentPage + 1);
    }
  }

  const openFolder = $derived(
    openFolderId == null ? null : ($rootCards.find((c) => c.id === openFolderId) ?? null)
  );

  function openEdit(card: CardType) {
    if (card.kind !== 'item') return;
    editTarget = card;
    createForParentId = null;
    editDialogOpen = true;
  }
  function openCreate(parentId: number | null) {
    editTarget = null;
    createForParentId = parentId;
    editDialogOpen = true;
  }

  function onOpenFolder(id: number) {
    openFolderId = id;
  }

  /** Children of a given folder (filtered to visible items for the current site already). */
  const folderChildrenById = $derived(
    new Map<number, CardType[]>(
      ($navDataStore.bundle?.cards ?? [])
        .filter((c) => c.kind === 'folder')
        .map((f) => [
          f.id,
          ($navDataStore.bundle?.cards ?? [])
            .filter((c) => c.parentId === f.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        ])
    )
  );

  async function onSpringLoad(folderId: number) {
    if (openFolderId !== folderId) openFolderId = folderId;
    await tick();
    // InlineFolderExpand's .wrap enters with a 220ms CSS animation
    // (translateY(-8px) scale(0.96) → identity). If we rebuild the
    // layout cache while that's still running, getBoundingClientRect()
    // reads mid-animation coordinates — every child slot's rect is
    // ~8px too high and 4% too small — so resolveDropIdx anchors on
    // stale positions and folder-internal reorder becomes sluggish
    // and misaligned. Wait for the wrap animation to end (or a small
    // timeout as a safety net in case animationend never fires — e.g.
    // reduced-motion, browser bug) before rebuilding.
    await waitFolderPanelSettled();
    dragGridHandle?.rebuildLayoutCache();
  }

  /** Resolves when the current InlineFolderExpand `.wrap` finishes its
   *  entry animation. Safe fallback: 300ms timeout so a missed
   *  animationend can't stall the drag flow forever. */
  function waitFolderPanelSettled(): Promise<void> {
    return new Promise((resolve) => {
      const wrap = document.querySelector('.wrap[data-zone^="folder:"]');
      if (!(wrap instanceof HTMLElement)) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        wrap.removeEventListener('animationend', finish);
        resolve();
      };
      wrap.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 300);
    });
  }

  /** Drag-to-edge auto pager turn (P2). dragGrid fires this while a card
   *  is held near the viewport edge during an active drag.
   *
   *  Rebuild timing is subtle: `pager.gotoPage()` kicks off a spring
   *  animation that takes ~250ms to settle. If we rebuild the layout
   *  cache mid-flight, `getBoundingClientRect()` on each card reads the
   *  live `.track` transform in an interpolated state — every slot rect
   *  lands hundreds of px off from where the user visually sees them.
   *  `resolveDropIdx`'s distance gate (see dragGrid.ts) then declares
   *  every slot "too far" and returns bucket.length (append), which in
   *  the cross-zone path produces zero shifts. Symptom: after edge-pan
   *  the clone keeps tracking the cursor but *no other card ever moves
   *  aside* on the destination page.
   *
   *  Wait until the pager reports it's no longer moving before rebuilding.
   *  During the wait, dragGrid still ticks per rAF against the *previous*
   *  cache — visual shifts freeze briefly, but the clone stays under the
   *  cursor and nothing gets miscomputed. */
  async function onEdgePan(direction: EdgePanDirection) {
    if (direction === 'prev') pager.gotoPage($pager.currentPage - 1);
    else pager.gotoPage($pager.currentPage + 1);
    await waitPagerIdle();
    dragGridHandle?.rebuildLayoutCache();
  }

  /** Resolves when the pager finishes its current spring settle. Used
   *  by onEdgePan to defer layout-cache rebuilds until slot rects are
   *  final. Resolves immediately if the pager is already idle. Yields
   *  first via `tick()` so a `gotoPage()` on the same microtask has
   *  had a chance to flip `isMoving` to true before we subscribe. */
  async function waitPagerIdle(): Promise<void> {
    await tick();
    return new Promise((resolve) => {
      const unsub = pager.subscribe((s) => {
        if (!s.isMoving) {
          unsub();
          resolve();
        }
      });
    });
  }

  /** Hover-zone change hook — Launchpad-style spring-out with dwell.
   *
   *  While a folder panel is open, close it when the cursor has left
   *  the folder zone AND stayed away for the dwell window
   *  (`FOLDER_EXIT_DWELL_MS`). A brief excursion outside the panel —
   *  the natural cursor jitter at the panel edge, or aiming past the
   *  wrap into the backdrop then coming back — will NOT close the
   *  panel. Only a sustained departure does.
   *
   *  Without the dwell, closing fired the instant the cursor grazed a
   *  root card or dead-space zone at the panel edge. Users trying to
   *  reorder inside the folder would see the panel vanish and a root
   *  reorder preview flash for a frame, then have to re-open the
   *  folder to continue — the "root cards jump during folder-internal
   *  reorder" complaint.
   *
   *  Safety while `openFolderId != null`:
   *    - Panel backdrop intercepts root-side pointerdown, so any drag
   *      active with a folder open MUST have started inside the folder.
   *    - handleDrop no longer has a catch-all "source-in-folder + any
   *      root hoverZone → reparent" branch; a mid-drag panel close
   *      cannot cause spurious data mutations.
   *    - Spring-load transitions to `folder:<other>` are filtered out
   *      so they don't close the currently-open folder. */
  const FOLDER_EXIT_DWELL_MS = 220;
  let folderExitTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelFolderExit() {
    if (folderExitTimer != null) {
      clearTimeout(folderExitTimer);
      folderExitTimer = null;
    }
  }

  // If a drag is cancelled (pointercancel, Escape) without hitting
  // handleDrop, dragSource still transitions back to null. Clear the
  // pending folder-exit timer so it can't fire against a stale
  // openFolderId a few hundred ms after the gesture ended.
  $effect(() => {
    if ($dragSource == null) cancelFolderExit();
  });

  function onHoverZoneChange(_prev: string | null, next: string | null) {
    if (openFolderId == null) {
      cancelFolderExit();
      return;
    }
    const myZone = `folder:${openFolderId}`;
    if (next === myZone) {
      // Cursor came back inside the open folder before the dwell fired.
      cancelFolderExit();
      return;
    }
    if (next && next.startsWith('folder:')) {
      // Cursor over a different folder card in root — spring-load will
      // decide whether to swap panels. Do not close on our own.
      cancelFolderExit();
      return;
    }
    // Any other zone (root grid, or null / dead space) is "outside".
    // Schedule a close after the dwell; if the cursor returns to our
    // folder in time, cancelFolderExit above will keep the panel open.
    if (folderExitTimer != null) return; // already pending
    folderExitTimer = setTimeout(() => {
      folderExitTimer = null;
      openFolderId = null;
    }, FOLDER_EXIT_DWELL_MS);
  }

  /**
   * Compute the new sort_order list for a bucket after inserting `sourceId`
   * at slot `insertAt`. Returns ReorderEntry[] for `/api/cards/reorder`.
   */
  function reorderEntries(
    bucket: CardType[],
    sourceId: number,
    insertAt: number,
    parentId: number | null
  ) {
    const without = bucket.filter((c) => c.id !== sourceId);
    const idx = Math.max(0, Math.min(insertAt, without.length));
    const sourceCard = bucket.find((c) => c.id === sourceId);
    const ordered = sourceCard
      ? [...without.slice(0, idx), sourceCard, ...without.slice(idx)]
      : without;
    return ordered.map((c, i) => ({ id: c.id, sortOrder: i, parentId }));
  }

  /** Treat any "root:p<idx>" zone as the flat root bucket. Per-page
   *  zones exist only for dragGrid's per-page shift isolation; the
   *  server / store keeps a single root list. */
  function isRootZone(zone: string): boolean {
    return zone === 'root' || zone.startsWith('root:p');
  }

  function bucketFor(zone: string): CardType[] {
    if (isRootZone(zone)) return $rootCards;
    if (zone.startsWith('folder:')) {
      const fid = Number(zone.slice('folder:'.length));
      return folderChildrenById.get(fid) ?? [];
    }
    return [];
  }

  function parentIdFor(zone: string): number | null {
    if (isRootZone(zone)) return null;
    if (zone.startsWith('folder:')) {
      const fid = Number(zone.slice('folder:'.length));
      return Number.isFinite(fid) ? fid : null;
    }
    return null;
  }

  async function handleDrop(info: DragDropInfo) {
    // Drag is committing (or being cancelled inline) — clear any pending
    // folder-exit dwell so it can't fire against the wrong openFolderId
    // after the refetch swaps state.
    cancelFolderExit();
    const before = $navDataStore.bundle;
    if (!before) return;

    // 1) Drop on a card with merge intent.
    //    Merge gestures (auto-folder, item→folder reparent) only make
    //    sense at the root level — nested folders are not allowed and
    //    inside an open folder a merge cursor is just an imprecise
    //    reorder. So we require the target to be in the root zone for
    //    these two cases. Anything else falls through to before/after
    //    reorder using the cursor side.
    if (info.intent === 'merge' && info.target && isRootZone(info.target.zone)) {
      if (info.source.kind === 'item' && info.target.kind === 'item') {
        // item-on-item at root → autoFolder
        try {
          await autoFolder({
            sourceItemId: info.source.id,
            targetItemId: info.target.id,
            name: $t('home.folder.untitled')
          });
          await navDataStore.refetch();
          toast.success($t('common.save') + ' ✓');
        } catch (err) {
          await navDataStore.refetch();
          toast.error(describeError(err));
        }
        return;
      }
      if (info.source.kind === 'item' && info.target.kind === 'folder') {
        // item-on-folder → reparent to that folder.
        try {
          await patchCard(info.source.id, { parentId: info.target.id });
          await navDataStore.refetch();
          toast.success($t('common.save') + ' ✓');
        } catch (err) {
          await navDataStore.refetch();
          toast.error(describeError(err));
        }
        return;
      }
      // Folder-on-anything with merge intent → fall through to reorder.
    }

    // 2) Drop on a card with before/after/merge intent → reorder.
    //    Inside a folder, a merge gesture has no nested-folder meaning;
    //    we coerce it to "insert before target" — the more natural
    //    LaunchPad fallback. (Root-level merge cases are already handled
    //    in branch 1 above and returned early.)
    if (
      info.target &&
      (info.intent === 'before' || info.intent === 'after' || info.intent === 'merge')
    ) {
      // Folder cannot become a child of another folder.
      if (info.source.kind === 'folder' && !isRootZone(info.target.zone)) return;
      const effectiveIntent: DropIntent = info.intent === 'merge' ? 'before' : info.intent;
      const targetZone = info.target.zone;
      const targetBucket = bucketFor(targetZone);
      const targetIdx = targetBucket.findIndex((c) => c.id === info.target!.id);
      if (targetIdx < 0) return;
      // reorderEntries works in the post-source-removal coordinate
      // system. When source sits before target in the same zone,
      // target shifts up by 1 once source is removed; account for that
      // so "before target" actually lands the source just before it
      // (instead of one slot too far right).
      const sourceIdxInTarget = targetBucket.findIndex((c) => c.id === info.source.id);
      const adjustedTargetIdx =
        sourceIdxInTarget >= 0 && sourceIdxInTarget < targetIdx ? targetIdx - 1 : targetIdx;
      const insertAt = effectiveIntent === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
      const parentId = parentIdFor(targetZone);

      // If source moves between zones, the source's previous bucket also
      // needs renumbering. Build entries for both buckets and concat.
      let entries = reorderEntries(
        // Synthesise the moving source into the target bucket (for index math).
        targetBucket.some((c) => c.id === info.source.id)
          ? targetBucket
          : [
              ...targetBucket,
              {
                ...(before.cards.find((c) => c.id === info.source.id) as CardType),
                parentId,
                sortOrder: 0
              }
            ],
        info.source.id,
        insertAt,
        parentId
      );
      /* Cross-zone bucket renumber: only matters when source and
       * target belong to *different parents*. Per-page root zones
       * ("root:p0" vs "root:p1") share the same parent (null), so a
       * cross-page reorder doesn't need a second oldEntries pass —
       * reorderEntries above already covers the whole flat root list. */
      const sameParent = parentIdFor(info.source.zone) === parentId;
      if (info.source.zone !== targetZone && !sameParent) {
        const oldBucket = bucketFor(info.source.zone).filter((c) => c.id !== info.source.id);
        const oldEntries = oldBucket.map((c, i) => ({
          id: c.id,
          sortOrder: i,
          parentId: parentIdFor(info.source.zone)
        }));
        entries = [...entries, ...oldEntries];
      }
      try {
        await reorderCards(entries);
        await navDataStore.refetch();
        // If the drop moved a card out of an open folder to root, close
        // the panel so the just-placed card is visible (otherwise the
        // panel keeps covering the region the user aimed at). Same
        // behaviour the removed catch-all branch used to provide, but
        // only fires on a deliberate root-card target.
        const movedOutOfOpenFolder =
          info.source.zone.startsWith('folder:') &&
          isRootZone(targetZone) &&
          openFolderId === parentIdFor(info.source.zone);
        if (movedOutOfOpenFolder) openFolderId = null;
      } catch (err) {
        await navDataStore.refetch();
        toast.error(describeError(err));
      }
      return;
    }

    // 3) No card target. If hoverZone is a folder zone (cursor in panel
    //    but not on a card) → reparent to that folder, append at end.
    if (info.hoverZone && info.hoverZone.startsWith('folder:')) {
      const fid = Number(info.hoverZone.slice('folder:'.length));
      if (
        Number.isFinite(fid) &&
        info.source.kind === 'item' &&
        info.source.zone !== info.hoverZone
      ) {
        try {
          await patchCard(info.source.id, { parentId: fid });
          await navDataStore.refetch();
          toast.success($t('common.save') + ' ✓');
        } catch (err) {
          await navDataStore.refetch();
          toast.error(describeError(err));
        }
        return;
      }
    }

    // Anything else: no-op. Notably, a source-in-folder release onto the
    // dimmed root area (backdrop empty, or hoverZone happens to resolve
    // to root because the cursor was momentarily over a root grid gap)
    // does NOT reparent the card to root. macOS Launchpad rule: to move
    // a card out of a folder you must release it on a specific
    // destination — a root card (branch 2, before/after) — not on empty
    // space. Releasing on empty space cancels the gesture and the card
    // stays in its folder. This closes the "open folder → drag one card
    // → folder vanishes, root grows a card" trap that the older
    // catch-all fallback used to trigger.
  }
</script>

<svelte:head>
  <title>{siteTitle}</title>
</svelte:head>

{#if $navDataStore.loading && !$navDataStore.bundle}
  <div class="loading">
    <Skeleton width="240px" height="24px" />
    <Skeleton width="180px" height="16px" />
    <Skeleton width="220px" height="16px" />
  </div>
{:else if $navDataStore.error}
  <EmptyState variant="offline" title={$t('error.network.offline')} hint={$navDataStore.error}>
    {#snippet actions()}
      <Button onclick={() => navDataStore.refetch()}>{$t('error.network.retry')}</Button>
    {/snippet}
  </EmptyState>
{:else if $hasActiveFilter}
  <!-- Search mode: flat hits, no folders, no jiggle, no drag. -->
  <section class="grid-wrap">
    {#if $searchHits.length === 0}
      <EmptyState
        variant="search"
        title={$t('nav.empty.search')}
        hint={$t('nav.empty.search.hint')}
      >
        {#snippet actions()}
          <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="grid">
        {#each $searchHits as card (card.id)}
          <Card {card} onEdit={openEdit} />
        {/each}
      </div>
    {/if}
  </section>
{:else if $rootCards.length === 0 && !$sessionStore.authed}
  <EmptyState variant="empty" title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
{:else}
  <!-- Single dragGrid action wraps both the folder panel and the root grid
       so cross-zone drags (e.g. drag from root → spring-loaded panel)
       are owned by one session and dispatched via one handleDrop. -->
  <div
    class="canvas"
    class:drag-active={$dragSource !== null}
    use:dragGridAction={{
      enabled: $jiggleMode && $sessionStore.authed,
      onSpringLoad,
      onEdgePan,
      onHoverZoneChange,
      onDrop: handleDrop
    }}
  >
    {#if openFolder?.kind === 'folder'}
      <InlineFolderExpand
        folder={openFolder}
        onClose={() => (openFolderId = null)}
        onEdit={openEdit}
      />
    {/if}

    <JiggleHost>
      <section class="grid-wrap">
        <div
          class="pager"
          bind:this={pagerEl}
          role="region"
          aria-roledescription="paginated grid"
          aria-label={$t('home.pager.aria')}
          onwheel={onWheel}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          <div class="track" bind:this={trackEl} style={trackStyle}>
            {#each pages as pageCards, pageIdx (pageIdx)}
              <div class="page">
                <!-- Per-page zone id ("root:p<idx>"). dragGrid treats each
                     zone as an independent layout bucket — this keeps the
                     reorder shift animation from trying to "fill" a slot
                     on the off-screen page when dragging across pages.
                     handleDrop maps any "root:p*" zone back to root parent
                     so server-side semantics stay flat (single root list,
                     no nested page concept on the data model). -->
                <div class="grid" data-zone={`root:p${pageIdx}`} style={gridStyle}>
                  {#each pageCards as card (card.id)}
                    <Card
                      {card}
                      folderChildren={card.kind === 'folder'
                        ? (folderChildrenById.get(card.id) ?? [])
                        : []}
                      {onOpenFolder}
                      onEdit={openEdit}
                    />
                  {/each}
                  {#if pageIdx === pages.length - 1 && $sessionStore.authed && ($jiggleMode || $rootCards.length === 0)}
                    <div class="add-cell" data-add-cell>
                      <NewItemAffordance onClick={() => openCreate(null)} />
                    </div>
                    {#if $rootCards.length === 0}
                      <p class="empty-hint">{$t('home.empty.hint')}</p>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
        <PageDots
          {pageCount}
          currentPage={$pager.currentPage}
          onSelect={(i) => pager.gotoPage(i)}
        />
      </section>
    </JiggleHost>
  </div>
{/if}

<svelte:window onkeydown={onKeydown} />

<ItemEditDialog
  bind:open={editDialogOpen}
  target={editTarget}
  defaultParentId={createForParentId}
  onCreated={() => pager.gotoPage(pageCount - 1)}
/>

<style lang="scss">
  /* Launchpad-style fullbleed: the home page deliberately escapes the
   * 1024px max-width that <main> in +layout.svelte imposes on every
   * other route. Cards should breathe across the whole viewport, just
   * like macOS Launchpad — not be squeezed into a centred column.
   *
   * The negative left margin pulls the canvas out of <main>'s
   * horizontally-centred box back to the viewport edge; the explicit
   * 100vw width makes it span the full screen. We use 100% of the
   * inner-window width minus the scrollbar (no horizontal scrollbar
   * appears because the page itself never scrolls horizontally —
   * .pager owns that axis with its own hidden scrollbar). */
  .canvas {
    width: 100vw;
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    align-items: center;
    margin-top: var(--sp-6);
  }
  .grid-wrap {
    width: 100%;
  }
  /* Transform-based pager. The browser does NOT own horizontal scroll
   * here — we listen on wheel/pointer ourselves and translate3d the
   * inner .track. This is the only reliable way to get
   * Launchpad-style 1:1 finger tracking and a unified rAF settle
   * curve; the legacy `overflow-x: auto + scroll-snap-type` route
   * always handed mid-gesture timing back to the UA. */
  .pager {
    width: 100%;
    height: calc(100dvh - 220px);
    min-height: 320px;
    overflow: hidden;
    /* Allow vertical page scroll on touch devices to pass through;
     * we only consume horizontal pans + wheel deltas. */
    touch-action: pan-y;
    position: relative;
  }
  .track {
    display: flex;
    flex-direction: row;
    height: 100%;
    /* Compositor: promote to its own layer so translate3d updates
     * during gestures and the rAF settle never trigger a paint of
     * surrounding chrome (header, gradient backdrop, etc). */
    will-change: transform;
  }
  .page {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    /* 48px desktop / 16px mobile horizontal gutter so cards never sit
     * flush against the viewport edge. Must stay in sync with
     * PAGE_GUTTER_{DESKTOP,MOBILE} in the script. */
    padding: var(--sp-2) 48px;
    box-sizing: border-box;
  }
  @media (max-width: 500px) {
    .page {
      padding: var(--sp-2) 16px;
    }
  }
  /* While dragGrid is lifting a card, kill scroll-snap so the user's
   * pointer-driven drag doesn't fight the browser's snap-to-page.
   * overflow-x stays auto so programmatic scrollTo() (driven by the
   * edge-pan dwell in dragGrid) can still turn pages. The pointer
   * itself is captured by dragGrid, so the user can't accidentally
   * scroll the pager with wheel/touch during the drag.
   *
   * Driven by the .drag-active class (bound to $dragSource) instead of
   * a `:has([data-dragging])` descendant test. When a folder card is
   * dragged out and the cursor leaves the folder zone,
   * onHoverZoneChange unmounts InlineFolderExpand — which detaches the
   * source cell carrying [data-dragging] from the DOM. A descendant
   * `:has()` would lose its match and these rules would silently
   * disengage mid-drag. The store-backed class outlives the unmount. */
  /* Legacy `.canvas.drag-active .pager { scroll-snap-type: none }` and
   * `.pager.scroll-anim` rules removed: the new pager doesn't use
   * native scroll, so neither scroll-snap-type nor scroll-behavior
   * apply to it. Compositor isolation is handled by `.track`'s
   * `will-change: transform`. */
  .grid {
    display: grid;
    /* Column template is set inline by +page.svelte so that `cols` and
     * `pageSize` (rows × cols) come from the same measurement. The
     * fallback below is only used during SSR / before the first
     * ResizeObserver tick. */
    grid-template-columns: repeat(auto-fill, 120px);
    gap: 36px 28px;
    justify-content: center;
    align-content: flex-start;
    width: 100%;
  }
  .add-cell {
    width: 120px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  /* Hide the "+ new item" affordance while a drag is in flight. Real
   * cards may need to shift into the slot the affordance was rendered
   * in (e.g. when reordering pushes the last card down a row); leaving
   * the affordance visible would either overlap a shifted card or
   * leave the affordance half-clipped at the row's edge. visibility
   * (not display:none) preserves its CSS-grid slot, so layout cache
   * rects stay consistent across the lift. See the .drag-active note
   * on the .pager rule above for why this is class-driven, not :has()-
   * driven. */
  .canvas.drag-active .add-cell {
    visibility: hidden;
  }
  /* Hint shown only when the grid is empty; spans the whole grid row so
   * the placeholder card sits centered above its caption. */
  .empty-hint {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--c-card-label);
    opacity: 0.85;
    font-size: var(--fs-sm);
    text-align: center;
  }
  @media (max-width: 500px) {
    .add-cell {
      width: 72px;
    }
  }
  @media (max-width: 500px) {
    /* Mobile keeps narrower gutters; the column template still comes
     * from the inline style so cols/rows agree. */
    .grid {
      gap: 24px 16px;
    }
  }
  /* Source cell visual hiding lives in Card.svelte:.cell[data-dragging]
   * (opacity: 0 + pointer-events: none). That scoped rule wins over any
   * global override here — a stale `opacity: 0.35` global rule used to
   * live in this block and was silently dead code. */

  /* Lock touch scroll on the grid while jiggle mode is active so a
   * drag gesture doesn't double as a page scroll. */
  .canvas.drag-active {
    touch-action: none;
  }
</style>
