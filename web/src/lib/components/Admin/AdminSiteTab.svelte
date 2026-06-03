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
    <legend>{$t('admin.site.legend.branding')}</legend>
    <Input
      label={$t('admin.site.field.title')}
      bind:value={siteName}
      placeholder={$t('admin.site.field.title.placeholder')}
    />
    <section class="field-group">
      <header class="fg-head">
        <span class="fg-title">{$t('admin.site.field.avatar')}</span>
        <small class="fg-help">{$t('admin.site.field.avatar.help')}</small>
      </header>
      <div class="fg-body">
        <IconSourcePicker
          bind:kind={avatarKind}
          bind:value={avatarValue}
          allowedKinds={['asset', 'url']}
          hideKindLabel
        />
      </div>
    </section>
    <Input
      label={$t('admin.site.field.copyright')}
      bind:value={siteCopyright}
      placeholder={$t('admin.site.field.copyright.placeholder')}
    />
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
  /* Avatar field-group: this block has more chrome than a single Input
   * (a kind select + URL/path input + upload button + thumbnail), so
   * it gets a heading-and-body shape instead of a plain Input-style
   * label. The title sits in semibold above its description, then the
   * picker controls go in a tinted body — making it clear "site
   * avatar" is the heading and everything below is its content. The
   * surrounding fieldset border still groups it with the other
   * branding fields so it doesn't read as a separate section. */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .fg-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fg-title {
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--c-text);
  }
  .fg-help {
    font-size: var(--fs-xs);
    color: var(--c-text-3);
  }
  .fg-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--c-surface-2);
    border-radius: var(--rd-md);
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
