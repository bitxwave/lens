<script lang="ts">
  import type { Card } from '$lib/types/card';
  import { onMount } from 'svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { currentSite } from '$lib/stores/visible';
  import { jiggleMode } from '$lib/stores/jiggle';
  import { sessionStore } from '$lib/stores/session';
  import { dragSource } from '$lib/stores/dragMerge';
  import { patchCard } from '$lib/api/cards';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';
  import CardComp from './Card.svelte';

  interface Props {
    folder: Card;
    onClose: () => void;
    onEdit?: (card: Card) => void;
  }
  let { folder, onClose, onEdit }: Props = $props();

  // Folder rename — only available in jiggle mode + authed.
  let renaming = $state(false);
  let renameValue = $state('');
  // Guard against the trailing onblur firing commitRename a second time
  // after Enter already submitted (the input unmounts in the same tick;
  // onblur still arrives). A second concurrent PATCH would race the
  // first one for the SQLite write lock and 500.
  let committing = $state(false);

  function startRename() {
    if (!$jiggleMode || !$sessionStore.authed) return;
    renaming = true;
    renameValue = folder.name;
  }

  async function commitRename() {
    if (committing) return;
    committing = true;
    const next = renameValue.trim();
    renaming = false;
    try {
      if (next && next !== folder.name) {
        const updated = await patchCard(folder.id, { name: next });
        navDataStore.applyCardPatch(folder.id, { name: updated.name });
      }
    } catch {
      toast.error($t('error.unknown'));
      navDataStore.refetch();
    } finally {
      committing = false;
    }
  }

  function cancelRename() {
    // Reset the buffer so the trailing onblur sees "unchanged" and no-ops.
    renameValue = folder.name;
    renaming = false;
  }

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
<!-- data-zone covers the whole visual panel rect so dragGrid's hoverZone
     stays "folder:<id>" while the cursor is anywhere inside the panel
     (including .expand padding and the title row), not just over the
     inner grid. Without this, a cursor in the panel-padding ring would
     read as null/outOfZone and the +page.svelte onHoverZoneChange
     handler would tear the panel down mid-gesture. -->
<div class="wrap" data-zone={zoneId}>
  {#if renaming}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="title-input"
      bind:value={renameValue}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitRename();
        else if (e.key === 'Escape') cancelRename();
      }}
      onblur={commitRename}
      autofocus
    />
  {:else if $jiggleMode && $sessionStore.authed}
    <button type="button" class="title rename" onclick={startRename}>{folder.name}</button>
  {:else}
    <h3 class="title">{folder.name}</h3>
  {/if}
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
    gap: var(--sp-5);
    max-height: calc(100vh - 96px);
    width: min(90vw, 720px);
    animation: wrap-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .title {
    margin: 0;
    padding: 0;
    background: transparent;
    border: 0;
    font-family: inherit;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    color: var(--c-card-label);
    text-shadow: var(--sh-card-label);
    letter-spacing: 0.04em;
  }
  .title.rename {
    cursor: text;
  }
  .title-input {
    margin: 0;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: 8px;
    font-family: inherit;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
    letter-spacing: 0.04em;
    text-align: center;
    min-width: 160px;
    outline: none;
  }
  :global([data-theme='dark']) .title-input {
    background: rgba(28, 22, 40, 0.75);
    border-color: rgba(255, 255, 255, 0.18);
    color: var(--c-text);
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
