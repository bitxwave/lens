<!-- web/src/lib/components/ui/Chip.svelte -->
<script lang="ts">
  interface Props {
    label: string;
    active?: boolean;
    removable?: boolean;
    onSelect?: () => void;
    onRemove?: () => void;
  }

  let { label, active = false, removable = false, onSelect, onRemove }: Props = $props();
</script>

<button type="button" class="chip" class:active aria-pressed={active} onclick={onSelect}>
  <span class="label">{label}</span>
  {#if removable}
    <span
      class="x"
      role="button"
      aria-label="Remove"
      tabindex="0"
      onclick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onRemove?.();
        }
      }}>×</span
    >
  {/if}
</button>

<style lang="scss">
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 26px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-pill);
    background: var(--c-surface);
    color: var(--c-text-2);
    font-size: var(--fs-xs);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background var(--tr-fast),
      color var(--tr-fast),
      border-color var(--tr-fast);

    &:hover {
      color: var(--c-text);
      border-color: var(--c-text-3);
    }

    &.active {
      background: var(--c-accent-bg);
      color: var(--c-accent);
      border-color: transparent;
    }
  }

  .x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: var(--sp-1);
    border-radius: var(--rd-pill);
    color: inherit;
    cursor: pointer;

    &:hover {
      background: rgba(0, 0, 0, 0.08);
    }
  }
</style>
