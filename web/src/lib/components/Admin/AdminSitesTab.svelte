<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { navDataStore } from '$lib/stores/navData';
  import { createSite, patchSite, deleteSite, reorderSites } from '$lib/api/admin';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';
  import type { Site } from '$lib/types/nav';

  const sites = $derived($navDataStore.bundle?.sites ?? []);
  let working: Site[] = $state([]);
  $effect(() => {
    working = [...sites].sort((a, b) => a.sortOrder - b.sortOrder);
  });
  const linkCountBySite = $derived.by(() => {
    const map = new Map<string, number>();
    for (const c of $navDataStore.bundle?.cards ?? []) {
      if (c.kind !== 'item' || !c.links) continue;
      for (const k of Object.keys(c.links)) {
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  });

  let editingId = $state<number | null>(null);
  let editValue = $state('');
  let editName = $state('');
  let editDefault = $state(false);

  let creating = $state(false);
  let newValue = $state('');
  let newName = $state('');
  let newDefault = $state(false);
  let busy = $state(false);

  const dragDisabled = $derived(editingId !== null || creating || busy);

  function onConsider(e: CustomEvent<DndEvent<Site>>) {
    working = e.detail.items;
  }
  async function onFinalize(e: CustomEvent<DndEvent<Site>>) {
    working = e.detail.items;
    const entries = working.map((s, i) => ({ id: s.id, sortOrder: i }));
    try {
      await reorderSites(entries);
      await navDataStore.refetch();
    } catch (err) {
      await navDataStore.refetch();
      toast.error(err instanceof ApiError ? err.message : 'Reorder failed');
    }
  }

  function startEdit(s: Site) {
    editingId = s.id;
    editValue = s.value;
    editName = s.name;
    editDefault = s.isDefault;
  }
  function cancelEdit() {
    editingId = null;
  }
  async function saveEdit() {
    if (editingId == null || busy) return;
    busy = true;
    try {
      await patchSite(editingId, {
        value: editValue.trim(),
        name: editName.trim(),
        isDefault: editDefault
      });
      await navDataStore.refetch();
      editingId = null;
      toast.success($t('common.save') + ' ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      busy = false;
    }
  }

  async function remove(s: Site) {
    if (busy) return;
    const count = linkCountBySite.get(s.value) ?? 0;
    if (count > 0) {
      toast.error(`Site "${s.name}" is referenced by ${count} item link(s). Remove those first.`);
      return;
    }
    if (!confirm(`Delete site "${s.name}"?`)) return;
    busy = true;
    try {
      await deleteSite(s.id);
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
    newValue = '';
    newName = '';
    newDefault = false;
  }
  function cancelCreate() {
    creating = false;
  }
  async function commitCreate() {
    if (busy) return;
    if (!newValue.trim() || !newName.trim()) {
      toast.error('Both value and name are required');
      return;
    }
    busy = true;
    try {
      await createSite({
        value: newValue.trim(),
        name: newName.trim(),
        isDefault: newDefault
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
    <h3>Sites <small>({sites.length})</small></h3>
    {#if !creating}
      <Button intent="primary" size="sm" onclick={startCreate}>＋ New site</Button>
    {/if}
  </header>
  <p class="hint">
    A "site" is a per-item link target (e.g. <code>shanghai</code>, <code>beijing</code>). Each nav
    item can have one URL per site.
  </p>

  {#if creating}
    <div class="row create-row">
      <Input label="Value (key)" bind:value={newValue} placeholder="shanghai" />
      <Input label="Display name" bind:value={newName} placeholder="上海" />
      <label class="def">
        <input type="checkbox" bind:checked={newDefault} />
        Default
      </label>
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
    {#each working as s (s.id)}
      <li class="row" class:editing={editingId === s.id}>
        {#if editingId === s.id}
          <Input label="Value" bind:value={editValue} />
          <Input label="Name" bind:value={editName} />
          <label class="def">
            <input type="checkbox" bind:checked={editDefault} />
            Default
          </label>
          <div class="row-actions">
            <Button intent="primary" size="sm" onclick={saveEdit} loading={busy}>Save</Button>
            <Button intent="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
          </div>
        {:else}
          <span class="handle" class:disabled={dragDisabled} aria-hidden="true">⋮⋮</span>
          <div class="info">
            <strong>{s.name}</strong>
            <span class="slug">{s.value}</span>
            {#if s.isDefault}<span class="badge">default</span>{/if}
            <span class="count">{linkCountBySite.get(s.value) ?? 0} link(s)</span>
          </div>
          <div class="row-actions">
            <Button intent="ghost" size="sm" onclick={() => startEdit(s)}>Edit</Button>
            <Button intent="ghost" size="sm" onclick={() => remove(s)}>Delete</Button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if sites.length === 0}
    <p class="empty">No sites yet. Create one to start adding per-site links.</p>
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
  .hint {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--c-text-3);
    code {
      font-family: var(--ft-mono);
      color: var(--c-text-2);
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
    grid-template-columns: 1fr 1fr auto auto;
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
    .badge {
      font-size: var(--fs-xs);
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--c-accent-bg);
      color: var(--c-accent);
      font-weight: var(--fw-medium);
    }
  }
  .row-actions {
    display: flex;
    gap: var(--sp-2);
    align-items: end;
  }
  .def {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--c-text-2);
    align-self: end;
    padding-bottom: var(--sp-2);
  }
  .empty {
    padding: var(--sp-4);
    text-align: center;
    color: var(--c-text-3);
    font-size: var(--fs-sm);
  }
</style>
