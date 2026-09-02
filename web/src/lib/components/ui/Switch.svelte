<!-- web/src/lib/components/ui/Switch.svelte -->
<script lang="ts">
  interface Props {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), label, disabled = false, onchange }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<label class="row" class:disabled>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    class="track"
    class:on={checked}
    {disabled}
    onclick={toggle}
  >
    <span class="thumb"></span>
  </button>
  {#if label}<span class="label">{label}</span>{/if}
</label>

<style lang="scss">
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
    user-select: none;

    &.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .track {
    position: relative;
    width: 36px;
    height: 20px;
    border: 0;
    border-radius: var(--rd-pill);
    background: var(--c-border);
    transition: background var(--tr-fast);
    cursor: inherit;
    padding: 0;

    &.on {
      background: var(--c-accent);
    }
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--c-surface);
    border-radius: 50%;
    box-shadow: var(--sh-sm);
    transition: transform var(--tr-fast);
  }

  .track.on .thumb {
    transform: translateX(16px);
  }

  .label {
    font-size: var(--fs-sm);
    color: var(--c-text);
  }
</style>
