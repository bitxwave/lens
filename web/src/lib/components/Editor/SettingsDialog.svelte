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
          <svg class="mockup" viewBox="0 0 100 60" aria-hidden="true">
            <!-- Group 1: bullet + title bar + 4 tiles -->
            <circle class="bullet" cx="6" cy="7" r="2" />
            <rect class="title" x="12" y="5" width="40" height="4" rx="1" />
            <rect class="tile" x="4" y="14" width="9" height="9" rx="1.5" />
            <rect class="tile" x="16" y="14" width="9" height="9" rx="1.5" />
            <rect class="tile" x="28" y="14" width="9" height="9" rx="1.5" />
            <rect class="tile" x="40" y="14" width="9" height="9" rx="1.5" />
            <!-- Group 2: bullet + title bar + 3 tiles -->
            <circle class="bullet" cx="6" cy="35" r="2" />
            <rect class="title" x="12" y="33" width="30" height="4" rx="1" />
            <rect class="tile" x="4" y="42" width="9" height="9" rx="1.5" />
            <rect class="tile" x="16" y="42" width="9" height="9" rx="1.5" />
            <rect class="tile" x="28" y="42" width="9" height="9" rx="1.5" />
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
            <!-- 4 cols × 3 rows of even tiles -->
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

  /* Mini SVG mockup of a nav layout. */
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
  .mockup .bullet,
  .mockup .title {
    fill: rgba(0, 0, 0, 0.5);
  }
  .mockup .tile {
    fill: rgba(0, 0, 0, 0.18);
  }
  :global([data-theme='dark']) .mockup .bullet,
  :global([data-theme='dark']) .mockup .title {
    fill: rgba(255, 255, 255, 0.55);
  }
  :global([data-theme='dark']) .mockup .tile {
    fill: rgba(255, 255, 255, 0.22);
  }
  .layout-option.selected .mockup .bullet,
  .layout-option.selected .mockup .title {
    fill: var(--c-accent);
  }
  .layout-option.selected .mockup .tile {
    fill: color-mix(in srgb, var(--c-accent) 70%, transparent);
  }
</style>
