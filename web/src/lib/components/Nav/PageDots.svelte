<script lang="ts">
  import { t } from '$lib/i18n/store';

  interface Props {
    pageCount: number;
    currentPage: number;
    onSelect: (index: number) => void;
  }
  let { pageCount, currentPage, onSelect }: Props = $props();
</script>

{#if pageCount > 1}
  <nav class="dots" aria-label={$t('home.pager.aria')}>
    {#each [...Array(pageCount).keys()] as i (i)}
      <button
        type="button"
        class="dot"
        class:active={i === currentPage}
        aria-label={`${i + 1} / ${pageCount}`}
        aria-current={i === currentPage ? 'page' : undefined}
        onclick={() => onSelect(i)}
      ></button>
    {/each}
  </nav>
{/if}

<style lang="scss">
  .dots {
    display: flex;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-3) 0 var(--sp-4);
  }
  .dot {
    width: 8px;
    height: 8px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.25);
    cursor: pointer;
    padding: 0;
    transition:
      background var(--tr-fast),
      transform var(--tr-fast);
  }
  .dot:hover {
    background: rgba(0, 0, 0, 0.45);
  }
  .dot.active {
    background: rgba(0, 0, 0, 0.7);
    transform: scale(1.25);
  }
  :global([data-theme='dark']) .dot {
    background: rgba(255, 255, 255, 0.3);
  }
  :global([data-theme='dark']) .dot:hover {
    background: rgba(255, 255, 255, 0.55);
  }
  :global([data-theme='dark']) .dot.active {
    background: rgba(255, 255, 255, 0.85);
  }
</style>
