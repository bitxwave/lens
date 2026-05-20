<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { localeStore, toggleLocale, t } from '$lib/i18n/store';
</script>

<IconButton label={$t('header.locale.toggle')} onclick={toggleLocale}>
  <span aria-hidden="true">{$localeStore === 'zh' ? '语' : 'EN'}</span>
</IconButton>
