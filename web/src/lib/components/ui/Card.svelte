<!-- web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
  interface Props {
    elevation?: 'flat' | 'sm' | 'md';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    children?: import('svelte').Snippet;
  }

  let { elevation = 'sm', padding = 'md', children }: Props = $props();
</script>

<div class="card elevation-{elevation} padding-{padding}">
  {#if children}{@render children()}{/if}
</div>

<style lang="scss">
  .card {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
  }

  .elevation-flat {
    box-shadow: none;
  }
  .elevation-sm {
    box-shadow: var(--sh-sm);
  }
  .elevation-md {
    box-shadow: var(--sh-md);
  }

  .padding-none {
    padding: 0;
  }
  .padding-sm {
    padding: var(--sp-3);
  }
  .padding-md {
    padding: var(--sp-4);
  }
  .padding-lg {
    padding: var(--sp-5);
  }
</style>
