<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n/store';
  import { navDataStore } from '$lib/stores/navData';
  import { createItem, patchItem, type ItemPayload } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';
  import { ApiError } from '$lib/api/client';
  import type { Item } from '$lib/types/nav';

  /** List of bundled asset filenames, fetched lazily on first open.
   * Generated at build/dev time by vite plugin in vite.config.ts. */
  let assetIcons = $state<string[]>([]);
  let assetIconsLoaded = false;
  async function loadAssetIcons() {
    if (assetIconsLoaded) return;
    assetIconsLoaded = true;
    try {
      const res = await fetch('/navIcons-manifest.json');
      if (res.ok) assetIcons = (await res.json()) as string[];
    } catch {
      /* manifest may be missing in some build flavors; picker just shows empty */
    }
  }
  onMount(loadAssetIcons);

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
  /** Each row = (site value, url). Empty rows are dropped on submit. */
  let linkRows = $state<Array<{ siteValue: string; url: string }>>([]);
  let tagSlugsCsv = $state(''); // simplified: comma-separated
  let submitting = $state(false);
  let error = $state<string | null>(null);

  let hydrated = $state(false);
  $effect(() => {
    if (open && !hydrated) {
      if (target) {
        name = target.name;
        groupId = target.groupId;
        iconKind = target.iconKind;
        iconValue = target.iconValue;
        linkRows = Object.entries(target.links).map(([siteValue, url]) => ({ siteValue, url }));
        tagSlugsCsv = target.tagSlugs.join(', ');
      } else {
        name = '';
        groupId = defaultGroupId;
        iconKind = 'asset';
        iconValue = '';
        const firstSite = $navDataStore.bundle?.sites[0]?.value ?? '';
        linkRows = firstSite ? [{ siteValue: firstSite, url: '' }] : [];
        tagSlugsCsv = '';
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
      <span class="lbl">Icon source</span>
      <select bind:value={iconKind}>
        <option value="asset">Pick a bundled icon</option>
        <option value="url">Custom image URL</option>
        <option value="auto-favicon">Auto from website (host)</option>
      </select>
    </label>
    {#if iconKind === 'asset'}
      <div class="grp">
        <span class="lbl">
          Bundled icons {#if assetIcons.length}({assetIcons.length}){/if}
        </span>
        <div class="icon-picker">
          {#each assetIcons as f (f)}
            <button
              type="button"
              class="icon-cell"
              class:selected={iconValue === f}
              title={f}
              onclick={() => (iconValue = f)}
            >
              <img src="/navIcons/{f}" alt={f} loading="lazy" />
            </button>
          {/each}
        </div>
        {#if iconValue}
          <span class="picked">Selected: <code>{iconValue}</code></span>
        {/if}
      </div>
    {:else}
      <Input
        label={iconKind === 'url' ? 'Image URL' : 'Website host (e.g. example.com)'}
        bind:value={iconValue}
        placeholder={iconKind === 'url' ? 'https://example.com/logo.png' : 'example.com'}
      />
    {/if}
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

  /* Bundled-icon grid: small clickable thumbnails. */
  .icon-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, 56px);
    gap: var(--sp-2);
    max-height: 220px;
    overflow-y: auto;
    padding: var(--sp-2);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    background: rgba(255, 255, 255, 0.4);
  }
  :global([data-theme='dark']) .icon-picker {
    background: rgba(255, 255, 255, 0.04);
  }
  .icon-cell {
    width: 56px;
    height: 56px;
    padding: 6px;
    border: 2px solid transparent;
    background: rgba(255, 255, 255, 0.65);
    border-radius: var(--rd-md);
    cursor: pointer;
    transition:
      border-color var(--tr-fast),
      transform var(--tr-fast);

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    &:hover {
      transform: translateY(-1px);
      border-color: var(--c-accent);
    }
    &.selected {
      border-color: var(--c-accent);
      background: var(--c-accent-bg);
    }
  }
  .picked {
    font-size: var(--fs-xs);
    color: var(--c-text-3);

    code {
      font-family: var(--ft-mono);
      color: var(--c-text-2);
    }
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
