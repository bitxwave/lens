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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    width: 120px;
    height: 120px;
    background: rgba(255, 255, 255, 0.35);
    border: 2px dashed rgba(255, 255, 255, 0.7);
    border-radius: 22px;
    color: rgba(0, 0, 0, 0.5);
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition:
      border-color var(--tr-fast),
      color var(--tr-fast),
      background var(--tr-fast);
    &:hover {
      border-color: #fff;
      color: rgba(0, 0, 0, 0.85);
      background: rgba(255, 255, 255, 0.55);
    }
  }
  :global([data-theme='dark']) .aff {
    background: rgba(20, 16, 28, 0.4);
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.65);

    &:hover {
      border-color: rgba(255, 255, 255, 0.55);
      color: #fff;
      background: rgba(20, 16, 28, 0.6);
    }
  }
  .plus {
    font-size: 32px;
    font-weight: 300;
    line-height: 1;
  }
  .lbl {
    font-size: var(--fs-xs);
  }
</style>
