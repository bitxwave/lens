<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import IconSourcePicker from '$lib/components/Editor/IconSourcePicker.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { patchConfig } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

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
    siteName = m.siteName ?? '';
    siteCopyright = m.siteCopyright ?? '';
    loadAvatar(m.siteAvatarPath ?? '');
    initial = {
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
        initial = { siteName, siteAvatarPath: avatarPath, siteCopyright };
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
</style>
