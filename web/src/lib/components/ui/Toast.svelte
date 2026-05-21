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
  /* Frosted glass toast — same family as Header / Menu / Dialog so it doesn't
   * slap a flat white card on top of the gradient. */
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    background: rgba(255, 255, 255, 0.78);
    color: var(--c-text);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: var(--rd-lg);
    box-shadow:
      0 10px 30px rgba(35, 25, 60, 0.2),
      0 2px 6px rgba(35, 25, 60, 0.1);
    backdrop-filter: blur(14px) saturate(150%);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
    min-width: 280px;
    max-width: 420px;
  }
  :global([data-theme='dark']) .toast {
    background: rgba(20, 16, 28, 0.78);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.55),
      0 2px 6px rgba(0, 0, 0, 0.4);
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
      background: rgba(0, 0, 0, 0.07);
      color: var(--c-text);
    }
  }
  :global([data-theme='dark']) .x:hover {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
