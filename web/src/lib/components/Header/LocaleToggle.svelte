<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Menu from '$lib/components/ui/Menu.svelte';
  import { localeStore, setLocale, t, type Locale } from '$lib/i18n/store';

  let open = $state(false);
  let triggerEl: HTMLElement | undefined = $state();
  let menuX = $state(0);
  let menuY = $state(0);

  const LOCALES: Array<{ value: Locale; label: string }> = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' }
  ];

  function openMenu(e: MouseEvent) {
    triggerEl = e.currentTarget as HTMLElement;
    const r = triggerEl.getBoundingClientRect();
    menuX = r.right - 160;
    menuY = r.bottom + 4;
    open = true;
  }

  const items = $derived(
    LOCALES.map((l) => ({
      label: l.label + ($localeStore === l.value ? '  ✓' : ''),
      onSelect: () => setLocale(l.value)
    }))
  );
</script>

<IconButton label={$t('header.locale.toggle')} onclick={openMenu}>
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18z" />
  </svg>
</IconButton>

<Menu bind:open x={menuX} y={menuY} {items} />
