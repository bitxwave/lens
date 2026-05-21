<script lang="ts">
  import type { Group } from '$lib/types/nav';
  import { localeStore } from '$lib/i18n/store';
  import { uiPrefs } from '$lib/stores/uiPrefs';

  interface Props {
    group: Group;
  }
  let { group }: Props = $props();

  const isOpen = $derived($uiPrefs.groupOpen[group.slug] !== false);
  const name = $derived(group.nameI18n?.[$localeStore] ?? group.name);

  function toggle() {
    uiPrefs.setGroupOpen(group.slug, !isOpen);
  }
</script>

<button type="button" class="header" aria-expanded={isOpen} onclick={toggle}>
  <span class="chev" class:open={isOpen} aria-hidden="true">▸</span>
  <span class="name">{name}</span>
</button>

<style lang="scss">
  .header {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    margin-left: calc(-1 * var(--sp-3));
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--c-section-heading);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    border-radius: var(--rd-md);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
  .chev {
    display: inline-block;
    transition: transform var(--tr-fast);
    color: var(--c-section-heading);

    &.open {
      transform: rotate(90deg);
    }
  }
</style>
