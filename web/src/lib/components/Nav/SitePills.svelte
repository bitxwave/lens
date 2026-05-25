<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { t } from '$lib/i18n/store';

  const sites = $derived($navDataStore.bundle?.sites ?? []);
  const activeValue = $derived($currentSite.site?.value ?? null);

  function selectSite(value: string) {
    if (value !== activeValue) uiPrefs.setSite(value);
  }

  function onPillKeydown(e: KeyboardEvent, idx: number) {
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      const target = sites[idx - 1];
      selectSite(target.value);
    } else if (e.key === 'ArrowRight' && idx < sites.length - 1) {
      e.preventDefault();
      const target = sites[idx + 1];
      selectSite(target.value);
    }
  }
</script>

{#if sites.length > 1}
  <nav class="pills" aria-label={$t('home.site.aria')}>
    {#each sites as site, i (site.value)}
      <button
        type="button"
        class="pill"
        class:active={site.value === activeValue}
        aria-pressed={site.value === activeValue}
        tabindex={site.value === activeValue ? 0 : -1}
        onclick={() => selectSite(site.value)}
        onkeydown={(e) => onPillKeydown(e, i)}
      >
        {site.name}
      </button>
    {/each}
  </nav>
{/if}

<style lang="scss">
  .pills {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    flex-wrap: nowrap;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    overflow-x: auto;
    scrollbar-width: none;
    max-width: 100%;
  }
  .pills::-webkit-scrollbar {
    display: none;
  }
  .pill {
    flex: 0 0 auto;
    height: 36px;
    padding: 0 var(--sp-4);
    background: rgba(255, 255, 255, 0.28);
    color: var(--c-card-label);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: var(--rd-pill);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-family: inherit;
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background var(--tr-fast),
      border-color var(--tr-fast),
      color var(--tr-fast),
      box-shadow var(--tr-fast),
      transform var(--tr-fast);
    white-space: nowrap;
  }
  .pill:hover:not(.active) {
    border-color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.45);
  }
  .pill.active {
    background: var(--c-accent);
    color: #fff;
    border-color: var(--c-accent);
    box-shadow: 0 4px 14px rgba(35, 25, 60, 0.22);
    transform: translateY(-1px);
  }
  .pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5);
  }
  :global([data-theme='dark']) .pill {
    background: rgba(20, 16, 28, 0.45);
    border-color: rgba(255, 255, 255, 0.22);
    color: var(--c-text);
  }
  :global([data-theme='dark']) .pill:hover:not(.active) {
    background: rgba(20, 16, 28, 0.65);
    border-color: rgba(255, 255, 255, 0.45);
  }
  :global([data-theme='dark']) .pill.active {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: #fff;
  }
</style>
