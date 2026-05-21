<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { t } from '$lib/i18n/store';
</script>

<div class="edit-toggle" class:active={$editModeStore}>
  <IconButton
    label={$editModeStore ? $t('header.editMode.exit') : $t('header.editMode.enter')}
    onclick={editModeStore.toggle}
  >
    {#if $editModeStore}
      <!-- Check / done icon when in edit mode (click to exit) -->
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    {:else}
      <!-- Pencil icon when not in edit mode (click to enter) -->
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    {/if}
  </IconButton>
</div>

<style lang="scss">
  /* When in edit mode, give the icon button an "active" amber pill so the
   * user clearly sees the editing state without needing the text label. */
  .edit-toggle.active :global(.icon-btn) {
    background: rgba(245, 166, 35, 0.85);
    color: #fff;

    &:hover {
      background: #f5a623;
      color: #fff;
    }
  }
</style>
