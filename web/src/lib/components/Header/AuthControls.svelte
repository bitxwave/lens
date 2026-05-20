<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import LoginDialog from '$lib/components/Editor/LoginDialog.svelte';
  import ChangePasswordDialog from '$lib/components/Editor/ChangePasswordDialog.svelte';
  import EditToggle from './EditToggle.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  let loginOpen = $state(false);
  let pwOpen = $state(false);

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <EditToggle />
  <Button intent="ghost" size="sm" onclick={() => (pwOpen = true)}>🔑</Button>
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={() => (loginOpen = true)}>{$t('header.login')}</Button>
{/if}

<LoginDialog bind:open={loginOpen} />
<ChangePasswordDialog bind:open={pwOpen} />
