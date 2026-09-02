<!-- web/src/lib/components/ui/Button.svelte -->
<script lang="ts">
  type Intent = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    intent?: Intent;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    intent = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    onclick,
    children
  }: Props = $props();
</script>

<button
  {type}
  class="btn intent-{intent} size-{size}"
  class:full-width={fullWidth}
  class:loading
  disabled={disabled || loading}
  {onclick}
>
  {#if children}{@render children()}{/if}
</button>

<style lang="scss">
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    border: 1px solid transparent;
    border-radius: var(--rd-md);
    font-family: var(--ft-sans);
    font-weight: var(--fw-medium);
    line-height: 1;
    cursor: pointer;
    transition:
      background var(--tr-fast),
      border-color var(--tr-fast),
      color var(--tr-fast),
      box-shadow var(--tr-fast);
    user-select: none;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    &.full-width {
      width: 100%;
    }

    &.loading {
      cursor: progress;
    }
  }

  .size-sm {
    height: 28px;
    font-size: var(--fs-sm);
    padding: 0 var(--sp-3);
  }

  .size-md {
    height: 36px;
    font-size: var(--fs-md);
  }

  .size-lg {
    height: 44px;
    font-size: var(--fs-md);
    padding: 0 var(--sp-5);
  }

  .intent-primary {
    background: var(--c-accent);
    color: white;

    &:hover:not(:disabled) {
      background: var(--c-accent-hover);
    }
  }

  .intent-secondary {
    background: var(--c-surface);
    color: var(--c-text);
    border-color: var(--c-border);

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-ghost {
    background: transparent;
    color: var(--c-text);

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-danger {
    background: var(--c-danger);
    color: white;

    &:hover:not(:disabled) {
      filter: brightness(1.05);
    }
  }
</style>
