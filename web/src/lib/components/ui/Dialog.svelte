<!-- web/src/lib/components/ui/Dialog.svelte -->
<script lang="ts">
  interface Props {
    open: boolean;
    title?: string;
    description?: string;
    width?: 'sm' | 'md' | 'lg';
    onClose?: () => void;
    children?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
  }

  let {
    open = $bindable(false),
    title,
    description,
    width = 'md',
    onClose,
    children,
    footer
  }: Props = $props();

  let dialogEl: HTMLDivElement | undefined = $state();

  function close() {
    open = false;
    onClose?.();
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  $effect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Initial focus on first focusable child
    requestAnimationFrame(() => {
      const target = dialogEl?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      target?.focus();
    });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div
    class="backdrop"
    role="presentation"
    onclick={onBackdropClick}
    onkeydown={() => {}}
    aria-hidden="false"
  >
    <div
      bind:this={dialogEl}
      class="dialog width-{width}"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-desc' : undefined}
    >
      {#if title}
        <header class="header">
          <h2 id="dialog-title" class="title">{title}</h2>
          {#if description}<p id="dialog-desc" class="desc">{description}</p>{/if}
        </header>
      {/if}
      <div class="body">
        {#if children}{@render children()}{/if}
      </div>
      {#if footer}
        <footer class="footer">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
  }

  .dialog {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
    box-shadow: var(--sh-lg);
    width: 100%;
    max-height: calc(100vh - var(--sp-8));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .width-sm {
    max-width: 360px;
  }
  .width-md {
    max-width: 520px;
  }
  .width-lg {
    max-width: 720px;
  }

  .header {
    padding: var(--sp-5) var(--sp-5) var(--sp-3);
    border-bottom: 1px solid var(--c-border);
  }

  .title {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
  }

  .desc {
    margin: var(--sp-1) 0 0;
    color: var(--c-text-2);
    font-size: var(--fs-sm);
  }

  .body {
    padding: var(--sp-5);
    overflow-y: auto;
  }

  .footer {
    padding: var(--sp-3) var(--sp-5);
    border-top: 1px solid var(--c-border);
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    background: var(--c-surface-2);
  }
</style>
