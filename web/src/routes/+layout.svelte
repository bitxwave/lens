<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import '$lib/design/theme'; // Initializes data-theme on <html>
  import '../app.scss';

  let { children } = $props();
</script>

<Header />

<main>
  {@render children()}
</main>

<Footer />

<style lang="scss">
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    padding-left: 48px;
    padding-right: 48px;
  }
  @media only screen and (max-width: 500px) {
    main {
      padding-left: 30px;
      padding-right: 30px;
    }
  }
</style>
