<script lang="ts">
  import type { Group, Item } from '$lib/types/nav';
  import { localeStore } from '$lib/i18n/store';

  interface Props {
    group: Group;
    items: Item[];
    onOpen: () => void;
  }
  let { group, items, onOpen }: Props = $props();

  const previews = $derived(items.slice(0, 4));
  const SLOTS = [0, 1, 2, 3];
  const displayName = $derived(group.nameI18n?.[$localeStore] ?? group.name);

  function iconSrc(item: Item): string {
    switch (item.iconKind) {
      case 'asset':
        return `/navIcons/${item.iconValue}`;
      case 'url':
        return item.iconValue;
      case 'auto-favicon':
        return `/api/favicon?host=${encodeURIComponent(item.iconValue)}`;
    }
  }
</script>

<div class="cell">
  <button class="folder" type="button" onclick={onOpen} aria-label={displayName}>
    <div class="thumbs">
      {#each SLOTS as i (i)}
        {#if previews[i]}
          <img class="thumb" src={iconSrc(previews[i])} alt="" loading="lazy" />
        {:else}
          <span class="thumb empty" aria-hidden="true"></span>
        {/if}
      {/each}
    </div>
  </button>
  <span class="label">{displayName}</span>
</div>

<style lang="scss">
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    width: 120px;
  }
  .folder {
    width: 120px;
    height: 120px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.35);
    border: 0;
    border-radius: 22px;
    box-shadow: var(--sh-card);
    cursor: pointer;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition:
      box-shadow var(--tr-base),
      transform var(--tr-fast);

    &:hover {
      box-shadow: var(--sh-card-hover);
      transform: translateY(-2px);
    }
  }
  :global([data-theme='dark']) .folder {
    background: rgba(255, 255, 255, 0.08);
  }
  .thumbs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  .thumb {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 8px;
    padding: 3px;
    box-sizing: border-box;
  }
  :global([data-theme='dark']) .thumb {
    background: rgba(255, 255, 255, 0.18);
  }
  .thumb.empty {
    background: rgba(255, 255, 255, 0.25);
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
    .folder {
      width: 72px;
      height: 72px;
      padding: 8px;
      border-radius: 16px;
    }
    .thumbs {
      gap: 3px;
    }
    .thumb {
      border-radius: 5px;
      padding: 1px;
    }
    .label {
      font-size: var(--fs-xs);
    }
  }
</style>
