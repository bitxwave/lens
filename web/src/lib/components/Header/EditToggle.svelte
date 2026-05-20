<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { t } from '$lib/i18n/store';
</script>

<Button intent={$editModeStore ? 'primary' : 'secondary'} size="sm" onclick={editModeStore.toggle}>
  {$editModeStore ? $t('header.editMode.exit') : $t('header.editMode.enter')}
</Button>
