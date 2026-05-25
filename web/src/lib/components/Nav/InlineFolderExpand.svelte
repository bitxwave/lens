<script lang="ts">
  import type { Card } from '$lib/types/card';
  import { onMount } from 'svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { currentSite } from '$lib/stores/visible';
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
<div class="wrap">
  <h3 class="title">{folder.name}</h3>
  <section class="expand" aria-label={folder.name}>
    <div class="grid" data-zone={zoneId}>
      {#each childCards as c (c.id)}
        <CardComp card={c} {onEdit} />
      {/each}
    </div>
  </section>
</div>

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
  /* The wrapper is the fixed-position container so the entry animation
   * lives on it; .expand inside is the actual card. .title sits above
   * .expand as a floating label, matching macOS Launchpad. */
  .wrap {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 81;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    max-height: calc(100vh - 96px);
    width: min(90vw, 720px);
    animation: wrap-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .title {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    color: var(--c-card-label);
    text-shadow: var(--sh-card-label);
    letter-spacing: 0.04em;
  }
  .expand {
    position: relative;
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
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
  @keyframes wrap-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
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
