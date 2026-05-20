<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import NavItem from './NavItem.svelte';

  interface Props {
    items: Item[];
    onEdit?: (item: Item) => void;
  }
  let { items, onEdit }: Props = $props();
</script>

<div class="grid">
  {#each items as item (item.id)}
    <NavItem {item} {onEdit} />
  {/each}
</div>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 96px);
    gap: var(--sp-5) var(--sp-4);
    justify-content: center;
    width: 100%;
  }
</style>
