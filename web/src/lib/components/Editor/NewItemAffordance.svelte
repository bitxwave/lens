<script lang="ts">
  import { t } from '$lib/i18n/store';
  interface Props {
    onClick: () => void;
  }
  let { onClick }: Props = $props();
</script>

<button type="button" class="aff" onclick={onClick} aria-label={$t('editor.item.new')}>
  <span class="plus" aria-hidden="true">＋</span>
  <span class="lbl">{$t('editor.item.new')}</span>
</button>

<style lang="scss">
  .aff {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    width: 96px;
    min-height: 96px;
    margin: 0 auto var(--sp-7);
    background: transparent;
    border: 2px dashed var(--c-border);
    border-radius: var(--rd-lg);
    color: var(--c-text-3);
    cursor: pointer;
    transition:
      border-color var(--tr-fast),
      color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      border-color: var(--c-accent);
      color: var(--c-accent);
      background: var(--c-accent-bg);
    }
  }
  .plus {
    font-size: 28px;
    line-height: 1;
  }
  .lbl {
    font-size: var(--fs-xs);
  }
</style>
