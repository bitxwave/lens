<script lang="ts">
  import { onMount } from 'svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { uploadIcon } from '$lib/api/icons';
  import { ApiError } from '$lib/api/client';
  import { t } from '$lib/i18n/store';
  import type { IconKind } from '$lib/types/nav';

  interface Props {
    kind: IconKind;
    value: string;
    /** Which kinds the caller exposes. Defaults to all three. */
    allowedKinds?: IconKind[];
    /** Show the "Upload local file" button under the URL mode. Default true. */
    showUpload?: boolean;
    /** Hide the inner "Icon source" label above the kind <select>. Use
     *  when the caller already provides a heading for the picker (e.g.
     *  "Site avatar" in the admin form) and the inner label would
     *  duplicate that heading. Default false to preserve the standalone
     *  picker's existing layout. */
    hideKindLabel?: boolean;
  }

  let {
    kind = $bindable('asset'),
    value = $bindable(''),
    allowedKinds = ['asset', 'url', 'auto-favicon'],
    showUpload = true,
    hideKindLabel = false
  }: Props = $props();

  /** List of bundled asset filenames; loaded lazily on first mount. */
  let assetIcons = $state<string[]>([]);
  let assetIconsLoaded = false;
  async function loadAssetIcons() {
    if (assetIconsLoaded || !allowedKinds.includes('asset')) return;
    assetIconsLoaded = true;
    try {
      const res = await fetch('/navIcons-manifest.json');
      if (res.ok) assetIcons = (await res.json()) as string[];
    } catch {
      /* manifest may be missing in some build flavors; picker just shows empty */
    }
  }
  onMount(loadAssetIcons);

  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let fileInput: HTMLInputElement | null = $state(null);

  async function onFilePicked(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    uploadError = null;
    uploading = true;
    try {
      const { path } = await uploadIcon(file);
      kind = 'url';
      value = path;
    } catch (err) {
      uploadError = err instanceof ApiError ? err.message : $t('editor.icon.upload.failed');
    } finally {
      uploading = false;
    }
  }
</script>

{#if allowedKinds.length > 1}
  <label class="grp">
    {#if !hideKindLabel}
      <span class="lbl">{$t('editor.icon.source')}</span>
    {/if}
    <select bind:value={kind}>
      {#if allowedKinds.includes('asset')}
        <option value="asset">{$t('editor.icon.kind.asset')}</option>
      {/if}
      {#if allowedKinds.includes('url')}
        <option value="url"
          >{showUpload ? $t('editor.icon.kind.urlOrUpload') : $t('editor.icon.kind.url')}</option
        >
      {/if}
      {#if allowedKinds.includes('auto-favicon')}
        <option value="auto-favicon">{$t('editor.icon.kind.autoFavicon')}</option>
      {/if}
    </select>
  </label>
{/if}

{#if kind === 'asset'}
  <div class="grp">
    <span class="lbl">
      {$t('editor.icon.bundled.label')}
      {#if assetIcons.length}({assetIcons.length}){/if}
    </span>
    <div class="icon-picker">
      {#each assetIcons as f (f)}
        <button
          type="button"
          class="icon-cell"
          class:selected={value === f}
          title={f}
          onclick={() => (value = f)}
        >
          <img src="/navIcons/{f}" alt={f} loading="lazy" />
        </button>
      {/each}
    </div>
    {#if value}
      <span class="picked">{$t('editor.icon.selected')} <code>{value}</code></span>
    {/if}
  </div>
{:else if kind === 'url'}
  <Input
    label={$t('editor.icon.url.label')}
    bind:value
    placeholder={$t('editor.icon.url.placeholder')}
  />
  {#if showUpload}
    <div class="upload">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        class="file-input"
        bind:this={fileInput}
        onchange={onFilePicked}
      />
      <button
        type="button"
        class="upload-btn"
        onclick={() => fileInput?.click()}
        disabled={uploading}
      >
        {uploading ? $t('editor.icon.upload.uploading') : $t('editor.icon.upload.button')}
      </button>
      {#if uploadError}<span class="err">{uploadError}</span>{/if}
    </div>
  {/if}
  {#if value}
    <div class="preview" aria-hidden="true">
      <img
        src={value}
        alt=""
        onerror={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = '0')}
      />
    </div>
  {/if}
{:else if kind === 'auto-favicon'}
  <Input
    label={$t('editor.icon.host.label')}
    bind:value
    placeholder={$t('editor.icon.host.placeholder')}
  />
{/if}

<style lang="scss">
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
  /* <select> base styling lives in app.scss (shared chevron + padding). */
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
  .upload {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .file-input {
    display: none;
  }
  .upload-btn {
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
  .err {
    color: var(--c-danger);
    font-size: var(--fs-xs);
  }
  .preview {
    width: 64px;
    height: 64px;
    padding: 6px;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }
  :global([data-theme='dark']) .preview {
    background: rgba(255, 255, 255, 0.06);
  }
</style>
