<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
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
  let siteName = $state('');
  let siteAvatarPath = $state('');
  let siteCopyright = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Snapshot of values when the dialog opened, so we only send changed keys.
  let initial = $state({
    layoutMode: 'grouped',
    siteName: '',
    siteAvatarPath: '',
    siteCopyright: ''
  });

  // Hydrate inputs once per open transition. Tracking only `open` (not the
  // navDataStore meta inside) prevents bundle refetches mid-edit from wiping
  // the user's typed-but-not-yet-saved values.
  let hydrated = $state(false);
  $effect(() => {
    if (open && !hydrated) {
      const m = $navDataStore.bundle?.meta;
      layoutMode = (m?.layoutMode ?? 'grouped') as 'grouped' | 'flat';
      siteName = m?.siteName ?? '';
      siteAvatarPath = m?.siteAvatarPath ?? '';
      siteCopyright = m?.siteCopyright ?? '';
      initial = { layoutMode, siteName, siteAvatarPath, siteCopyright };
      error = null;
      hydrated = true;
    } else if (!open) {
      hydrated = false;
    }
  });

  async function save() {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const changes: Array<{ key: string; value: string }> = [];
      if (layoutMode !== initial.layoutMode) {
        changes.push({ key: 'layout_mode', value: layoutMode });
      }
      if (siteName.trim() !== initial.siteName) {
        changes.push({ key: 'site_name', value: siteName.trim() });
      }
      if (siteAvatarPath.trim() !== initial.siteAvatarPath) {
        changes.push({ key: 'site_avatar_path', value: siteAvatarPath.trim() });
      }
      if (siteCopyright !== initial.siteCopyright) {
        changes.push({ key: 'site_copyright', value: siteCopyright });
      }
      if (changes.length > 0) {
        await patchConfig(changes);
        await navDataStore.refetch();
      }
      toast.success($t('common.save') + ' ✓');
      open = false;
    } catch (e) {
      error = e instanceof ApiError ? (e.message ?? e.code) : $t('error.unknown');
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title="Site settings" width="md">
  <div class="form">
    <fieldset>
      <legend>Branding</legend>
      <Input label="Site title" bind:value={siteName} placeholder="Pico Nav" />
      <Input
        label="Site avatar URL or path"
        bind:value={siteAvatarPath}
        placeholder="/avatars/me.png or https://…"
        helpText="Shown next to the site title in the header. Leave blank to hide."
      />
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
          <div class="mockup" aria-hidden="true">
            <div class="hdr"></div>
            <div class="row">
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="hdr"></div>
            <div class="row">
              <span></span><span></span><span></span>
            </div>
          </div>
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
          <div class="mockup" aria-hidden="true">
            <div class="row">
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="row">
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="row">
              <span></span><span></span>
            </div>
          </div>
          <strong>Flat</strong>
          <small>All items in one grid</small>
        </label>
      </div>
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
  .err {
    margin: 0;
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }

  /* Layout mode picker — two preview cards instead of small radios.
   * Each card has a CSS-only mini mockup of the resulting layout. */
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

  /* Visually-hidden but reachable to screen readers / form submission */
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

  /* Mini mockup of a nav layout. Heights / spacing tuned to fit the card. */
  .mockup {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    height: 96px;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 6px;
    overflow: hidden;
  }
  :global([data-theme='dark']) .mockup {
    background: rgba(255, 255, 255, 0.06);
  }
  .mockup .hdr {
    width: 38%;
    height: 6px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 2px;
  }
  :global([data-theme='dark']) .mockup .hdr {
    background: rgba(255, 255, 255, 0.4);
  }
  .mockup .row {
    display: flex;
    gap: 4px;
  }
  .mockup .row span {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 3px;
  }
  :global([data-theme='dark']) .mockup .row span {
    background: rgba(255, 255, 255, 0.22);
  }
  .layout-option.selected .mockup .hdr {
    background: var(--c-accent);
  }
  .layout-option.selected .mockup .row span {
    background: color-mix(in srgb, var(--c-accent) 70%, transparent);
  }
</style>
