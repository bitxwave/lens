<!-- web/src/lib/components/ui/IconButton.svelte -->
<script lang="ts">
  interface Props {
    label: string; // aria-label, required (icon-only button)
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    intent?: 'ghost' | 'subtle';
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    label,
    type = 'button',
    disabled = false,
    size = 'md',
    intent = 'ghost',
    onclick,
    children
  }: Props = $props();
</script>

<button
  {type}
  aria-label={label}
  title={label}
  class="icon-btn size-{size} intent-{intent}"
  {disabled}
  {onclick}
>
  {#if children}{@render children()}{/if}
</button>

<style lang="scss">
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--rd-md);
    cursor: pointer;
    color: var(--c-text-2);
    transition:
      background var(--tr-fast),
      color var(--tr-fast);

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      color: var(--c-text);
    }
  }

  .size-sm {
    width: 28px;
    height: 28px;
  }

  .size-md {
    width: 36px;
    height: 36px;
  }

  .size-lg {
    width: 44px;
    height: 44px;
  }

  .intent-ghost {
    background: transparent;

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-subtle {
    background: var(--c-surface-2);

    &:hover:not(:disabled) {
      background: var(--c-border);
    }
  }
</style>
