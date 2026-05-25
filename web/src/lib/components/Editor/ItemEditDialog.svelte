<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconSourcePicker from './IconSourcePicker.svelte';
  import { t } from '$lib/i18n/store';
  import { navDataStore } from '$lib/stores/navData';
  import { createCard, patchCard } from '$lib/api/cards';
  import type { CardPayload, CardPatch } from '$lib/types/card';
  import { toast } from '$lib/components/ui/toast';
  import { ApiError } from '$lib/api/client';
  import type { Card } from '$lib/types/card';

  interface Props {
    open: boolean;
    /** When set, dialog is in edit mode for this item; null = create. */
    target: Card | null;
    /** Initial parent (folder id) for create mode. */
    defaultParentId?: number | null;
  }

  let { open = $bindable(false), target, defaultParentId = null }: Props = $props();

  // Form state
  let name = $state('');
  let parentId = $state<number | null>(null);
  let iconKind = $state<'asset' | 'url' | 'auto-favicon'>('asset');
  let iconValue = $state('');
  /** Each row = (site value, url). Empty rows are dropped on submit. */
  let linkRows = $state<Array<{ siteValue: string; url: string }>>([]);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  let hydrated = $state(false);
  $effect(() => {
    if (open && !hydrated) {
      if (target) {
        name = target.name;
        parentId = target.parentId ?? null;
        iconKind = target.iconKind ?? 'asset';
        iconValue = target.iconValue ?? '';
        linkRows = Object.entries(target.links ?? {}).map(([siteValue, url]) => ({
          siteValue,
          url
        }));
      } else {
        name = '';
        parentId = defaultParentId;
        iconKind = 'asset';
        iconValue = '';
        const firstSite = $navDataStore.bundle?.sites[0]?.value ?? '';
        linkRows = firstSite ? [{ siteValue: firstSite, url: '' }] : [];
      }
      error = null;
      hydrated = true;
    } else if (!open) {
      hydrated = false;
    }
  });

  const siteOptions = $derived($navDataStore.bundle?.sites ?? []);

  function siteLabelFor(value: string): string {
    return siteOptions.find((s) => s.value === value)?.name ?? value;
  }

  function addLinkRow() {
    const taken = new Set(linkRows.map((r) => r.siteValue));
    const next = siteOptions.find((s) => !taken.has(s.value))?.value ?? siteOptions[0]?.value ?? '';
    linkRows = [...linkRows, { siteValue: next, url: '' }];
  }

  function removeLinkRow(i: number) {
    linkRows = linkRows.filter((_, idx) => idx !== i);
  }

  function buildLinks(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of linkRows) {
      const url = row.url.trim();
      if (!url || !row.siteValue) continue;
      out[row.siteValue] = url;
    }
    return out;
  }

  async function submit() {
    if (submitting) return;
    error = null;
    submitting = true;
    try {
      const links = buildLinks();
      if (Object.keys(links).length === 0) {
        throw new Error('At least one link is required.');
      }
      if (target) {
        const patch: CardPatch = {
          name: name.trim(),
          iconKind,
          iconValue: iconValue.trim(),
          links
        };
        if ((target.parentId ?? null) !== parentId) {
          patch.parentId = parentId;
        }
        await patchCard(target.id, patch);
        toast.success($t('common.save') + ' ✓');
      } else {
        const payload: CardPayload = {
          kind: 'item',
          parentId,
          name: name.trim(),
          iconKind,
          iconValue: iconValue.trim(),
          links
        };
        await createCard(payload);
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

  /** Folders the user can drop this item into. */
  const folderOptions = $derived(
    ($navDataStore.bundle?.cards ?? [])
      .filter((c) => c.kind === 'folder')
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );
</script>

<Dialog bind:open title={target ? $t('common.edit') : $t('editor.item.new')} width="md">
  <div class="form">
    <Input label={$t('common.edit') + ' — name'} bind:value={name} />
    <label class="grp">
      <span class="lbl">Folder</span>
      <select bind:value={parentId}>
        <option value={null}>—</option>
        {#each folderOptions as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    </label>
    <IconSourcePicker bind:kind={iconKind} bind:value={iconValue} />

    <div class="grp">
      <span class="lbl">Links per site</span>
      <div class="links">
        {#each linkRows as row, i (i)}
          <div class="link-row">
            <select bind:value={row.siteValue} aria-label="Site">
              {#each siteOptions as s (s.value)}
                <option value={s.value}>{siteLabelFor(s.value)}</option>
              {/each}
            </select>
            <input
              type="url"
              placeholder="https://…"
              bind:value={row.url}
              aria-label="URL for {siteLabelFor(row.siteValue)}"
            />
            <button
              type="button"
              class="remove"
              aria-label="Remove link"
              onclick={() => removeLinkRow(i)}>×</button
            >
          </div>
        {/each}
        <button
          type="button"
          class="add"
          onclick={addLinkRow}
          disabled={linkRows.length >= siteOptions.length}
        >
          ＋ Add link
        </button>
      </div>
    </div>
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
  select {
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
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }

  /* Per-site link rows: site picker | url input | remove */
  .links {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .link-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.4fr) 1fr auto;
    gap: var(--sp-2);
    align-items: stretch;
  }
  .link-row select,
  .link-row input {
    min-width: 0;
  }
  .link-row input[type='url'] {
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
  .remove {
    width: 36px;
    height: 36px;
    border: 1px solid var(--c-border);
    background: transparent;
    color: var(--c-text-3);
    border-radius: var(--rd-md);
    font-size: var(--fs-lg);
    line-height: 1;
    cursor: pointer;
    transition:
      color var(--tr-fast),
      border-color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      color: var(--c-danger);
      border-color: var(--c-danger);
      background: var(--c-danger-bg);
    }
  }
  .add {
    align-self: flex-start;
    padding: var(--sp-2) var(--sp-3);
    background: transparent;
    color: var(--c-accent);
    border: 1px dashed var(--c-accent);
    border-radius: var(--rd-md);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background var(--tr-fast);
    &:hover:not(:disabled) {
      background: var(--c-accent-bg);
    }
    &:disabled {
      color: var(--c-text-3);
      border-color: var(--c-border);
      cursor: not-allowed;
    }
  }
</style>
