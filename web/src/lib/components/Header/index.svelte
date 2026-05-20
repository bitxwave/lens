<script lang="ts">
  import Brand from './Brand.svelte';
  import SearchBar from './SearchBar.svelte';
  import TagFilterChips from './TagFilterChips.svelte';
  import SiteSelect from './SiteSelect.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import LocaleToggle from './LocaleToggle.svelte';
  import AuthControls from './AuthControls.svelte';
</script>

<header class="header">
  <div class="left">
    <Brand />
  </div>
  <div class="center">
    <SearchBar />
    <TagFilterChips />
  </div>
  <div class="right">
    <SiteSelect />
    <ThemeToggle />
    <LocaleToggle />
    <AuthControls />
  </div>
</header>

<style lang="scss">
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: var(--c-bg);
    border-bottom: 1px solid var(--c-border);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .center {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  @media (max-width: 720px) {
    .header {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
    }
    .center {
      grid-column: 1 / -1;
    }
    .right {
      flex-wrap: wrap;
    }
  }
</style>
