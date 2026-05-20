<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  function onLoginClick() {
    // Plan 4 will replace this with a LoginDialog open trigger.
    // For now, show a placeholder toast or no-op so Plan 3 stays read-only.
    alert($t('auth.login.title') + ' — coming in Plan 4');
  }

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={onLoginClick}>{$t('header.login')}</Button>
{/if}
