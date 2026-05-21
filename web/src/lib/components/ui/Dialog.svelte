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
    background: rgba(20, 16, 28, 0.35);
    backdrop-filter: blur(8px) saturate(120%);
    -webkit-backdrop-filter: blur(8px) saturate(120%);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
  }

  /* Frosted glass dialog — matches header / search / menu aesthetic so
   * modals don't slap a hard white card onto the gradient. */
  .dialog {
    background: rgba(255, 255, 255, 0.86);
    color: var(--c-text);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 18px;
    box-shadow:
      0 24px 60px rgba(35, 25, 60, 0.28),
      0 4px 12px rgba(35, 25, 60, 0.12);
    backdrop-filter: blur(20px) saturate(150%);
    -webkit-backdrop-filter: blur(20px) saturate(150%);
    width: 100%;
    max-height: calc(100vh - var(--sp-8));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  :global([data-theme='dark']) .dialog {
    background: rgba(20, 16, 28, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.6),
      0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .width-sm {
    max-width: 380px;
  }
  .width-md {
    max-width: 520px;
  }
  .width-lg {
    max-width: 720px;
  }

  .header {
    padding: var(--sp-5) var(--sp-5) var(--sp-3);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  :global([data-theme='dark']) .header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
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
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    background: rgba(255, 255, 255, 0.4);
  }
  :global([data-theme='dark']) .footer {
    border-top-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
  }

  /* Give ghost buttons (typically the Cancel) a visible border + soft fill so
   * they don't disappear into the footer's glass background. Scoped to the
   * dialog footer so other usages of ghost buttons stay flat. */
  .footer :global(.btn.intent-ghost) {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.14);

    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.08);
    }
  }
  :global([data-theme='dark']) .footer :global(.btn.intent-ghost) {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.18);

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }
  }
</style>
