<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import '../app.scss';
</script>

<Header />

<main>
  <slot />
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
