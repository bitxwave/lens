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
  import { currentPage } from '$lib/stores/pageStore';
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

  /** Track .pager rect via ResizeObserver. We use $effect (not onMount)
   *  because the pager only enters the DOM after navDataStore loads —
   *  mount fires while we're still showing skeletons and pagerEl is
   *  null. The effect re-runs once `pagerEl` is bound, attaches the
   *  observer, and cleans up if the pager is later unmounted (e.g. when
   *  the user opens search and switches to the flat hit list). */
  $effect(() => {
    if (!pagerEl) return;
    // Seed from the real rect so the first paint already has the right
    // pageSize; otherwise the SSR default leaks through one frame.
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

  /** Pages of root cards, never empty (chunk yields at least one page). */
  const pages = $derived(chunk($rootCards, pageSize));
  const pageCount = $derived(pages.length);

  /** Clamp currentPage to valid range whenever pageCount shrinks. */
  $effect(() => {
    if ($currentPage > pageCount - 1) currentPage.setPage(Math.max(0, pageCount - 1));
  });

  /** Reset to page 0 whenever site changes — old page index makes no sense in a new card set. */
  $effect(() => {
    void $currentSite.site?.value;
    currentPage.reset();
  });

  // ──────── Transform-based pager (Launchpad-style) ────────
  //
  // We replaced the original `overflow-x: auto + scroll-snap-type`
  // approach with a hand-rolled translate3d pager. Here's why:
  //
  //   - Native scroll meant the browser owned animation timing during
  //     wheel/inertial scroll (~150ms snap, opaque curve) and we could
  //     only animate FROM rest with rAF. Mixing the two never felt
  //     smooth — there was always a visible handoff.
  //   - Pure translate3d gives 1:1 finger tracking during the gesture
  //     (matches iOS Springboard / macOS Launchpad behavior per Apple's
  //     docs: tracking ratio = 1.0, no easing while dragging) and lets
  //     the same rAF runloop own both the in-gesture pan AND the
  //     post-release settle, with one consistent curve.
  //   - The settle is velocity-seeded easeOutCubic over ~350ms — so a
  //     fast flick decelerates naturally, a slow drag past the
  //     threshold also lands in ~350ms. No "from rest" speed-up
  //     phase that the user perceives as a separate animation.

  /** Outer pager element — captures wheel/pointer events. */
  let pagerEl = $state<HTMLDivElement | null>(null);
  /** Inner track — the thing we translate3d. */
  let trackEl = $state<HTMLDivElement | null>(null);

  /** Current horizontal offset of the track in px (positive number;
   *  applied as `translate3d(-offsetX, 0, 0)`). 0 = page 0 left edge. */
  let offsetX = $state(0);

  /** True while a settle animation is running. Suppresses the
   *  currentPage→offsetX effect from re-triggering itself. */
  let animating = false;
  let animRaf: number | null = null;

  /** Active gesture state. Pointer pan only — wheel uses a separate,
   *  shorter-lived bookkeeping in onWheel below. */
  let dragActive = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let dragLastX = 0;
  let dragLastTs = 0;
  let dragVelocity = 0; // px/ms, positive = finger moved left = page advancing forward

  /** Wheel-aggregation idle timer (committing a wheel-driven pan to
   *  a page on quiet). */
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let wheelLastTs = 0;
  let wheelLastDelta = 0;
  let wheelStartOffset = 0;
  let wheelGestureActive = false;
  let wheelVelocity = 0;

  /** True while the pager is mid-gesture or mid-rAF. Drives a
   *  `is-scrolling` class on .canvas which lets us turn off heavy
   *  per-frame compositor effects (backdrop-filter, drop shadows on
   *  cards) for the duration. */
  let isScrolling = $state(false);

  function easeOutCubic(t: number) {
    const u = 1 - t;
    return 1 - u * u * u;
  }

  /** Animate offsetX to `idx * pageWidth` with velocity-seeded
   *  easeOutCubic. `vel` is the gesture exit velocity in px/ms; pass
   *  0 for "from rest" (dot click, ←/→ key). */
  function animateToPage(idx: number, vel: number = 0) {
    if (!pagerEl) return;
    const w = pagerEl.clientWidth;
    if (w <= 0) return;
    const target = idx * w;
    const start = offsetX;
    if (Math.abs(start - target) < 0.5 && Math.abs(vel) < 0.05) {
      isScrolling = false;
      return;
    }

    if (animRaf !== null) cancelAnimationFrame(animRaf);
    animating = true;
    isScrolling = true;

    // Distance + velocity → duration. A pure rest jump of one page
    // takes 380ms; a high-velocity flick of the same distance is
    // shortened toward ~220ms (so the deceleration looks like a
    // continuation of the finger's motion, not a separate animation).
    const dist = Math.abs(target - start);
    const baseMs = 220 + Math.min(220, (dist / w) * 220);
    // velocity factor: at 1 px/ms the duration shrinks to 60% of base.
    const velFactor = Math.max(0.55, 1 - Math.min(0.45, Math.abs(vel) * 0.5));
    const DURATION = baseMs * velFactor;

    const startTs = performance.now();
    const startOffset = start;
    const totalDelta = target - start;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / DURATION);
      offsetX = startOffset + totalDelta * easeOutCubic(t);
      if (t < 1) {
        animRaf = requestAnimationFrame(tick);
      } else {
        animRaf = null;
        offsetX = target;
        animating = false;
        isScrolling = false;
      }
    };
    animRaf = requestAnimationFrame(tick);
  }

  /** Effect: keep offsetX in sync with currentPage when changes come
   *  from outside the gesture path (dot click, ←/→, store reset on
   *  site switch, etc). Skipped while a gesture-driven animation is
   *  already running — the gesture handler owns offsetX during that
   *  window. */
  $effect(() => {
    const idx = $currentPage;
    if (animating || dragActive || wheelGestureActive) return;
    queueMicrotask(() => animateToPage(idx, 0));
  });

  /** Effect: when pageCount/pagerWidth change, re-pin offsetX to the
   *  current page's exact pixel boundary so resizes don't leave us at
   *  a half-page offset. */
  $effect(() => {
    if (!pagerEl) return;
    if (animating || dragActive || wheelGestureActive) return;
    void pagerWidth; // dependency
    void pageCount; // dependency
    const w = pagerEl.clientWidth;
    if (w > 0) offsetX = $currentPage * w;
  });

  /** Clamp offsetX to [0, (pageCount-1)*w] with rubber-band resistance
   *  past the edges. Resistance constant 0.55 matches iOS feel.
   *
   *  Formula: displacement = w * over / (over + w / RESISTANCE)
   *
   *  This is the standard Apple rubber-band curve (also known as the
   *  hyperbolic-tangent-style asymptotic damping). It guarantees:
   *    - displacement < over for all over > 0 (true damping, never amplifies)
   *    - displacement → over * RESISTANCE as over → 0 (linear feel near the edge)
   *    - displacement → w as over → ∞ (asymptote at one full page beyond max)
   *
   *  The previous implementation used `(1 - 1/(over/w/RESISTANCE + 1)) * w`,
   *  which can be shown to equal `over * RESISTANCE * w / (over * RESISTANCE + w)`
   *  — i.e. damped by a factor `over * RESISTANCE / (over + w * RESISTANCE^?)` ...
   *  well, the algebra is wrong. Empirically: over=50, w=1000 produced 83 (an
   *  AMPLIFIER, not a damper). Concretely: with the new formula,
   *  over=50  → 27 (vs old 83); over=500 → 268 (vs old 476). Both bounded.
   *  See "深层定位" doc trail in this PR for the worked numbers.
   */
  const RUBBER_BAND_RESISTANCE = 0.55;
  function rubberBand(over: number, w: number): number {
    return (w * over) / (over + w / RUBBER_BAND_RESISTANCE);
  }
  function clampOffset(raw: number): number {
    if (!pagerEl) return raw;
    const w = pagerEl.clientWidth;
    if (w <= 0) return raw;
    const max = (pageCount - 1) * w;
    if (raw < 0) return -rubberBand(-raw, w);
    if (raw > max) return max + rubberBand(raw - max, w);
    return raw;
  }

  /** Decide which page to settle on after a gesture, then animate
   *  there with the gesture's exit velocity. */
  function settleGesture(startOffset: number, currentOffset: number, velocity: number) {
    if (!pagerEl) return;
    const w = pagerEl.clientWidth;
    if (w <= 0) return;
    const startPage = Math.round(startOffset / w);
    const dx = currentOffset - startOffset;

    // Snap policy:
    //   – move past 12% of a page → commit one page in that direction
    //   – fling velocity > 0.35 px/ms → commit one page in that direction
    //   – otherwise → snap back to the start page
    const DISP_THRESHOLD = w * 0.12;
    const FLING_THRESHOLD = 0.35;

    let target = startPage;
    const dir = Math.sign(dx) || Math.sign(velocity);
    if ((Math.abs(dx) >= DISP_THRESHOLD || Math.abs(velocity) >= FLING_THRESHOLD) && dir !== 0) {
      target = startPage + (dir > 0 ? 1 : -1);
    }
    target = Math.max(0, Math.min(pageCount - 1, target));

    currentPage.setPage(target);
    animateToPage(target, velocity);
  }

  // ──── Wheel handling ─────────────────────────────────────────
  // Trackpad horizontal swipes and shift+wheel arrive as `wheel`
  // events. We accumulate deltaX (or deltaY when no horizontal axis
  // is reported) into offsetX during the gesture and settle on the
  // tail of the inertial stream.

  /** Commit threshold: once the cumulative pan within a single wheel
   *  gesture crosses this fraction of the page width, commit a page
   *  turn immediately and reset the gesture's anchor to the new page
   *  edge. The same wheel stream can then keep going to commit further
   *  page turns — this is what gives macOS trackpad inertial momentum
   *  the ability to coast through multiple pages without overshooting
   *  past the last one and rubber-banding back.
   *
   *  Why we need it: a typical macOS trackpad inertial wheel stream
   *  delivers 16 ms-cadence deltaX deltas for ~1–2s after the user's
   *  fingers lift. With a single end-of-stream settle we'd accumulate
   *  the entire 1500–3000 px of inertia into offsetX before snapping,
   *  cap target at startPage ± 1, and visibly bounce back from
   *  whatever was beyond the next page. Committing along the way lets
   *  inertia translate to N consecutive page turns instead of one
   *  page turn plus a giant overshoot. */
  const COMMIT_FRACTION = 0.5;

  function onWheel(e: WheelEvent) {
    if (!pagerEl) return;
    if (animating) {
      if (animRaf !== null) cancelAnimationFrame(animRaf);
      animRaf = null;
      animating = false;
    }

    // Use horizontal delta if present; fall back to vertical (mouse
    // wheel + shift, or vertical-only wheels) so users without a
    // horizontal axis can still page.
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (dx === 0) return;
    e.preventDefault();

    const w = pagerEl.clientWidth;
    if (w <= 0) return;

    const now = performance.now();
    if (!wheelGestureActive) {
      wheelGestureActive = true;
      // Anchor to the CURRENT PAGE'S EDGE, not to whatever offsetX
      // happens to be (e.g. mid-animation if we just cancelled one).
      // Without this the very next settle reads round(offsetX/w) as a
      // half-page index and snaps the wrong direction. The animateToPage
      // below pulls offsetX back to the edge in lockstep.
      wheelStartOffset = $currentPage * w;
      wheelLastTs = now;
      wheelLastDelta = 0;
      wheelVelocity = 0;
      isScrolling = true;
    } else {
      const dt = Math.max(1, now - wheelLastTs);
      wheelVelocity = wheelLastDelta / dt;
      wheelLastTs = now;
    }
    wheelLastDelta = dx;
    offsetX = clampOffset(offsetX + dx);

    // Commit-as-you-go: while inertia is still pumping deltas, fold
    // each crossed page boundary into a real page turn so we don't
    // accumulate a huge mid-gesture offset that has to be snapped back
    // at the end. This is what makes a long trackpad flick advance N
    // pages cleanly instead of overshooting page 1 and rubber-banding.
    //
    // Re-anchor to the CURRENT offsetX (not to the new page's edge):
    // offsetX is mid-animation between the old edge and the new edge,
    // and using it as the next anchor means residual deltas accumulate
    // from "where we are now" rather than from the destination edge.
    // The two practical wins:
    //   1. The next commit threshold is symmetric in either direction,
    //      so a small reverse jitter at the tail of inertia can't trip
    //      a reverse page-turn the way `wheelStart = nextPage*w` would.
    //   2. The settle at gesture end sees a near-zero residual dx, so
    //      it just snaps offsetX back to the (already-committed) page
    //      edge instead of trying to interpret residual rubber-band as
    //      another fling.
    const dxFromAnchor = offsetX - wheelStartOffset;
    if (Math.abs(dxFromAnchor) >= w * COMMIT_FRACTION) {
      const step = dxFromAnchor > 0 ? 1 : -1;
      const nextPage = Math.max(0, Math.min(pageCount - 1, $currentPage + step));
      if (nextPage !== $currentPage) {
        currentPage.setPage(nextPage);
      }
      wheelStartOffset = offsetX;
    }

    if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
    // 80ms quiet window — short enough to feel responsive after the
    // user lifts their fingers, long enough to ride out the tail of
    // macOS inertial wheel deltas.
    wheelIdleTimer = setTimeout(() => {
      wheelGestureActive = false;
      settleGesture(wheelStartOffset, offsetX, wheelVelocity);
    }, 80);
  }

  // ──── Pointer (touch / mouse drag) handling ─────────────────
  // Optional 1:1 finger tracking. Only engaged on touch / pen and
  // primary-button mouse drag. Keyboard / wheel users are unaffected.

  function onPointerDown(e: PointerEvent) {
    // Don't interfere with card clicks or with the drag-grid jiggle
    // editor — those use their own listeners and rely on default
    // pointer events propagation.
    if ($jiggleMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (animating) {
      if (animRaf !== null) cancelAnimationFrame(animRaf);
      animRaf = null;
      animating = false;
    }

    dragActive = true;
    dragStartX = e.clientX;
    dragStartOffset = offsetX;
    dragLastX = e.clientX;
    dragLastTs = performance.now();
    dragVelocity = 0;
    isScrolling = true;
    // Don't capture the pointer here — let card clicks still register
    // for pointer-only displacement under a small threshold (see
    // dragMoveThreshold below). We capture once the user has moved
    // far enough to count as a real pan.
  }

  /** Distance the pointer must travel before we count it as a pan
   *  (and therefore steal future click events). Below this, the user
   *  is just clicking a card. */
  const POINTER_PAN_THRESHOLD = 8;

  let dragCaptured = false;
  function onPointerMove(e: PointerEvent) {
    if (!dragActive || !pagerEl) return;
    const totalDx = e.clientX - dragStartX;
    if (!dragCaptured) {
      if (Math.abs(totalDx) < POINTER_PAN_THRESHOLD) return;
      dragCaptured = true;
      pagerEl.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const dt = Math.max(1, now - dragLastTs);
    // Velocity in px/ms, positive = finger moving toward the start
    // (i.e. content is advancing forward).
    dragVelocity = -((e.clientX - dragLastX) / dt);
    dragLastX = e.clientX;
    dragLastTs = now;
    offsetX = clampOffset(dragStartOffset - totalDx);
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
    if (!wasCaptured) {
      // Click, not a pan — restore is-scrolling and bail.
      isScrolling = false;
      return;
    }
    settleGesture(dragStartOffset, offsetX, dragVelocity);
  }

  /** Inline transform style for the track. Reactive on offsetX. */
  const trackStyle = $derived(`transform: translate3d(${-offsetX}px, 0, 0);`);

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
      currentPage.prev();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      currentPage.next(pageCount - 1);
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
    dragGridHandle?.rebuildLayoutCache();
  }

  /** Drag-to-edge auto pager turn (P2). dragGrid fires this while a card
   *  is held near the viewport edge during an active drag. */
  async function onEdgePan(direction: EdgePanDirection) {
    if (direction === 'prev') currentPage.prev();
    else currentPage.next(pageCount - 1);
    await tick();
    dragGridHandle?.rebuildLayoutCache();
  }

  /** Auto-close the open folder panel as soon as the user drags one of
   *  its children out of the panel rect. The panel + backdrop blur was
   *  obscuring the destination, leaving the user no way to aim at a
   *  specific root slot.
   *
   *  We accept any next zone other than the open folder's own — that
   *  covers both `next === 'root'` (cursor landed on a root card) and
   *  `next === null` (cursor on the backdrop blur with no card under).
   *  The folder panel's .wrap carries data-zone="folder:<id>", so a
   *  cursor still inside the panel — including its .expand padding ring
   *  or the title row above — keeps reading as the open folder zone and
   *  doesn't trip this handler. */
  function onHoverZoneChange(prev: string | null, next: string | null) {
    if (openFolderId == null) return;
    const myZone = `folder:${openFolderId}`;
    if (prev === myZone && next !== myZone) {
      openFolderId = null;
    }
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

    // 4) Source came from a folder, dropped on root (or out of zone).
    if (
      info.source.zone.startsWith('folder:') &&
      ((info.hoverZone && isRootZone(info.hoverZone)) || info.outOfZone)
    ) {
      try {
        await patchCard(info.source.id, { parentId: null });
        await navDataStore.refetch();
        // Closing the panel after the drop completes makes the result visible
        // (otherwise the just-released card stays hidden behind the panel).
        if (openFolderId === parentIdFor(info.source.zone)) openFolderId = null;
        toast.success($t('common.save') + ' ✓');
      } catch (err) {
        await navDataStore.refetch();
        toast.error(describeError(err));
      }
      return;
    }

    // Otherwise: cursor was over the source's own zone with no card hit
    // (empty space) → silent no-op.
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
    class:is-scrolling={isScrolling}
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
        <PageDots {pageCount} currentPage={$currentPage} onSelect={(i) => currentPage.setPage(i)} />
      </section>
    </JiggleHost>
  </div>
{/if}

<svelte:window onkeydown={onKeydown} />

<ItemEditDialog
  bind:open={editDialogOpen}
  target={editTarget}
  defaultParentId={createForParentId}
  onCreated={() => currentPage.setPage(pageCount - 1)}
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
  /* While the user is actively scrolling (gesture in flight, before
   * the rAF settle takes over), kill the same expensive compositor
   * effects. backdrop-filter on a folder card is the single most
   * costly per-frame operation here — repainting the blurred
   * background of 5+ folders on a 100vw pager at 60fps causes
   * visible mid-scroll judder. Box shadows on item cards are also
   * paint-heavy when translated. The card label / silhouette stays
   * fully visible; we only drop the soft halos for the duration of
   * the motion. */
  .canvas.is-scrolling :global(.folder) {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .canvas.is-scrolling :global(.card),
  .canvas.is-scrolling :global(.folder) {
    box-shadow: none !important;
  }
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
  /* When a card is being lifted, fade the original cell so the user
   * sees the clone is the live one. The clone itself follows the cursor. */
  :global([data-card-id][data-dragging='true']) {
    opacity: 0.35;
  }
  /* Lock touch scroll on the grid while jiggle mode is active so a
   * drag gesture doesn't double as a page scroll. */
  .canvas.drag-active {
    touch-action: none;
  }
</style>
