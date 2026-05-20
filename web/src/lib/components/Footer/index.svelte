<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { localeStore } from '$lib/i18n/store';

  const meta = $derived($navDataStore.bundle?.meta);
  // Hide ICP / police filings when locale is non-Chinese — they're a PRC legal artifact.
  const showFilings = $derived($localeStore === 'zh');
</script>

<footer class="footer">
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
</footer>

<style lang="scss">
  .footer {
    display: flex;
    justify-content: center;
    padding: var(--sp-5) var(--sp-4);
    margin-top: var(--sp-8);
    border-top: 1px solid var(--c-border);
    color: var(--c-text-3);
    font-size: var(--fs-xs);
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
      color: var(--c-text-2);
    }
  }
</style>
