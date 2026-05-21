<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { navDataStore } from '$lib/stores/navData';
  import { createGroup, patchGroup, deleteGroup, reorderGroups } from '$lib/api/admin';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';
  import type { Group } from '$lib/types/nav';

  const groups = $derived($navDataStore.bundle?.groups ?? []);
  /** Local mirror so dndzone can mutate during drag. Synced from `groups`. */
  let working: Group[] = $state([]);
  $effect(() => {
    working = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  });
  const itemCountByGroup = $derived.by(() => {
    const map = new Map<number, number>();
    for (const it of $navDataStore.bundle?.items ?? []) {
      if (it.groupId == null) continue;
      map.set(it.groupId, (map.get(it.groupId) ?? 0) + 1);
    }
    return map;
  });

  let editingId = $state<number | null>(null);
  let editName = $state('');
  let editSlug = $state('');

  let creating = $state(false);
  let newName = $state('');
  let newSlug = $state('');
  let busy = $state(false);

  /** Disable dnd while inline editing or creating to avoid input/drag fights. */
  const dragDisabled = $derived(editingId !== null || creating || busy);

  function onConsider(e: CustomEvent<DndEvent<Group>>) {
    working = e.detail.items;
  }
  async function onFinalize(e: CustomEvent<DndEvent<Group>>) {
    working = e.detail.items;
    const entries = working.map((g, i) => ({ id: g.id, sortOrder: i }));
    try {
      await reorderGroups(entries);
      await navDataStore.refetch();
    } catch (err) {
      await navDataStore.refetch();
      toast.error(err instanceof ApiError ? err.message : 'Reorder failed');
    }
  }

  function startEdit(g: Group) {
    editingId = g.id;
    editName = g.name;
    editSlug = g.slug;
  }
  function cancelEdit() {
    editingId = null;
  }
  async function saveEdit() {
    if (editingId == null || busy) return;
    busy = true;
    try {
      await patchGroup(editingId, { name: editName.trim(), slug: editSlug.trim() });
      await navDataStore.refetch();
      editingId = null;
      toast.success($t('common.save') + ' ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      busy = false;
    }
  }

  async function remove(g: Group) {
    if (busy) return;
    const count = itemCountByGroup.get(g.id) ?? 0;
    const confirmMsg =
      count > 0
        ? `Group "${g.name}" still contains ${count} item(s). Delete anyway?`
        : `Delete group "${g.name}"?`;
    if (!confirm(confirmMsg)) return;
    busy = true;
    try {
      await deleteGroup(g.id);
      await navDataStore.refetch();
      toast.success('Deleted ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      busy = false;
    }
  }

  function startCreate() {
    creating = true;
    newName = '';
    newSlug = '';
  }
  function cancelCreate() {
    creating = false;
  }
  async function commitCreate() {
    if (busy) return;
    if (!newName.trim() || !newSlug.trim()) {
      toast.error('Both slug and name are required');
      return;
    }
    busy = true;
    try {
      await createGroup({
        slug: newSlug.trim(),
        name: newName.trim(),
        collapsedDefault: false
      });
      await navDataStore.refetch();
      creating = false;
      toast.success('Created ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed');
    } finally {
      busy = false;
    }
  }
</script>

<div class="tab">
  <header class="head">
    <h3>Groups <small>({groups.length})</small></h3>
    {#if !creating}
      <Button intent="primary" size="sm" onclick={startCreate}>＋ New group</Button>
    {/if}
  </header>

  {#if creating}
    <div class="row create-row">
      <Input label="Slug" bind:value={newSlug} placeholder="tools" />
      <Input label="Name" bind:value={newName} placeholder="Tools" />
      <div class="row-actions">
        <Button intent="primary" size="sm" onclick={commitCreate} loading={busy}>Create</Button>
        <Button intent="ghost" size="sm" onclick={cancelCreate}>Cancel</Button>
      </div>
    </div>
  {/if}

  <ul
    class="list"
    use:dndzone={{ items: working, dragDisabled, flipDurationMs: 180, dropTargetStyle: {} }}
    onconsider={onConsider}
    onfinalize={onFinalize}
  >
    {#each working as g (g.id)}
      <li class="row" class:editing={editingId === g.id}>
        {#if editingId === g.id}
          <Input label="Slug" bind:value={editSlug} />
          <Input label="Name" bind:value={editName} />
          <div class="row-actions">
            <Button intent="primary" size="sm" onclick={saveEdit} loading={busy}>Save</Button>
            <Button intent="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
          </div>
        {:else}
          <span class="handle" class:disabled={dragDisabled} aria-hidden="true">⋮⋮</span>
          <div class="info">
            <strong>{g.name}</strong>
            <span class="slug">{g.slug}</span>
            <span class="count">{itemCountByGroup.get(g.id) ?? 0} item(s)</span>
          </div>
          <div class="row-actions">
            <Button intent="ghost" size="sm" onclick={() => startEdit(g)}>Edit</Button>
            <Button intent="ghost" size="sm" onclick={() => remove(g)}>Delete</Button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if groups.length === 0}
    <p class="empty">No groups yet. Create one to start organising items.</p>
  {/if}
</div>

<style lang="scss">
  .tab {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    h3 {
      margin: 0;
      font-size: var(--fs-lg);
      small {
        color: var(--c-text-3);
        font-weight: var(--fw-regular);
      }
    }
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    background: rgba(255, 255, 255, 0.45);
  }
  :global([data-theme='dark']) .row {
    background: rgba(255, 255, 255, 0.04);
  }
  .row.editing,
  .create-row {
    grid-template-columns: 1fr 1fr auto;
  }
  .handle {
    color: var(--c-text-3);
    cursor: grab;
    user-select: none;
    line-height: 1;
    letter-spacing: -2px;
    padding: 0 var(--sp-1);
    &.disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }
  .row .info {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    flex-wrap: wrap;
    strong {
      font-size: var(--fs-md);
    }
    .slug {
      font-family: var(--ft-mono);
      font-size: var(--fs-sm);
      color: var(--c-text-3);
    }
    .count {
      font-size: var(--fs-xs);
      color: var(--c-text-3);
    }
  }
  .row-actions {
    display: flex;
    gap: var(--sp-2);
    align-items: end;
  }
  .empty {
    padding: var(--sp-4);
    text-align: center;
    color: var(--c-text-3);
    font-size: var(--fs-sm);
  }
</style>
