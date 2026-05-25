<script lang="ts">
  import type { Card } from '$lib/types/card';
  import { onMount } from 'svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { currentSite } from '$lib/stores/visible';
  import { t } from '$lib/i18n/store';
  import { dragSource } from '$lib/stores/dragMerge';
  import CardComp from './Card.svelte';

  interface Props {
    folder: Card;
    onClose: () => void;
    onEdit?: (card: Card) => void;
  }
  let { folder, onClose, onEdit }: Props = $props();

  // Drag handling lives on the page-level <div use:dragGrid>. This panel
  // just renders cards inside a [data-zone] container so the action can
  // identify them as "in this folder" during cross-zone hit tests.
  const zoneId = $derived(`folder:${folder.id}`);

  const childCards = $derived(
    ($navDataStore.bundle?.cards ?? [])
      .filter(
        (c) =>
          c.parentId === folder.id &&
          (c.kind !== 'item' ||
            (c.links && $currentSite.site && c.links[$currentSite.site.value] !== undefined))
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );

  // Lock body scroll while open so the page doesn't drift behind.
  onMount(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  // We can no longer auto-close on "drag clone left the panel rect"
  // because the drag is owned by the page-level action and pointer
  // events follow the cursor regardless. Auto-close while a drag is in
  // progress would tear our own DOM down mid-gesture. Instead: only
  // close on backdrop click / × button / Esc. After a successful
  // drag-out-of-folder drop the page handler closes the panel.
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && !$dragSource) onClose();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="backdrop"
  onclick={() => {
    if (!$dragSource) onClose();
  }}
></div>
<section class="expand" aria-label={folder.name}>
  <header>
    <h3>{folder.name}</h3>
    <button type="button" class="close" aria-label={$t('common.close')} onclick={onClose}>
      ×
    </button>
  </header>
  <div class="grid" data-zone={zoneId}>
    {#each childCards as c (c.id)}
      <CardComp card={c} {onEdit} />
    {/each}
  </div>
</section>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 16, 28, 0.18);
    backdrop-filter: blur(28px) saturate(140%);
    -webkit-backdrop-filter: blur(28px) saturate(140%);
    z-index: 80;
    animation: backdrop-in 0.18s ease-out;
  }
  .expand {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(90vw, 720px);
    max-height: calc(100vh - 96px);
    overflow: auto;
    padding: var(--sp-5);
    background: rgba(255, 255, 255, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 24px;
    box-shadow:
      0 30px 80px rgba(0, 0, 0, 0.28),
      0 6px 22px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
    z-index: 81;
    animation: panel-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  :global([data-theme='dark']) .backdrop {
    background: rgba(8, 6, 14, 0.45);
  }
  :global([data-theme='dark']) .expand {
    background: rgba(28, 22, 40, 0.55);
    border-color: rgba(255, 255, 255, 0.08);
  }
  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-4);
  }
  h3 {
    margin: 0;
    font-size: var(--fs-md);
  }
  .close {
    background: transparent;
    border: 0;
    font-size: 24px;
    cursor: pointer;
    color: var(--c-text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 120px);
    gap: 24px 28px;
    justify-content: center;
  }
  @media (max-width: 500px) {
    .grid {
      grid-template-columns: repeat(auto-fill, 72px);
      gap: 16px;
    }
  }
</style>
