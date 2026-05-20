<script lang="ts">
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();
</script>

<svelte:body class:edit-mode={$editModeStore} />

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
    margin: var(--sp-6) auto 0;
    padding: 0 var(--sp-4);
    box-sizing: border-box;
  }

  :global(body.edit-mode main) {
    outline: 2px dashed var(--c-accent);
    outline-offset: var(--sp-2);
    border-radius: var(--rd-md);
  }

  :global(body.edit-mode)::before {
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
