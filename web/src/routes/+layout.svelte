<script lang="ts">
  import { page } from '$app/stores';
  import Header from '$lib/components/Header/index.svelte';
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
{/if}

<ToastViewport />

<style lang="scss">
  main {
    flex: 1;
    width: 100%;
    max-width: 1024px;
    margin: 0 auto;
    /* Top-aligned: cards flow from the top-left, left-to-right, top-to-bottom.
     * padding-top is the gap below the header. With the footer removed
     * we can shrink padding-bottom; the home pager owns its own bottom
     * spacing via PageDots, and admin pages render their own chrome. */
    padding: 100px var(--sp-4) var(--sp-3);
    box-sizing: border-box;
    /* IMPORTANT: do NOT clip overflow-x here. The home page's canvas
     * escapes this 1024px column via a 100vw fullbleed (negative
     * margins). If we clip on <main>, the second page of the pager
     * gets cut at the column edge during the page-turn animation —
     * the user sees the slide vanish at the red boundary instead of
     * smoothly entering from the right. We clip on the page-level
     * scroll root (:global(body)) below, which sits outside the
     * fullbleed math and only suppresses the page's own horizontal
     * scrollbar without truncating descendants. */
  }
  /* Stop a stray horizontal scrollbar caused by 100vw fullbleed
   * children on browsers that count the vertical scrollbar inside the
   * viewport width. Belongs on <body>, not on <main> — see note above. */
  :global(body) {
    overflow-x: hidden;
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
