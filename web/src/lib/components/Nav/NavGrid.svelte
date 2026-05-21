<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import NavItem from './NavItem.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { navDataStore } from '$lib/stores/navData';
  import { reorderItems } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

  interface Props {
    items: Item[];
    onEdit?: (item: Item) => void;
    /** Group id this grid belongs to. null = ungrouped / favorites / flat. */
    groupId?: number | null;
    /** Optional snippet rendered as the last grid cell (e.g. "+ new item"
     * affordance). Sits outside the dndzone so it isn't draggable. */
    trailing?: import('svelte').Snippet;
  }
  let { items, onEdit, groupId = null, trailing }: Props = $props();

  // Local mirror so dndzone can mutate during drag.
  let working: Item[] = $state(items);
  $effect(() => {
    working = items;
  });

  // Disable dnd outside edit mode (read-only or unauthed).
  const dragDisabled = $derived(!$editModeStore);

  function onConsider(e: CustomEvent<DndEvent<Item>>) {
    working = e.detail.items;
  }

  async function onFinalize(e: CustomEvent<DndEvent<Item>>) {
    working = e.detail.items;
    const before = $navDataStore.bundle;
    if (!before) return;

    // Build payload — every item in this grid gets new sortOrder.
    const entries = working.map((it, i) => ({
      id: it.id,
      sortOrder: i,
      groupId: groupId
    }));

    // Optimistic: patch navDataStore items to reflect new order.
    const movedIds = new Set(entries.map((e) => e.id));
    const orderById = new Map(entries.map((e, i) => [e.id, i]));
    const newItems = before.items.map((it) =>
      movedIds.has(it.id)
        ? {
            ...it,
            sortOrder: orderById.get(it.id) ?? it.sortOrder,
            groupId
          }
        : it
    );
    navDataStore.setBundle({ ...before, items: newItems });

    try {
      await reorderItems(entries);
    } catch {
      navDataStore.refetch();
      toast.error($t('error.unknown'));
    }
  }
</script>

<div class="grid">
  <div
    class="cells"
    use:dndzone={{
      items: working,
      dragDisabled,
      flipDurationMs: 180,
      dropTargetStyle: {}
    }}
    onconsider={onConsider}
    onfinalize={onFinalize}
  >
    {#each working as item (item.id)}
      <NavItem {item} {onEdit} />
    {/each}
  </div>
  {#if trailing}{@render trailing()}{/if}
</div>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 120px);
    gap: 36px 28px;
    justify-content: center;
    width: 100%;
  }
  /* `display: contents` makes .cells a transparent dndzone wrapper so its
   * children (NavItem cells) participate directly in the outer .grid layout,
   * which lets the trailing snippet sit on the same row as the last NavItem. */
  .cells {
    display: contents;
  }
  @media (max-width: 500px) {
    .grid {
      grid-template-columns: repeat(auto-fill, 72px);
      gap: 24px 16px;
    }
  }
  /* dnd-action ghost & dropping styles */
  :global(.cells > [data-is-dnd-shadow-item]) {
    visibility: visible;
    opacity: 0.5;
    pointer-events: none;
  }
</style>
