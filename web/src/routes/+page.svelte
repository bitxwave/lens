<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { rootCards, searchHits, hasActiveFilter, clearFilters } from '$lib/stores/visible';
  import { jiggleMode } from '$lib/stores/jiggle';
  import { sessionStore } from '$lib/stores/session';
  import Card from '$lib/components/Nav/Card.svelte';
  import InlineFolderExpand from '$lib/components/Nav/InlineFolderExpand.svelte';
  import JiggleHost from '$lib/components/Nav/JiggleHost.svelte';
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
  import { dragGrid, type DragDropInfo, type DropIntent } from '$lib/util/dragGrid';

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

  function onSpringLoad(folderId: number) {
    if (openFolderId !== folderId) openFolderId = folderId;
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
    use:dragGrid={{
      enabled: $jiggleMode && $sessionStore.authed,
      onSpringLoad,
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
        <div class="grid" data-zone="root">
          {#each $rootCards as card (card.id)}
            <Card
              {card}
              folderChildren={card.kind === 'folder' ? (folderChildrenById.get(card.id) ?? []) : []}
              {onOpenFolder}
              onEdit={openEdit}
            />
          {/each}
          {#if $jiggleMode && $sessionStore.authed}
            <div class="add-cell">
              <NewItemAffordance onClick={() => openCreate(null)} />
            </div>
          {/if}
        </div>
      </section>
    </JiggleHost>
  </div>
{/if}

<ItemEditDialog
  bind:open={editDialogOpen}
  target={editTarget}
  defaultParentId={createForParentId}
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
