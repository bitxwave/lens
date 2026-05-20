<script lang="ts">
  import { siteName } from '$lib/constants/siteInfo';
  // import Avatar from '$lib/components/Avatar.svelte';
  import Nav from '$lib/components/Nav.svelte';
</script>

<svelte:head>
  <title>{siteName}</title>
</svelte:head>

<!-- <Avatar /> -->
<Nav />

<style lang="scss">
  :global(.avatar) {
    margin-top: 70px;
  }
  :global(.nav) {
    margin-top: 120px;
  }

  @media only screen and (max-width: 500px) {
    :global(#root .avatar) {
      display: none;
    }

    :global(#root .nav) {
      margin-top: 100px;
    }
  }
</style>
