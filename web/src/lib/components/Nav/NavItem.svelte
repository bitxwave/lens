<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { localeStore } from '$lib/i18n/store';

  interface Props {
    item: Item;
  }
  let { item }: Props = $props();

  const url = $derived($currentSite.site ? (item.links[$currentSite.site.value] ?? null) : null);
  const displayName = $derived(item.nameI18n?.[$localeStore] ?? item.name);
  const isFav = $derived($uiPrefs.favoriteItemIds.includes(item.id));

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
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  function onFavClick(e: MouseEvent) {
    e.stopPropagation();
    uiPrefs.toggleFavorite(item.id);
  }
</script>

<div class="cell">
  <button
    type="button"
    class="card"
    onclick={open}
    onkeydown={onKeydown}
    aria-label={displayName}
    disabled={!url}
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
