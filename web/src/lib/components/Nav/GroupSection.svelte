<script lang="ts">
  import type { VisibleGroup } from '$lib/stores/visible';
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { editModeStore } from '$lib/stores/editMode';
  import GroupHeader from './GroupHeader.svelte';
  import NavGrid from './NavGrid.svelte';
  import NewItemAffordance from '$lib/components/Editor/NewItemAffordance.svelte';

  interface Props {
    section: VisibleGroup;
    onEdit?: (item: Item) => void;
    onCreate?: () => void;
  }
  let { section, onEdit, onCreate }: Props = $props();

  const isOpen = $derived(section.group ? $uiPrefs.groupOpen[section.group.slug] !== false : true);
</script>

<section class="section">
  {#if section.group}
    <GroupHeader group={section.group} />
  {/if}
  {#if isOpen}
    <NavGrid items={section.items} groupId={section.group?.id ?? null} {onEdit}>
      {#snippet trailing()}
        {#if $editModeStore && onCreate}
          <NewItemAffordance onClick={onCreate} />
        {/if}
      {/snippet}
    </NavGrid>
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
