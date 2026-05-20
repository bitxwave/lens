<!-- web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
  import { dismiss, type ToastIntent } from './toast';

  interface Props {
    id: number;
    intent: ToastIntent;
    message: string;
  }

  let { id, intent, message }: Props = $props();
</script>

<div class="toast intent-{intent}" role="status">
  <span class="msg">{message}</span>
  <button class="x" aria-label="Close" onclick={() => dismiss(id)}>×</button>
</div>

<style lang="scss">
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    box-shadow: var(--sh-md);
    min-width: 280px;
    max-width: 420px;
  }

  .intent-success {
    border-left: 3px solid var(--c-success);
  }
  .intent-info {
    border-left: 3px solid var(--c-accent);
  }
  .intent-warn {
    border-left: 3px solid var(--c-warn);
  }
  .intent-error {
    border-left: 3px solid var(--c-danger);
  }

  .msg {
    flex: 1;
    font-size: var(--fs-sm);
    line-height: var(--lh-base);
  }

  .x {
    width: 24px;
    height: 24px;
    border: 0;
    background: transparent;
    color: var(--c-text-3);
    font-size: var(--fs-lg);
    line-height: 1;
    cursor: pointer;
    border-radius: var(--rd-sm);

    &:hover {
      background: var(--c-surface-2);
      color: var(--c-text);
    }
  }
</style>
