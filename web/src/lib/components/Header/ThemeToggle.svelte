<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { themeStore, cycleTheme } from '$lib/design/theme';
  import { t } from '$lib/i18n/store';
</script>

<IconButton label={$t('header.theme.toggle')} onclick={cycleTheme}>
  {#if $themeStore === 'light'}
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
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41"
      />
    </svg>
  {:else if $themeStore === 'dark'}
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  {:else}
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
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  {/if}
</IconButton>
