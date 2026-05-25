<script lang="ts">
  import { goto } from '$app/navigation';
  import { sessionStore } from '$lib/stores/session';
  import { navDataStore } from '$lib/stores/navData';
  import AdminSiteTab from '$lib/components/Admin/AdminSiteTab.svelte';
  import AdminSitesTab from '$lib/components/Admin/AdminSitesTab.svelte';

  type TabId = 'site' | 'sites';
  const TABS: { id: TabId; label: string }[] = [
    { id: 'site', label: 'Site' },
    { id: 'sites', label: 'Sites' }
  ];

  let active = $state<TabId>('site');

  /** Redirect home if the user is not authed (not loading). */
  $effect(() => {
    if (!$sessionStore.loading && !$sessionStore.authed) {
      goto('/', { replaceState: true });
    }
  });

  /** Make sure we have nav data loaded for tabs that depend on it. */
  $effect(() => {
    if ($sessionStore.authed && !$navDataStore.bundle && !$navDataStore.loading) {
      navDataStore.load();
    }
  });
</script>

<svelte:head>
  <title>Admin · Settings</title>
</svelte:head>

{#if $sessionStore.authed}
  <div class="page">
    <header class="page-head">
      <h1>Admin</h1>
      <a href="/" class="back">← Back to site</a>
    </header>

    <div class="layout">
      <nav class="tabs" aria-label="Admin sections">
        {#each TABS as tab (tab.id)}
          <button
            type="button"
            class="tab-btn"
            class:active={active === tab.id}
            onclick={() => (active = tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      <section class="content">
        {#if active === 'site'}
          <AdminSiteTab />
        {:else if active === 'sites'}
          <AdminSitesTab />
        {/if}
      </section>
    </div>
  </div>
{:else}
  <div class="placeholder">Redirecting…</div>
{/if}

<style lang="scss">
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--sp-6) var(--sp-5);
  }
  .page-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--sp-5);
    h1 {
      margin: 0;
      font-size: var(--fs-xl);
    }
    .back {
      font-size: var(--fs-sm);
      color: var(--c-accent);
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
  }
  .layout {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: var(--sp-5);
    align-items: start;
  }
  .tabs {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    position: sticky;
    top: var(--sp-4);
  }
  .tab-btn {
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    background: transparent;
    border: 0;
    border-radius: var(--rd-md);
    color: var(--c-text-2);
    font: inherit;
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background var(--tr-fast),
      color var(--tr-fast);
    &:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    &.active {
      background: var(--c-accent-bg);
      color: var(--c-accent);
    }
  }
  .content {
    min-width: 0;
  }
  .placeholder {
    padding: var(--sp-7);
    text-align: center;
    color: var(--c-text-3);
  }

  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .tabs {
      flex-direction: row;
      overflow-x: auto;
      position: static;
    }
  }
</style>
