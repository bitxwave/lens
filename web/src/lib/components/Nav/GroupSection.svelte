<script lang="ts">
  import type { VisibleGroup } from '$lib/stores/visible';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import GroupHeader from './GroupHeader.svelte';
  import NavGrid from './NavGrid.svelte';

  interface Props {
    section: VisibleGroup;
  }
  let { section }: Props = $props();

  const isOpen = $derived(section.group ? $uiPrefs.groupOpen[section.group.slug] !== false : true);
</script>

<section class="section">
  {#if section.group}
    <GroupHeader group={section.group} />
  {/if}
  {#if isOpen}
    <NavGrid items={section.items} />
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
