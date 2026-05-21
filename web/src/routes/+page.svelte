<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import {
    visibleSections,
    visibleFlatItems,
    layoutMode,
    hasActiveFilter,
    clearFilters
  } from '$lib/stores/visible';
  import NavGrid from '$lib/components/Nav/NavGrid.svelte';
  import GroupFolder from '$lib/components/Nav/GroupFolder.svelte';
  import GroupFolderModal from '$lib/components/Nav/GroupFolderModal.svelte';
  import NavItem from '$lib/components/Nav/NavItem.svelte';
  import FavoritesSection from '$lib/components/Nav/FavoritesSection.svelte';
  import EmptyState from '$lib/components/Nav/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ItemEditDialog from '$lib/components/Editor/ItemEditDialog.svelte';
  import NewItemAffordance from '$lib/components/Editor/NewItemAffordance.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { t } from '$lib/i18n/store';
  import type { Item } from '$lib/types/nav';

  const siteTitle = $derived($navDataStore.bundle?.meta.siteName ?? '');

  let editTarget = $state<Item | null>(null);
  let createForGroupId = $state<number | null>(null);
  let editDialogOpen = $state(false);

  /** Currently expanded folder (grouped + Launchpad mode). null = none. */
  let openFolderId = $state<number | null>(null);

  const openFolder = $derived(
    openFolderId == null
      ? null
      : ($visibleSections.find((s) => s.group?.id === openFolderId) ?? null)
  );

  function openEdit(item: Item) {
    editTarget = item;
    createForGroupId = null;
    editDialogOpen = true;
  }
  function openCreate(groupId: number | null) {
    editTarget = null;
    createForGroupId = groupId;
    editDialogOpen = true;
  }

  /** When grouped + filtering, flatten matched items so search bypasses folders. */
  const filteredFlatItems = $derived($visibleSections.flatMap((s) => s.items));
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
{:else}
  {#if !$hasActiveFilter && $layoutMode === 'grouped'}
    <FavoritesSection onEdit={openEdit} />
  {/if}
  {#if $visibleSections.length === 0}
    {#if $hasActiveFilter}
      <EmptyState title={$t('nav.empty.search')} hint={$t('nav.empty.search.hint')} />
      <div class="retry">
        <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
      </div>
    {:else}
      <EmptyState title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
      {#if $editModeStore}
        <div class="retry">
          <Button onclick={() => openCreate(null)}>{$t('editor.item.new')}</Button>
        </div>
      {/if}
    {/if}
  {:else if $layoutMode === 'flat'}
    <section class="flat">
      <NavGrid items={$visibleFlatItems} groupId={null} onEdit={openEdit}>
        {#snippet trailing()}
          {#if $editModeStore}
            <NewItemAffordance onClick={() => openCreate(null)} />
          {/if}
        {/snippet}
      </NavGrid>
    </section>
  {:else if $hasActiveFilter}
    <!-- Search active: bypass folders, show matching items flat. -->
    <section class="flat">
      <NavGrid items={filteredFlatItems} groupId={null} onEdit={openEdit} />
    </section>
  {:else}
    <!-- Launchpad-style folder grid: each group is a tile that expands on click. -->
    <section class="folders">
      <div class="folders-grid">
        {#each $visibleSections as section (section.group?.id ?? 'ungrouped')}
          {#if section.group}
            <GroupFolder
              group={section.group}
              items={section.items}
              onOpen={() => (openFolderId = section.group!.id)}
            />
          {:else}
            <!-- Ungrouped items render inline as plain tiles, no folder. -->
            {#each section.items as item (item.id)}
              <NavItem {item} onEdit={openEdit} />
            {/each}
          {/if}
        {/each}
      </div>
    </section>
  {/if}
{/if}

{#if openFolder?.group}
  <GroupFolderModal
    group={openFolder.group}
    items={openFolder.items}
    onClose={() => (openFolderId = null)}
    onEdit={openEdit}
    onCreate={() => openCreate(openFolder.group!.id)}
  />
{/if}

<ItemEditDialog bind:open={editDialogOpen} target={editTarget} defaultGroupId={createForGroupId} />

<style lang="scss">
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
  /* Folder grid uses the same column / gap as NavGrid so folders and items
   * render at consistent sizes regardless of which mode the user is in. */
  .folders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 120px);
    gap: 36px 28px;
    justify-content: center;
    width: 100%;
  }
  @media (max-width: 500px) {
    .folders-grid {
      grid-template-columns: repeat(auto-fill, 72px);
      gap: 24px 16px;
    }
  }
</style>
