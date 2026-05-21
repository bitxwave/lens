<script lang="ts">
  interface Props {
    title: string;
    hint?: string;
  }
  let { title, hint }: Props = $props();
</script>

<div class="empty">
  <p class="title">{title}</p>
  {#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style lang="scss">
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-7) 0;
    color: var(--c-section-heading);
    text-align: center;
  }
  .title {
    margin: 0;
    font-size: var(--fs-lg);
    color: var(--c-card-label);
  }
  .hint {
    margin: 0;
    font-size: var(--fs-sm);
    opacity: 0.85;
  }
</style>
