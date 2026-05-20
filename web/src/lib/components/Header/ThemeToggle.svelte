<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { themeStore, cycleTheme } from '$lib/design/theme';
  import { t } from '$lib/i18n/store';

  const glyph = $derived($themeStore === 'dark' ? '☾' : $themeStore === 'light' ? '☀' : '◐');
</script>

<IconButton label={$t('header.theme.toggle')} onclick={cycleTheme}>
  <span aria-hidden="true">{glyph}</span>
</IconButton>
