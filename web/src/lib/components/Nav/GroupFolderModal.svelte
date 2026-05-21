<script lang="ts">
  import type { Group, Item } from '$lib/types/nav';
  import { localeStore } from '$lib/i18n/store';
  import NavGrid from './NavGrid.svelte';
  import NewItemAffordance from '$lib/components/Editor/NewItemAffordance.svelte';
  import { editModeStore } from '$lib/stores/editMode';

  interface Props {
    group: Group;
    items: Item[];
    onClose: () => void;
    onEdit?: (item: Item) => void;
    onCreate?: () => void;
  }
  let { group, items, onClose, onEdit, onCreate }: Props = $props();

  const displayName = $derived(group.nameI18n?.[$localeStore] ?? group.name);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="folder-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label={displayName}
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="panel">
    <header class="head">
      <h2 class="title">{displayName}</h2>
      <button class="close" type="button" aria-label="Close" onclick={onClose}>×</button>
    </header>
    <div class="body">
      <NavGrid {items} groupId={group.id} {onEdit}>
        {#snippet trailing()}
          {#if $editModeStore && onCreate}
            <NewItemAffordance onClick={onCreate} />
          {/if}
        {/snippet}
      </NavGrid>
    </div>
  </div>
</div>

<style lang="scss">
  .folder-backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: rgba(20, 16, 28, 0.4);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-7) var(--sp-5);
    animation: fade-in 200ms ease-out;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .panel {
    width: 100%;
    max-width: 1024px;
    max-height: calc(100vh - var(--sp-7) * 2);
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-6);
    padding: 0 var(--sp-3);
  }
  .title {
    margin: 0;
    font-size: 24px;
    font-weight: var(--fw-semibold);
    letter-spacing: 0.05em;
    color: var(--c-card-label);
    text-shadow: var(--sh-card-label);
  }
  .close {
    width: 36px;
    height: 36px;
    border: 0;
    background: rgba(255, 255, 255, 0.16);
    color: var(--c-card-label);
    border-radius: var(--rd-pill);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--tr-fast);

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
  .body {
    overflow-y: auto;
    padding: var(--sp-3);
  }
</style>
