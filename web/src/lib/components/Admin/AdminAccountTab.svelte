<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { changePassword } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';
  import { goto } from '$app/navigation';

  let current = $state('');
  let next = $state('');
  let confirmPw = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit() {
    if (submitting) return;
    error = null;
    if (next.length < 8) {
      error = $t('admin.account.error.minLength');
      return;
    }
    if (next !== confirmPw) {
      error = $t('admin.account.error.mismatch');
      return;
    }
    submitting = true;
    try {
      await changePassword(current, next);
      toast.success($t('common.save') + ' ✓');
      current = next = confirmPw = '';
      // Server invalidates the session on password change. Redirect home
      // so the user can sign back in with the new password rather than
      // staring at a now-401-failing admin panel.
      await goto('/', { replaceState: true });
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

<form
  class="form"
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
>
  <fieldset>
    <legend>{$t('admin.account.legend.password')}</legend>
    <Input
      label={$t('admin.account.field.current')}
      type="password"
      bind:value={current}
      autocomplete="current-password"
    />
    <Input
      label={$t('admin.account.field.new')}
      type="password"
      bind:value={next}
      autocomplete="new-password"
    />
    <Input
      label={$t('admin.account.field.confirm')}
      type="password"
      bind:value={confirmPw}
      autocomplete="new-password"
    />
  </fieldset>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="actions">
    <Button
      intent="primary"
      onclick={submit}
      loading={submitting}
      disabled={!current || !next || !confirmPw}
    >
      {$t('common.save')}
    </Button>
  </div>
</form>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  fieldset {
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    padding: var(--sp-3) var(--sp-4);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  legend {
    padding: 0 var(--sp-2);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
  }
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
