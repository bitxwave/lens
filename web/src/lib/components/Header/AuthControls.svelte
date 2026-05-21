<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import LoginDialog from '$lib/components/Editor/LoginDialog.svelte';
  import ChangePasswordDialog from '$lib/components/Editor/ChangePasswordDialog.svelte';
  import EditToggle from './EditToggle.svelte';
  import { goto } from '$app/navigation';
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
  <IconButton label="Admin" onclick={() => goto('/admin')}>
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
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
  </IconButton>
  <IconButton label="Change password" onclick={() => (pwOpen = true)}>
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
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 21 2" />
      <path d="m18 5 3 3" />
      <path d="m15 8 3 3" />
    </svg>
  </IconButton>
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={() => (loginOpen = true)}>{$t('header.login')}</Button>
{/if}

<LoginDialog bind:open={loginOpen} />
<ChangePasswordDialog bind:open={pwOpen} />
