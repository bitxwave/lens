<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { visibleSections, hasActiveFilter, clearFilters } from '$lib/stores/visible';
  import GroupSection from '$lib/components/Nav/GroupSection.svelte';
  import FavoritesSection from '$lib/components/Nav/FavoritesSection.svelte';
  import EmptyState from '$lib/components/Nav/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n/store';

  const siteTitle = $derived($navDataStore.bundle?.meta.siteName ?? '');
</script>

<svelte:head>
  <title>{siteTitle}</title>
</svelte:head>

{#if $navDataStore.loading && !$navDataStore.bundle}
  <div class="loading">
    <Skeleton width="240px" height="24px" />
    <Skeleton width="180px" height="16px" />
    <Skeleton width="220px" height="16px" />
  </div>
{:else if $navDataStore.error}
  <EmptyState title={$t('error.network.offline')} hint={$navDataStore.error} />
  <div class="retry">
    <Button onclick={() => navDataStore.refetch()}>{$t('error.network.retry')}</Button>
  </div>
{:else}
  <FavoritesSection />
  {#if $visibleSections.length === 0}
    {#if $hasActiveFilter}
      <EmptyState title={$t('nav.empty.search')} hint={$t('nav.empty.search.hint')} />
      <div class="retry">
        <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
      </div>
    {:else}
      <EmptyState title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
    {/if}
  {:else}
    {#each $visibleSections as section (section.group?.id ?? 'ungrouped')}
      <GroupSection {section} />
    {/each}
  {/if}
{/if}

<style lang="scss">
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    align-items: center;
    margin-top: var(--sp-6);
  }
  .retry {
    display: flex;
    justify-content: center;
    margin-top: var(--sp-3);
  }
</style>
