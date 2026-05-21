<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite, layoutMode } from '$lib/stores/visible';
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
  {#if !$editModeStore && $layoutMode !== 'flat'}
    <button
      type="button"
      class="fav"
      aria-label={isFav ? 'Unfavorite' : 'Favorite'}
      aria-pressed={isFav}
      onclick={onFavClick}
    >
      {#if isFav}
        <!-- Filled star -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      {:else}
        <!-- Outline star -->
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      {/if}
    </button>
  {/if}
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
  @keyframes shake-bounce {
    0%,
    100% {
      transform: rotate(0);
    }
    25% {
      transform: rotate(10deg);
    }
    50% {
      transform: rotate(-10deg);
    }
    75% {
      transform: rotate(4deg);
    }
    85% {
      transform: rotate(-4deg);
    }
  }

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    width: 120px;
  }
  .card {
    width: 120px;
    height: 120px;
    padding: 14px;
    background: var(--c-surface);
    border: 0;
    border-radius: 22px;
    box-shadow: var(--sh-card);
    cursor: pointer;
    transition:
      box-shadow var(--tr-base),
      transform var(--tr-base);

    &:hover:not(:disabled) {
      box-shadow: var(--sh-card-hover);
      animation: shake-bounce 0.55s ease-in-out;
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
      border-radius: 12px;
    }
  }
  /* Favorite star — hidden by default; appears on cell hover OR keyboard focus.
   * No background chip, no scale: just an outline/filled SVG star whose color
   * tells the state. Already-favorited stays visible while hovering anywhere
   * else by virtue of its color (handled by the {#if isFav} branch in markup
   * picking the filled glyph). */
  .fav {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity var(--tr-fast),
      color var(--tr-fast);

    &[aria-pressed='true'] {
      color: #f5a623;
    }
  }
  .cell:hover .fav,
  .fav:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .fav:hover:not([aria-pressed='true']) {
    color: rgba(0, 0, 0, 0.8);
  }
  .fav[aria-pressed='true']:hover {
    color: #d68410;
  }

  .label {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--c-card-label);
    text-shadow: var(--sh-card-label);
    text-align: center;
    line-height: var(--lh-tight);
    word-break: break-word;
  }

  @media (max-width: 500px) {
    .cell {
      width: 72px;
      gap: var(--sp-2);
    }
    .card {
      width: 72px;
      height: 72px;
      padding: 10px;
      border-radius: 16px;

      .icon {
        border-radius: 8px;
      }
    }
    .label {
      font-size: var(--fs-xs);
    }
  }
</style>
