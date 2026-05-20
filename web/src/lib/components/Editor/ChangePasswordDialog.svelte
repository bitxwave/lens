<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { changePassword } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit() {
    error = null;
    if (next.length < 8) {
      error = 'New password must be ≥ 8 chars';
      return;
    }
    if (next !== confirm) {
      error = 'New passwords do not match';
      return;
    }
    submitting = true;
    try {
      await changePassword(current, next);
      toast.success($t('common.save') + ' ✓');
      current = next = confirm = '';
      open = false;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) error = $t('auth.login.error.bad_password');
        else error = e.message ?? $t('error.unknown');
      } else error = $t('error.unknown');
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open title="Change admin password" width="sm">
  <div class="form">
    <Input label="Current password" type="password" bind:value={current} />
    <Input label="New password (≥ 8 chars)" type="password" bind:value={next} />
    <Input label="Confirm new password" type="password" bind:value={confirm} />
    {#if error}<p class="err">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button
      intent="primary"
      onclick={submit}
      loading={submitting}
      disabled={!current || !next || !confirm}>{$t('common.save')}</Button
    >
  {/snippet}
</Dialog>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }
</style>
