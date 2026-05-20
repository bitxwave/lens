<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { localeStore, t } from '$lib/i18n/store';
  import { editModeStore } from '$lib/stores/editMode';
  import NavItemContextMenu from '$lib/components/Editor/NavItemContextMenu.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { deleteItem } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';

  interface Props {
    item: Item;
    onEdit?: (item: Item) => void;
  }
  let { item, onEdit }: Props = $props();

  const url = $derived($currentSite.site ? (item.links[$currentSite.site.value] ?? null) : null);
  const displayName = $derived(item.nameI18n?.[$localeStore] ?? item.name);
  const isFav = $derived($uiPrefs.favoriteItemIds.includes(item.id));

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);

  function iconSrc(): string {
    switch (item.iconKind) {
      case 'asset':
        return `/navIcons/${item.iconValue}`;
      case 'url':
        return item.iconValue;
      case 'auto-favicon':
        return `/api/favicon?host=${encodeURIComponent(item.iconValue)}`;
    }
  }

  function open() {
    if ($editModeStore) return; // suppress nav navigation in edit mode
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function onKeydown(e: KeyboardEvent) {
    if ($editModeStore) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  function onFavClick(e: MouseEvent) {
    e.stopPropagation();
    uiPrefs.toggleFavorite(item.id);
  }

  function onContextMenu(e: MouseEvent) {
    if (!$editModeStore) return;
    e.preventDefault();
    menuX = e.clientX;
    menuY = e.clientY;
    menuOpen = true;
  }

  async function onConfirmDelete() {
    // optimistic remove
    const before = $navDataStore.bundle;
    if (!before) return;
    navDataStore.setBundle({
      ...before,
      items: before.items.filter((i) => i.id !== item.id)
    });
    try {
      await deleteItem(item.id);
      toast.success($t('common.delete') + ' ✓');
    } catch {
      // rollback
      navDataStore.refetch();
      toast.error($t('error.unknown'));
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cell" oncontextmenu={onContextMenu}>
  <button
    type="button"
    class="card"
    class:edit={$editModeStore}
    onclick={open}
    onkeydown={onKeydown}
    aria-label={displayName}
    disabled={!url && !$editModeStore}
  >
    <img class="icon" src={iconSrc()} alt="" loading="lazy" />
  </button>
  <button
    type="button"
    class="fav"
    aria-label={isFav ? 'Unfavorite' : 'Favorite'}
    aria-pressed={isFav}
    onclick={onFavClick}>★</button
  >
  <span class="label">{displayName}</span>
</div>

<NavItemContextMenu
  bind:open={menuOpen}
  x={menuX}
  y={menuY}
  onEdit={() => onEdit?.(item)}
  onDelete={onConfirmDelete}
/>

<style lang="scss">
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    width: 96px;
  }
  .card {
    width: 96px;
    height: 96px;
    padding: var(--sp-3);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
    box-shadow: var(--sh-sm);
    cursor: pointer;
    transition:
      transform var(--tr-base),
      box-shadow var(--tr-base),
      border-color var(--tr-fast);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: var(--sh-md);
      border-color: var(--c-accent);
    }

    &.edit {
      cursor: context-menu;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .icon {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: var(--rd-sm);
    }
  }
  .fav {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    background: transparent;
    border: 0;
    color: var(--c-text-3);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--rd-pill);
    opacity: 0;
    transition:
      opacity var(--tr-fast),
      color var(--tr-fast);

    &[aria-pressed='true'] {
      color: var(--c-warn);
      opacity: 1;
    }
  }
  .cell:hover .fav,
  .fav:focus-visible {
    opacity: 1;
  }

  .label {
    font-size: var(--fs-sm);
    color: var(--c-text);
    text-align: center;
    line-height: var(--lh-tight);
    word-break: break-word;
  }
</style>
