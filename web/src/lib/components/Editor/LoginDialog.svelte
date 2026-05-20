<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { ApiError } from '$lib/api/client';
  import { t } from '$lib/i18n/store';
  import { toast } from '$lib/components/ui/toast';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  let password = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (!password || submitting) return;
    error = null;
    submitting = true;
    try {
      await sessionStore.login(password);
      toast.success($t('auth.login.title') + ' ✓');
      password = '';
      open = false;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) error = $t('auth.login.error.bad_password');
        else if (e.status === 429) error = $t('auth.login.error.rate_limited');
        else error = $t('error.unknown');
      } else {
        error = $t('error.network.offline');
      }
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open title={$t('auth.login.title')} width="sm">
  <form onsubmit={submit}>
    <Input
      label={$t('auth.login.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      invalid={!!error}
      errorText={error ?? undefined}
    />
  </form>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={() => submit()} disabled={!password} loading={submitting}>
      {$t('auth.login.submit')}
    </Button>
  {/snippet}
</Dialog>
