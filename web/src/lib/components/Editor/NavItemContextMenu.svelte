<!-- web/src/lib/components/Editor/NavItemContextMenu.svelte -->
<script lang="ts">
  import Menu from '$lib/components/ui/Menu.svelte';
  import { t } from '$lib/i18n/store';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    onEdit: () => void;
    onDelete: () => void;
  }
  let { open = $bindable(false), x, y, onEdit, onDelete }: Props = $props();

  const items = $derived([
    { label: $t('common.edit'), onSelect: onEdit },
    { label: $t('common.delete'), onSelect: onDelete, intent: 'danger' as const }
  ]);
</script>

<Menu bind:open {x} {y} {items} />
