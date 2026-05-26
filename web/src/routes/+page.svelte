<script lang="ts">
  import { onMount, tick } from 'svelte';
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

  /** Page size by viewport breakpoint. Mirrors clue §1: desktop 7×5, narrow 4×6, mobile 4×5. */
  function pageSizeForViewport(w: number): number {
    if (w <= 500) return 20; // mobile 4×5
    if (w <= 900) return 24; // narrow 4×6
    return 35; // desktop 7×5
  }

  // SSR-safe initial width; updated to real value on mount.
  let viewportWidth = $state(1280);
  const pageSize = $derived(pageSizeForViewport(viewportWidth));

  onMount(() => {
    viewportWidth = window.innerWidth;
    const onResize = () => {
      viewportWidth = window.innerWidth;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  /** Pager scroll container. Set when the DOM mounts; used for programmatic scrollTo. */
  let pagerEl = $state<HTMLDivElement | null>(null);

  /** Programmatically scroll to the given page. Honours scroll-snap. */
  function scrollToPage(idx: number) {
    if (!pagerEl) return;
    const w = pagerEl.clientWidth;
    pagerEl.scrollTo({ left: idx * w, behavior: 'smooth' });
  }

  /** Sync DOM scroll when currentPage changes via dot click / keyboard / etc. */
  $effect(() => {
    const idx = $currentPage;
    queueMicrotask(() => scrollToPage(idx));
  });

  /** Sync currentPage when user scrolls naturally (touchpad / wheel / swipe). */
  function onPagerScroll() {
    if (!pagerEl) return;
    const w = pagerEl.clientWidth;
    if (w <= 0) return;
    const idx = Math.round(pagerEl.scrollLeft / w);
    if (idx !== $currentPage) currentPage.setPage(idx);
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

  function bucketFor(zone: string): CardType[] {
    if (zone === 'root') return $rootCards;
    if (zone.startsWith('folder:')) {
      const fid = Number(zone.slice('folder:'.length));
      return folderChildrenById.get(fid) ?? [];
    }
    return [];
  }

  function parentIdFor(zone: string): number | null {
    if (zone === 'root') return null;
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
    if (info.intent === 'merge' && info.target && info.target.zone === 'root') {
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
      if (info.source.kind === 'folder' && info.target.zone !== 'root') return;
      const effectiveIntent: DropIntent = info.intent === 'merge' ? 'before' : info.intent;
      const targetZone = info.target.zone;
      const targetBucket = bucketFor(targetZone);
      const targetIdx = targetBucket.findIndex((c) => c.id === info.target!.id);
      if (targetIdx < 0) return;
      const insertAt = effectiveIntent === 'before' ? targetIdx : targetIdx + 1;
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
      if (info.source.zone !== targetZone) {
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
    if (info.source.zone.startsWith('folder:') && (info.hoverZone === 'root' || info.outOfZone)) {
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
  <EmptyState title={$t('error.network.offline')} hint={$navDataStore.error} />
  <div class="retry">
    <Button onclick={() => navDataStore.refetch()}>{$t('error.network.retry')}</Button>
  </div>
{:else if $hasActiveFilter}
  <!-- Search mode: flat hits, no folders, no jiggle, no drag. -->
  <section class="grid-wrap">
    {#if $searchHits.length === 0}
      <EmptyState title={$t('nav.empty.search')} hint={$t('nav.empty.search.hint')} />
      <div class="retry">
        <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
      </div>
    {:else}
      <div class="grid">
        {#each $searchHits as card (card.id)}
          <Card {card} onEdit={openEdit} />
        {/each}
      </div>
    {/if}
  </section>
{:else if $rootCards.length === 0 && !$sessionStore.authed}
  <EmptyState title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
{:else}
  <!-- Single dragGrid action wraps both the folder panel and the root grid
       so cross-zone drags (e.g. drag from root → spring-loaded panel)
       are owned by one session and dispatched via one handleDrop. -->
  <div
    class="canvas"
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
          onscroll={onPagerScroll}
          aria-roledescription="paginated grid"
        >
          {#each pages as pageCards, pageIdx (pageIdx)}
            <div class="page">
              <div class="grid" data-zone="root">
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
                  <div class="add-cell">
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
  .canvas {
    width: 100%;
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    align-items: center;
    margin-top: var(--sp-6);
  }
  .retry {
    display: flex;
    justify-content: center;
    margin-top: var(--sp-3);
  }
  .grid-wrap {
    width: 100%;
  }
  /* Horizontal scroll-snap pager. Each .page is exactly 100% wide so
   * scroll-snap latches to a whole page at a time. The browser's native
   * smooth scroll handles the animation; we drive it programmatically
   * via scrollTo() when dot/keyboard input changes the page index. */
  .pager {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none; /* hide the horizontal scrollbar — dots are the indicator */
    display: flex;
    flex-direction: row;
  }
  .pager::-webkit-scrollbar {
    display: none;
  }
  .page {
    flex: 0 0 100%;
    width: 100%;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--sp-2) 0;
  }
  /* While dragGrid is lifting a card, kill scroll-snap so the user's
   * pointer-driven drag doesn't fight the browser's snap-to-page.
   * overflow-x stays auto so programmatic scrollTo() (driven by the
   * edge-pan dwell in dragGrid) can still turn pages. The pointer
   * itself is captured by dragGrid, so the user can't accidentally
   * scroll the pager with wheel/touch during the drag. */
  :global(.canvas:has([data-card-id][data-dragging='true'])) .pager {
    scroll-snap-type: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 120px);
    gap: 36px 28px;
    justify-content: center;
    width: 100%;
  }
  .add-cell {
    width: 120px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
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
    .grid {
      grid-template-columns: repeat(auto-fill, 72px);
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
  :global(.canvas:has([data-card-id][data-dragging='true'])) {
    touch-action: none;
  }
</style>
