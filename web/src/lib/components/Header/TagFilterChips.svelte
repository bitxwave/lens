<script lang="ts">
  import Chip from '$lib/components/ui/Chip.svelte';
  import { allTagSlugs, activeTagSlugs, toggleTag } from '$lib/stores/visible';
</script>

<div class="chips">
  {#each $allTagSlugs as slug (slug)}
    <Chip label={slug} active={$activeTagSlugs.has(slug)} onSelect={() => toggleTag(slug)} />
  {/each}
</div>

<style lang="scss">
  .chips {
    display: flex;
    gap: var(--sp-1);
    flex-wrap: wrap;
  }
</style>
