<script lang="ts">
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { jiggleMode } from '$lib/stores/jiggle';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();
</script>

<svelte:body class:jiggle-mode={$jiggleMode} />

<Header />

<main>
  {@render children()}
</main>

<Footer />

<ToastViewport />

<style lang="scss">
  main {
    flex: 1;
    width: 100%;
    max-width: 1024px;
    margin: 0 auto;
    /* Top-aligned: cards flow from the top-left, left-to-right, top-to-bottom.
     * padding-top is the gap below the header (intentionally generous so the
     * grid breathes). padding-bottom is the min gap above footer. */
    padding: 100px var(--sp-4) var(--sp-7);
    box-sizing: border-box;
  }

  :global(body.jiggle-mode main) {
    outline: 2px dashed var(--c-accent);
    outline-offset: var(--sp-2);
    border-radius: var(--rd-md);
  }

  :global(body.jiggle-mode)::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--c-accent);
    z-index: 200;
  }
</style>
