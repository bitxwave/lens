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
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: color-mix(in srgb, var(--c-surface) 75%, transparent);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    border-bottom: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
  }

  .left {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--sp-2);
  }

  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    min-width: 320px;
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
