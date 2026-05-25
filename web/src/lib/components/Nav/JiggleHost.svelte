<script lang="ts">
  import { jiggleMode } from '$lib/stores/jiggle';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }
  let { children }: Props = $props();

  function onBackgroundClick(e: MouseEvent) {
    if (!$jiggleMode) return;
    // Only exit on click that is on the host itself, not a card.
    if (e.target === e.currentTarget) {
      jiggleMode.exit();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="host" onclick={onBackgroundClick}>
  {@render children()}
</div>

<style lang="scss">
  .host {
    width: 100%;
    min-height: 60vh;
  }
</style>
