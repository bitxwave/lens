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
  <div class="inner">
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
  </div>
</header>

<style lang="scss">
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    /* Fully transparent. We deliberately do NOT use backdrop-filter here —
     * besides looking cleaner, backdrop-filter on this element would make it
     * a stacking context, which contains the children's `position: fixed`
     * (LoginDialog / SettingsDialog / etc.) and makes them clip to the
     * header's box instead of the viewport. */
  }
  .inner {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-5);
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

  /* Header-scoped overrides — make all inner controls "glass over gradient":
   * white text with shadow, translucent surfaces, subtle borders. We deliberately
   * do NOT touch the global Input/Button/IconButton primitives so Dialogs (Login,
   * Editor, Settings) keep their solid surface look.
   */
  .header :global(.brand),
  .header :global(.brand:hover) {
    color: var(--c-card-label);
  }

  /* Search: a clear glass pill that reads on the gradient on its own.
   * Higher contrast than the brand/controls because users need to see
   * the focus target. Pill (rounded) form, soft drop shadow, white text.
   */
  .header :global(.search .control) {
    background: rgba(255, 255, 255, 0.32);
    border-color: rgba(255, 255, 255, 0.5);
    border-radius: var(--rd-pill);
    box-shadow: 0 4px 14px rgba(35, 25, 60, 0.18);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);

    &:focus-within {
      background: rgba(255, 255, 255, 0.5);
      border-color: rgba(255, 255, 255, 0.85);
      box-shadow:
        0 4px 14px rgba(35, 25, 60, 0.22),
        0 0 0 4px rgba(255, 255, 255, 0.18);
    }
  }
  .header :global(.search .control input) {
    color: #1a1a18;
    padding: 0 var(--sp-4);
    height: 38px;
    font-weight: var(--fw-medium);

    &::placeholder {
      color: rgba(26, 26, 24, 0.55);
      font-weight: var(--fw-regular);
    }
  }
  :global([data-theme='dark']) .header :global(.search .control) {
    background: rgba(20, 16, 28, 0.55);
    border-color: rgba(255, 255, 255, 0.22);
  }
  :global([data-theme='dark']) .header :global(.search .control input) {
    color: var(--c-text);

    &::placeholder {
      color: rgba(245, 245, 243, 0.55);
    }
  }
  .header :global(.search .control .leading) {
    color: rgba(26, 26, 24, 0.6);
  }

  /* SiteSelect trigger pill */
  .header :global(.trigger) {
    background: rgba(255, 255, 255, 0.2);
    color: var(--c-card-label);
    backdrop-filter: blur(6px);

    &:hover {
      background: rgba(255, 255, 255, 0.3);
      filter: none;
    }
  }

  /* IconButton + ghost Button — theme/locale/auth controls */
  .header :global(.icon-btn) {
    color: var(--c-card-label);

    &:hover:not(:disabled) {
      color: var(--c-card-label);
      background: rgba(255, 255, 255, 0.18);
    }
  }
  .header :global(.btn.intent-ghost) {
    color: var(--c-card-label);

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.18);
    }
  }

  @media (max-width: 720px) {
    .inner {
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
