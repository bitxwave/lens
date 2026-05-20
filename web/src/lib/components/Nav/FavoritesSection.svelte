<script lang="ts">
  import { visibleFavorites } from '$lib/stores/visible';
  import NavGrid from './NavGrid.svelte';
  import { t } from '$lib/i18n/store';
</script>

{#if $visibleFavorites.length > 0}
  <section class="favorites">
    <h2 class="heading">★ {$t('nav.favorites.title')}</h2>
    <NavGrid items={$visibleFavorites} />
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
    color: var(--c-text-2);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
