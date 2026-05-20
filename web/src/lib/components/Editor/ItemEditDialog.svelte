<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n/store';
  import { navDataStore } from '$lib/stores/navData';
  import { createItem, patchItem, type ItemPayload } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';
  import { ApiError } from '$lib/api/client';
  import type { Item } from '$lib/types/nav';

  interface Props {
    open: boolean;
    /** When set, dialog is in edit mode for this item; null = create. */
    target: Item | null;
    /** Initial group for create mode. */
    defaultGroupId?: number | null;
  }

  let { open = $bindable(false), target, defaultGroupId = null }: Props = $props();

  // Form state
  let name = $state('');
  let groupId = $state<number | null>(null);
  let iconKind = $state<'asset' | 'url' | 'auto-favicon'>('asset');
  let iconValue = $state('');
  let linksJson = $state('{}'); // simplified MVP: edit links as JSON
  let tagSlugsCsv = $state(''); // simplified: comma-separated
  let submitting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    // sync form when target / open changes
    if (!open) return;
    if (target) {
      name = target.name;
      groupId = target.groupId;
      iconKind = target.iconKind;
      iconValue = target.iconValue;
      linksJson = JSON.stringify(target.links, null, 2);
      tagSlugsCsv = target.tagSlugs.join(', ');
    } else {
      name = '';
      groupId = defaultGroupId;
      iconKind = 'asset';
      iconValue = '';
      linksJson = '{}';
      tagSlugsCsv = '';
    }
    error = null;
  });

  function parseLinks(): Record<string, string> {
    try {
      const parsed = JSON.parse(linksJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        );
      }
    } catch {
      /* fallthrough to error */
    }
    throw new Error('links must be a JSON object: { "siteValue": "url", ... }');
  }

  async function submit() {
    if (submitting) return;
    error = null;
    submitting = true;
    try {
      const links = parseLinks();
      const payload: ItemPayload = {
        groupId,
        name: name.trim(),
        iconKind,
        iconValue: iconValue.trim(),
        links,
        tagSlugs: tagSlugsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      };
      if (target) {
        await patchItem(target.id, payload);
        toast.success($t('common.save') + ' ✓');
      } else {
        await createItem(payload);
        toast.success($t('editor.item.new') + ' ✓');
      }
      navDataStore.refetch();
      open = false;
    } catch (e) {
      if (e instanceof ApiError) error = `${e.code}${e.message ? ': ' + e.message : ''}`;
      else if (e instanceof Error) error = e.message;
      else error = $t('error.unknown');
    } finally {
      submitting = false;
    }
  }

  const groupOptions = $derived($navDataStore.bundle?.groups ?? []);
</script>

<Dialog bind:open title={target ? $t('common.edit') : $t('editor.item.new')} width="md">
  <div class="form">
    <Input label={$t('common.edit') + ' — name'} bind:value={name} />
    <label class="grp">
      <span class="lbl">Group</span>
      <select bind:value={groupId}>
        <option value={null}>—</option>
        {#each groupOptions as g (g.id)}
          <option value={g.id}>{g.name}</option>
        {/each}
      </select>
    </label>
    <label class="grp">
      <span class="lbl">Icon kind</span>
      <select bind:value={iconKind}>
        <option value="asset">asset (file under /navIcons/)</option>
        <option value="url">url (full URL)</option>
        <option value="auto-favicon">auto-favicon (host)</option>
      </select>
    </label>
    <Input
      label="Icon value"
      bind:value={iconValue}
      placeholder="example.png / https://… / example.com"
    />
    <label class="grp">
      <span class="lbl">Links (JSON: siteValue → URL)</span>
      <textarea rows="4" bind:value={linksJson}></textarea>
    </label>
    <Input label="Tag slugs (comma-separated)" bind:value={tagSlugsCsv} placeholder="fav, tools" />
    {#if error}<p class="err">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={submit} loading={submitting} disabled={!name || !iconValue}>
      {$t('common.save')}
    </Button>
  {/snippet}
</Dialog>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .grp {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    font-size: var(--fs-sm);
  }
  .lbl {
    color: var(--c-text-2);
    font-weight: var(--fw-medium);
  }
  select,
  textarea {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    padding: var(--sp-2) var(--sp-3);
    font-family: inherit;
    font-size: var(--fs-md);
    &:focus {
      border-color: var(--c-accent);
      outline: none;
      box-shadow: 0 0 0 3px var(--c-accent-bg);
    }
  }
  textarea {
    font-family: var(--ft-mono);
    font-size: var(--fs-sm);
  }
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }
</style>
