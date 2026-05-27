<script lang="ts">
  import { jiggleMode } from '$lib/stores/jiggle';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }
  let { children }: Props = $props();

  /** Whether the most recent mousedown landed directly on .host (not on
   *  a child card). Browsers synthesise a `click` event on the *common
   *  ancestor* of mousedown- and mouseup-targets, so a drag-select that
   *  starts on a card label and releases between cards would fire click
   *  on .host with `e.target === e.currentTarget`, exiting jiggle mode
   *  unintentionally. Requiring the press to also be on .host suppresses
   *  that false dismissal while keeping the intentional "click empty
   *  space to exit" gesture. */
  let pressOrigin: EventTarget | null = null;

  function onBackgroundPointerDown(e: PointerEvent) {
    pressOrigin = e.target;
  }

  function onBackgroundClick(e: MouseEvent) {
    const pressedOnHost = pressOrigin === e.currentTarget;
    pressOrigin = null;
    if (!$jiggleMode) return;
    // Only exit on click that is on the host itself, not a card, AND
    // the press also originated on the host (drag-select-out guard).
    if (e.target === e.currentTarget && pressedOnHost) {
      jiggleMode.exit();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="host" onpointerdown={onBackgroundPointerDown} onclick={onBackgroundClick}>
  {@render children()}
</div>

<style lang="scss">
  .host {
    width: 100%;
    min-height: 60vh;
  }
</style>
