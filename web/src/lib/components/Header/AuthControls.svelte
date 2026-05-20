<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import LoginDialog from '$lib/components/Editor/LoginDialog.svelte';
  import ChangePasswordDialog from '$lib/components/Editor/ChangePasswordDialog.svelte';
  import SettingsDialog from '$lib/components/Editor/SettingsDialog.svelte';
  import EditToggle from './EditToggle.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  let loginOpen = $state(false);
  let pwOpen = $state(false);
  let settingsOpen = $state(false);

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <EditToggle />
  <IconButton label="Settings" onclick={() => (settingsOpen = true)}>
    <span aria-hidden="true">⚙</span>
  </IconButton>
  <IconButton label="Change password" onclick={() => (pwOpen = true)}>
    <span aria-hidden="true">🔑</span>
  </IconButton>
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={() => (loginOpen = true)}>{$t('header.login')}</Button>
{/if}

<LoginDialog bind:open={loginOpen} />
<ChangePasswordDialog bind:open={pwOpen} />
<SettingsDialog bind:open={settingsOpen} />
