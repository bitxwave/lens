<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import IconSourcePicker from '$lib/components/Editor/IconSourcePicker.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { patchConfig } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

  let layoutMode = $state<'grouped' | 'flat'>('grouped');
  let siteName = $state('');
  let siteCopyright = $state('');
  /** IconSourcePicker bindings. `avatarValue` is the picker-relative payload:
   *   - kind=asset → bundled icon filename ("foo.png")
   *   - kind=url   → raw URL or absolute path ("/icons/abc.png" or "https://…") */
  let avatarKind = $state<'asset' | 'url' | 'auto-favicon'>('url');
  let avatarValue = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let initial = $state({
    layoutMode: 'grouped',
    siteName: '',
    siteAvatarPath: '',
    siteCopyright: ''
  });

  /** Map the stored config string to the picker's (kind, value) pair. */
  function loadAvatar(path: string) {
    if (path.startsWith('/navIcons/')) {
      avatarKind = 'asset';
      avatarValue = path.slice('/navIcons/'.length);
    } else {
      avatarKind = 'url';
      avatarValue = path;
    }
  }
  /** Inverse of loadAvatar; produces the string to persist in config. */
  function currentAvatarPath(): string {
    const v = avatarValue.trim();
    if (avatarKind === 'asset' && v) return `/navIcons/${v}`;
    return v;
  }

  let hydrated = false;
  $effect(() => {
    const m = $navDataStore.bundle?.meta;
    if (!m || hydrated) return;
    layoutMode = (m.layoutMode ?? 'grouped') as 'grouped' | 'flat';
    siteName = m.siteName ?? '';
    siteCopyright = m.siteCopyright ?? '';
    loadAvatar(m.siteAvatarPath ?? '');
    initial = {
      layoutMode,
      siteName,
      siteAvatarPath: m.siteAvatarPath ?? '',
      siteCopyright
    };
    hydrated = true;
  });

  async function save() {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const changes: Array<{ key: string; value: string }> = [];
      const avatarPath = currentAvatarPath();
      if (layoutMode !== initial.layoutMode) {
        changes.push({ key: 'layout_mode', value: layoutMode });
      }
      if (siteName.trim() !== initial.siteName) {
        changes.push({ key: 'site_name', value: siteName.trim() });
      }
      if (avatarPath !== initial.siteAvatarPath) {
        changes.push({ key: 'site_avatar_path', value: avatarPath });
      }
      if (siteCopyright !== initial.siteCopyright) {
        changes.push({ key: 'site_copyright', value: siteCopyright });
      }
      if (changes.length > 0) {
        await patchConfig(changes);
        await navDataStore.refetch();
        initial = { layoutMode, siteName, siteAvatarPath: avatarPath, siteCopyright };
      }
      toast.success($t('common.save') + ' ✓');
    } catch (e) {
      error = e instanceof ApiError ? (e.message ?? e.code) : $t('error.unknown');
    } finally {
      saving = false;
    }
  }
</script>

<div class="form">
  <fieldset>
    <legend>Branding</legend>
    <Input label="Site title" bind:value={siteName} placeholder="Pico Nav" />
    <div class="grp">
      <span class="lbl">Site avatar</span>
      <IconSourcePicker
        bind:kind={avatarKind}
        bind:value={avatarValue}
        allowedKinds={['asset', 'url']}
      />
      <small class="help">Shown next to the site title in the header. Leave blank to hide.</small>
    </div>
    <Input label="Footer copyright" bind:value={siteCopyright} placeholder="© 2026 Your Name" />
  </fieldset>

  <fieldset>
    <legend>Layout mode</legend>
    <div class="layout-grid">
      <label class="layout-option" class:selected={layoutMode === 'grouped'}>
        <input
          type="radio"
          name="layoutMode"
          value="grouped"
          bind:group={layoutMode}
          class="sr-only"
        />
        <svg class="mockup" viewBox="0 0 100 60" aria-hidden="true">
          {#each [9, 31, 53, 75] as fx}
            <rect class="folder" x={fx} y="14" width="16" height="16" rx="3" />
            <rect class="dot" x={fx + 2.5} y="16.5" width="5" height="5" rx="1" />
            <rect class="dot" x={fx + 8.5} y="16.5" width="5" height="5" rx="1" />
            <rect class="dot" x={fx + 2.5} y="22.5" width="5" height="5" rx="1" />
            <rect class="dot" x={fx + 8.5} y="22.5" width="5" height="5" rx="1" />
            <rect class="title" x={fx + 3} y="34" width="10" height="3" rx="1" />
          {/each}
        </svg>
        <strong>Grouped</strong>
        <small>Sections per group</small>
      </label>
      <label class="layout-option" class:selected={layoutMode === 'flat'}>
        <input
          type="radio"
          name="layoutMode"
          value="flat"
          bind:group={layoutMode}
          class="sr-only"
        />
        <svg class="mockup" viewBox="0 0 100 60" aria-hidden="true">
          {#each [4, 16, 28, 40] as x}
            {#each [6, 22, 38] as y}
              <rect class="tile" {x} {y} width="9" height="9" rx="1.5" />
            {/each}
          {/each}
        </svg>
        <strong>Flat</strong>
        <small>All items in one grid</small>
      </label>
    </div>
  </fieldset>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="actions">
    <Button intent="primary" onclick={save} loading={saving}>{$t('common.save')}</Button>
  </div>
</div>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  fieldset {
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: var(--rd-md);
    padding: var(--sp-3) var(--sp-4);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  :global([data-theme='dark']) fieldset {
    border-color: rgba(255, 255, 255, 0.16);
  }
  legend {
    padding: 0 var(--sp-2);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
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
  .help {
    font-size: var(--fs-xs);
    color: var(--c-text-3);
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

  .layout-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }
  .layout-option {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 2px solid var(--c-border);
    border-radius: var(--rd-md);
    background: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    transition:
      border-color var(--tr-fast),
      background var(--tr-fast);

    &:hover {
      border-color: var(--c-accent);
    }
    &.selected {
      border-color: var(--c-accent);
      background: var(--c-accent-bg);
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
  :global([data-theme='dark']) .layout-option {
    background: rgba(255, 255, 255, 0.04);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .mockup {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 100 / 60;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 6px;
    overflow: hidden;
  }
  :global([data-theme='dark']) .mockup {
    background: rgba(255, 255, 255, 0.06);
  }
  .mockup .title {
    fill: rgba(0, 0, 0, 0.5);
  }
  .mockup .folder {
    fill: rgba(0, 0, 0, 0.06);
    stroke: rgba(0, 0, 0, 0.18);
    stroke-width: 0.5;
  }
  .mockup .dot,
  .mockup .tile {
    fill: rgba(0, 0, 0, 0.28);
  }
  :global([data-theme='dark']) .mockup .title {
    fill: rgba(255, 255, 255, 0.55);
  }
  :global([data-theme='dark']) .mockup .folder {
    fill: rgba(255, 255, 255, 0.04);
    stroke: rgba(255, 255, 255, 0.22);
  }
  :global([data-theme='dark']) .mockup .dot,
  :global([data-theme='dark']) .mockup .tile {
    fill: rgba(255, 255, 255, 0.32);
  }
  .layout-option.selected .mockup .title {
    fill: var(--c-accent);
  }
  .layout-option.selected .mockup .folder {
    fill: color-mix(in srgb, var(--c-accent) 12%, transparent);
    stroke: var(--c-accent);
  }
  .layout-option.selected .mockup .dot,
  .layout-option.selected .mockup .tile {
    fill: color-mix(in srgb, var(--c-accent) 70%, transparent);
  }
</style>
