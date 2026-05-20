<!-- web/src/lib/components/ui/ToastViewport.svelte -->
<script lang="ts">
  import { toasts } from './toast';
  import Toast from './Toast.svelte';
</script>

<aside class="viewport" aria-live="polite" aria-relevant="additions">
  {#each $toasts as t (t.id)}
    <Toast id={t.id} intent={t.intent} message={t.message} />
  {/each}
</aside>

<style lang="scss">
  .viewport {
    position: fixed;
    top: var(--sp-4);
    right: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    z-index: 1100;
    pointer-events: none;

    > :global(*) {
      pointer-events: auto;
    }
  }
</style>
