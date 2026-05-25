<script lang="ts">
  import Menu from '$lib/components/ui/Menu.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuX = $state(0);
  let menuY = $state(0);

  function nameFor(site: { name: string }) {
    return site.name;
  }

  function openMenu() {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    menuX = r.left;
    menuY = r.bottom + 4;
    open = true;
  }

  const items = $derived(
    ($navDataStore.bundle?.sites ?? []).map((s) => ({
      label: nameFor(s) + ($currentSite.site?.value === s.value ? '  ✓' : ''),
      onSelect: () => uiPrefs.setSite(s.value)
    }))
  );

  const label = $derived($currentSite.site ? nameFor($currentSite.site) : '—');
</script>

<button class="trigger" type="button" bind:this={triggerEl} onclick={openMenu}>
  {label}
  <span aria-hidden="true">▾</span>
</button>

<Menu bind:open x={menuX} y={menuY} {items} />

<style lang="scss">
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 32px;
    padding: 0 var(--sp-3);
    background: var(--c-accent-bg);
    color: var(--c-accent);
    border: 0;
    border-radius: var(--rd-pill);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: filter var(--tr-fast);

    &:hover {
      filter: brightness(1.05);
    }
  }
</style>
