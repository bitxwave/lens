<script lang="ts">
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();
</script>

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
</style>
