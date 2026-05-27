<script lang="ts">
  import { goto } from '$app/navigation';
  import { sessionStore } from '$lib/stores/session';
  import { navDataStore } from '$lib/stores/navData';
  import { t } from '$lib/i18n/store';
  import AdminSiteTab from '$lib/components/Admin/AdminSiteTab.svelte';
  import AdminSitesTab from '$lib/components/Admin/AdminSitesTab.svelte';
  import AdminAccountTab from '$lib/components/Admin/AdminAccountTab.svelte';
  import ThemeToggle from '$lib/components/Header/ThemeToggle.svelte';
  import LocaleToggle from '$lib/components/Header/LocaleToggle.svelte';

  type TabId = 'site' | 'sites' | 'account';
  interface Tab {
    id: TabId;
    labelKey: string;
    descKey: string;
  }
  const TABS: Tab[] = [
    { id: 'site', labelKey: 'admin.tab.site.label', descKey: 'admin.tab.site.description' },
    { id: 'sites', labelKey: 'admin.tab.sites.label', descKey: 'admin.tab.sites.description' },
    {
      id: 'account',
      labelKey: 'admin.tab.account.label',
      descKey: 'admin.tab.account.description'
    }
  ];

  let active = $state<TabId>('site');
  const currentTab = $derived(TABS.find((tab) => tab.id === active) ?? TABS[0]);

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

  async function onLogout() {
    await sessionStore.logout();
    await goto('/', { replaceState: true });
  }
</script>

<svelte:head>
  <title>{$t('admin.pageTitle')}</title>
</svelte:head>

{#if $sessionStore.authed}
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="dot" aria-hidden="true"></span>
        <span class="title">{$t('admin.brand')}</span>
        <span class="sep" aria-hidden="true">/</span>
        <span class="subtitle">{$t(currentTab.labelKey)}</span>
      </div>
      <div class="topbar-actions">
        <div class="utility">
          <LocaleToggle />
          <ThemeToggle />
        </div>
        <span class="divider" aria-hidden="true"></span>
        <a href="/" class="link">{$t('admin.action.backToSite')}</a>
        <button type="button" class="logout" onclick={onLogout}>
          {$t('admin.action.logout')}
        </button>
      </div>
    </header>

    <div class="body">
      <aside class="sidebar" aria-label="Admin sections">
        <div class="side-head">{$t('admin.head.settings')}</div>
        <nav class="side-nav">
          {#each TABS as tab (tab.id)}
            <button
              type="button"
              class="side-item"
              class:active={active === tab.id}
              onclick={() => (active = tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
            >
              <span class="side-label">{$t(tab.labelKey)}</span>
            </button>
          {/each}
        </nav>
      </aside>

      <main class="content">
        <article class="card">
          <header class="card-head">
            <h1 class="card-title">{$t(currentTab.labelKey)}</h1>
            <p class="card-desc">{$t(currentTab.descKey)}</p>
          </header>
          <div class="card-body">
            {#if active === 'site'}
              <AdminSiteTab />
            {:else if active === 'sites'}
              <AdminSitesTab />
            {:else if active === 'account'}
              <AdminAccountTab />
            {/if}
          </div>
        </article>
      </main>
    </div>
  </div>
{:else}
  <div class="placeholder">{$t('admin.placeholder.redirecting')}</div>
{/if}

<style lang="scss">
  /* Dashboard shell — opts out of the public layout's gradient bg via
   * the body.admin-route flag set in routes/+layout.svelte. Topbar +
   * sidebar use --c-surface (white in light, near-black in dark) over
   * a --c-bg backdrop, matching the rest of the project's token-driven
   * design system without inventing admin-only colours. */
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--c-bg);
    color: var(--c-text);
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: 0 var(--sp-5);
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }
  .brand .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c-accent);
    flex: 0 0 auto;
  }
  .brand .title {
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
  }
  .brand .sep {
    color: var(--c-text-3);
  }
  .brand .subtitle {
    font-size: var(--fs-sm);
    color: var(--c-text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .utility {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .divider {
    width: 1px;
    height: 24px;
    background: var(--c-border);
    margin: 0 var(--sp-2);
  }
  .link {
    font-size: var(--fs-sm);
    color: var(--c-text-2);
    text-decoration: none;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--rd-sm);
    transition:
      color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      color: var(--c-text);
      background: var(--c-surface-2);
    }
  }
  .logout {
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    color: var(--c-text);
    background: transparent;
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    padding: 6px var(--sp-3);
    cursor: pointer;
    transition:
      border-color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      border-color: var(--c-text-3);
      background: var(--c-surface-2);
    }
  }

  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr;
    align-items: start;
    min-height: 0;
  }

  .sidebar {
    position: sticky;
    top: 56px;
    align-self: start;
    height: calc(100vh - 56px);
    border-right: 1px solid var(--c-border);
    background: var(--c-surface);
    padding: var(--sp-5) var(--sp-3);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .side-head {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--c-text-3);
    padding: 0 var(--sp-2);
  }
  .side-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .side-item {
    appearance: none;
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    background: transparent;
    border: 0;
    border-radius: var(--rd-md);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    color: var(--c-text-2);
    cursor: pointer;
    transition:
      color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      color: var(--c-text);
      background: var(--c-surface-2);
    }
    &.active {
      color: var(--c-accent);
      background: var(--c-accent-bg);
    }
  }
  .side-label {
    display: inline-block;
  }

  .content {
    padding: var(--sp-6) var(--sp-7);
    min-width: 0;
  }
  .card {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
    box-shadow: var(--sh-sm);
    overflow: hidden;
    max-width: 720px;
  }
  .card-head {
    padding: var(--sp-5) var(--sp-6) var(--sp-4);
    border-bottom: 1px solid var(--c-border);
    background: var(--c-surface);
  }
  .card-title {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
  }
  .card-desc {
    margin: var(--sp-1) 0 0;
    font-size: var(--fs-sm);
    color: var(--c-text-2);
    line-height: var(--lh-base);
  }
  .card-body {
    padding: var(--sp-6);
  }

  .placeholder {
    padding: var(--sp-7);
    text-align: center;
    color: var(--c-text-3);
  }

  @media (max-width: 768px) {
    .topbar {
      padding: 0 var(--sp-4);
      gap: var(--sp-2);
    }
    .topbar-actions {
      gap: var(--sp-1);
    }
    .divider {
      display: none;
    }
    .link {
      display: none;
    }
    .body {
      grid-template-columns: 1fr;
    }
    .sidebar {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--c-border);
      flex-direction: row;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
    }
    .side-head {
      display: none;
    }
    .side-nav {
      flex-direction: row;
      gap: var(--sp-1);
      overflow-x: auto;
    }
    .content {
      padding: var(--sp-5) var(--sp-4);
    }
    .card {
      max-width: none;
    }
    .card-head {
      padding: var(--sp-4) var(--sp-5) var(--sp-3);
    }
    .card-body {
      padding: var(--sp-5);
    }
  }
</style>
