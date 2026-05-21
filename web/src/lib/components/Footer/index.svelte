<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { localeStore } from '$lib/i18n/store';

  const meta = $derived($navDataStore.bundle?.meta);
  // Hide ICP / police filings when locale is non-Chinese — they're a PRC legal artifact.
  const showFilings = $derived($localeStore === 'zh');
</script>

<footer class="footer">
  <div class="inner">
    <div class="row">
      <span class="copyright">{meta?.siteCopyright ?? ''}</span>
      {#if showFilings && meta?.siteIcp}
        <span class="sep">·</span>
        <a href={meta.siteIcp.url} target="_blank" rel="noopener">{meta.siteIcp.text}</a>
      {/if}
      {#if showFilings && meta?.sitePolice}
        <span class="sep">·</span>
        <a href={meta.sitePolice.url} target="_blank" rel="noopener">{meta.sitePolice.text}</a>
      {/if}
    </div>
  </div>
</footer>

<style lang="scss">
  .footer {
    /* Transparent — footer copy floats over the page gradient with no
     * separator bar, so the gradient feels continuous from top to bottom.
     * No margin-top: main owns the surrounding padding via its own padding-block.
     */
    color: rgba(255, 255, 255, 0.88);
    font-size: var(--fs-xs);
  }
  .inner {
    width: 100%;
    padding: var(--sp-5) var(--sp-4);
    display: flex;
    justify-content: center;
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex-wrap: wrap;
    justify-content: center;
  }
  .sep {
    opacity: 0.5;
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
      color: #fff;
    }
  }
</style>
