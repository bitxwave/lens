<!-- web/src/routes/_demo/+page.svelte -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { toast } from '$lib/components/ui/toast';
  import Menu from '$lib/components/ui/Menu.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import { localeStore, t, toggleLocale } from '$lib/i18n/store';
  import { themeStore, cycleTheme } from '$lib/design/theme';

  let inputValue = $state('');
  let inputInvalid = $state(false);
  let switchOn = $state(false);
  let dialogOpen = $state(false);
  let menuOpen = $state(false);
  let chips = $state(['fav', 'media', 'tools']);
  let activeChip = $state('fav');
</script>

<ToastViewport />

<section class="demo">
  <header>
    <h1>UI Primitives Demo</h1>
    <div class="controls">
      <Button intent="ghost" size="sm" onclick={cycleTheme}>
        Theme: {$themeStore}
      </Button>
      <Button intent="ghost" size="sm" onclick={toggleLocale}>
        Locale: {$localeStore}
      </Button>
    </div>
  </header>

  <h2>Buttons</h2>
  <div class="row">
    <Button>Primary</Button>
    <Button intent="secondary">Secondary</Button>
    <Button intent="ghost">Ghost</Button>
    <Button intent="danger">Danger</Button>
    <Button disabled>Disabled</Button>
    <Button loading>Loading</Button>
  </div>
  <div class="row">
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>

  <h2>Icon buttons</h2>
  <div class="row">
    <IconButton label="Settings"><span aria-hidden="true">⚙</span></IconButton>
    <IconButton label="Edit" intent="subtle"><span aria-hidden="true">✎</span></IconButton>
    <IconButton label="Delete" disabled><span aria-hidden="true">🗑</span></IconButton>
  </div>

  <h2>Inputs</h2>
  <div class="col">
    <Input label="Name" placeholder="enter your name" bind:value={inputValue} />
    <Input
      label="Password"
      type="password"
      placeholder="••••••••"
      helpText="At least 8 characters"
    />
    <Input
      label="Email"
      type="email"
      invalid={inputInvalid}
      errorText="Email format invalid"
      bind:value={inputValue}
    />
    <Switch label="Toggle invalid state" bind:checked={inputInvalid} />
  </div>

  <h2>Cards</h2>
  <div class="row">
    <Card elevation="flat">flat</Card>
    <Card elevation="sm">sm shadow</Card>
    <Card elevation="md">md shadow</Card>
  </div>

  <h2>Chips</h2>
  <div class="row">
    {#each chips as slug (slug)}
      <Chip
        label={slug}
        active={activeChip === slug}
        removable
        onSelect={() => (activeChip = slug)}
        onRemove={() => (chips = chips.filter((s) => s !== slug))}
      />
    {/each}
  </div>

  <h2>Switch</h2>
  <Switch label="Enable feature X" bind:checked={switchOn} />
  <p>State: {switchOn ? 'on' : 'off'}</p>

  <h2>Dialog</h2>
  <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
  <Dialog
    bind:open={dialogOpen}
    title="Confirm action"
    description="This will permanently change the configuration."
  >
    <p>Body text. Press Esc or click outside to close.</p>
    {#snippet footer()}
      <Button intent="ghost" onclick={() => (dialogOpen = false)}>{$t('common.cancel')}</Button>
      <Button intent="primary" onclick={() => (dialogOpen = false)}>{$t('common.confirm')}</Button>
    {/snippet}
  </Dialog>

  <h2>Toasts</h2>
  <div class="row">
    <Button onclick={() => toast.info('Info toast')}>info</Button>
    <Button intent="secondary" onclick={() => toast.success('Saved!')}>success</Button>
    <Button intent="ghost" onclick={() => toast.warn('Be careful')}>warn</Button>
    <Button intent="danger" onclick={() => toast.error('Something broke')}>error</Button>
  </div>

  <h2>Menu</h2>
  <Button onclick={() => (menuOpen = true)}>Open context menu</Button>
  <Menu
    bind:open={menuOpen}
    x={120}
    y={120}
    items={[
      { label: 'Edit', onSelect: () => toast.info('Edit') },
      { label: 'Duplicate', onSelect: () => toast.info('Duplicated') },
      { label: 'Delete', intent: 'danger', onSelect: () => toast.error('Deleted') }
    ]}
  />

  <h2>Skeleton</h2>
  <div class="col">
    <Skeleton height="20px" width="240px" />
    <Skeleton height="14px" width="180px" />
    <Skeleton height="14px" width="220px" />
  </div>

  <h2>i18n</h2>
  <p>{$t('common.save')} / {$t('header.search.placeholder')}</p>
</section>

<style lang="scss">
  .demo {
    max-width: 720px;
    margin: var(--sp-6) auto;
    padding: 0 var(--sp-4);
    color: var(--c-text);
    font-family: var(--ft-sans);

    h1 {
      font-size: var(--fs-xl);
      font-weight: var(--fw-semibold);
      margin: 0 0 var(--sp-4);
    }

    h2 {
      margin: var(--sp-6) 0 var(--sp-3);
      font-size: var(--fs-lg);
      font-weight: var(--fw-semibold);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
      flex-wrap: wrap;
    }
  }

  .row {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: var(--sp-2);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-width: 360px;
  }

  .controls {
    display: flex;
    gap: var(--sp-2);
  }
</style>
