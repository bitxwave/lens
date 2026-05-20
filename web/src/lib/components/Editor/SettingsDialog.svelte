<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { patchConfig } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  let layoutMode = $state<'grouped' | 'flat'>('grouped');
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    layoutMode = ($navDataStore.bundle?.meta.layoutMode ?? 'grouped') as 'grouped' | 'flat';
    error = null;
  });

  async function save() {
    if (saving) return;
    saving = true;
    error = null;
    try {
      await patchConfig([{ key: 'layout_mode', value: layoutMode }]);
      await navDataStore.refetch();
      toast.success($t('common.save') + ' ✓');
      open = false;
    } catch (e) {
      error = e instanceof ApiError ? (e.message ?? e.code) : $t('error.unknown');
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title="Site settings" width="sm">
  <div class="form">
    <fieldset>
      <legend>Layout mode</legend>
      <label class="radio">
        <input type="radio" name="layoutMode" value="grouped" bind:group={layoutMode} />
        <span>
          <strong>Grouped</strong>
          <small>Render sections per group (Network / Media / NAS / Tools).</small>
        </span>
      </label>
      <label class="radio">
        <input type="radio" name="layoutMode" value="flat" bind:group={layoutMode} />
        <span>
          <strong>Flat</strong>
          <small>Render every visible item in one grid (legacy nav-only layout).</small>
        </span>
      </label>
    </fieldset>
    {#if error}<p class="err">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={save} loading={saving}>{$t('common.save')}</Button>
  {/snippet}
</Dialog>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
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
    font-weight: var(--fw-medium);
    color: var(--c-text-2);
  }
  .radio {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    cursor: pointer;
    input[type='radio'] {
      margin-top: 4px;
      accent-color: var(--c-accent);
    }
    span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    strong {
      font-size: var(--fs-md);
      color: var(--c-text);
    }
    small {
      font-size: var(--fs-xs);
      color: var(--c-text-3);
    }
  }
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }
</style>
