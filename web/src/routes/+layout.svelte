<script lang="ts">
  import { page } from '$app/stores';
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { jiggleMode } from '$lib/stores/jiggle';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();

  /** Admin pages opt out of the public-facing chrome (Launchpad header,
   *  copyright footer, gradient backdrop). They render their own
   *  dashboard layout inside +page.svelte. The body class also flips
   *  the global gradient over to a neutral surface — see app.scss. */
  const isAdmin = $derived($page.url.pathname.startsWith('/admin'));
</script>

<svelte:body class:jiggle-mode={$jiggleMode} class:admin-route={isAdmin} />

{#if isAdmin}
  {@render children()}
{:else}
  <Header />
  <main>
    {@render children()}
  </main>
  <Footer />
{/if}

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
