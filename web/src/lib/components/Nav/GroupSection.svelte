<script lang="ts">
  import type { VisibleGroup } from '$lib/stores/visible';
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import GroupHeader from './GroupHeader.svelte';
  import NavGrid from './NavGrid.svelte';

  interface Props {
    section: VisibleGroup;
    onEdit?: (item: Item) => void;
  }
  let { section, onEdit }: Props = $props();

  const isOpen = $derived(section.group ? $uiPrefs.groupOpen[section.group.slug] !== false : true);
</script>

<section class="section">
  {#if section.group}
    <GroupHeader group={section.group} />
  {/if}
  {#if isOpen}
    <NavGrid items={section.items} groupId={section.group?.id ?? null} {onEdit} />
  {/if}
</section>

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-bottom: var(--sp-7);
  }
</style>
