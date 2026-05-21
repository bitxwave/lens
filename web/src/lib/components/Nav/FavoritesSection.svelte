<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { visibleFavorites } from '$lib/stores/visible';
  import NavGrid from './NavGrid.svelte';
  import { t } from '$lib/i18n/store';

  interface Props {
    onEdit?: (item: Item) => void;
  }
  let { onEdit }: Props = $props();
</script>

{#if $visibleFavorites.length > 0}
  <section class="favorites">
    <h2 class="heading">★ {$t('nav.favorites.title')}</h2>
    <NavGrid items={$visibleFavorites} {onEdit} />
  </section>
{/if}

<style lang="scss">
  .favorites {
    margin-bottom: var(--sp-7);
  }
  .heading {
    margin: 0 0 var(--sp-4);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    color: var(--c-section-heading);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
