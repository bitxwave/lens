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
  let editName = $state('');
  let editDefault = $state(false);

  let creating = $state(false);
  let newName = $state('');
  let newDefault = $state(false);
  let busy = $state(false);

  const dragDisabled = $derived(editingId !== null || creating || busy);

  /** Sites carry a stable string `value` used as the per-card link key
   *  (e.g. card.links['s_a3f9k2'] = 'https://…'). The user picks sites
   *  by display name, so the value is purely an internal identifier;
   *  exposing it as an input lets users break referential integrity by
   *  editing a value that's already referenced. We generate it on
   *  create and never expose it again. base36 of (Date.now + Math.random)
   *  collides only under simultaneous-millisecond + same-random submits,
   *  which the API's UNIQUE constraint would catch anyway. */
  function generateSiteValue(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `s_${ts}${rand}`;
  }

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
      toast.error(err instanceof ApiError ? err.message : $t('admin.sites.toast.reorderFailed'));
    }
  }

  function startEdit(s: Site) {
    editingId = s.id;
    editName = s.name;
    editDefault = s.isDefault;
  }
  function cancelEdit() {
    editingId = null;
  }
  async function saveEdit() {
    if (editingId == null || busy) return;
    if (!editName.trim()) {
      toast.error($t('admin.sites.toast.requireName'));
      return;
    }
    busy = true;
    try {
      // value is intentionally omitted — it's an immutable identifier;
      // editing it would break card.links references that point at the
      // existing value. Only name + isDefault are user-mutable.
      await patchSite(editingId, {
        name: editName.trim(),
        isDefault: editDefault
      });
      await navDataStore.refetch();
      editingId = null;
      toast.success($t('common.save') + ' ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : $t('admin.sites.toast.saveFailed'));
    } finally {
      busy = false;
    }
  }

  async function remove(s: Site) {
    if (busy) return;
    const count = linkCountBySite.get(s.value) ?? 0;
    if (count > 0) {
      toast.error(
        $t('admin.sites.toast.referencedBy', { name: s.name, count })
      );
      return;
    }
    if (!confirm($t('admin.sites.confirmDelete', { name: s.name }))) return;
    busy = true;
    try {
      await deleteSite(s.id);
      await navDataStore.refetch();
      toast.success($t('admin.sites.toast.deleted'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : $t('admin.sites.toast.deleteFailed'));
    } finally {
      busy = false;
    }
  }

  function startCreate() {
    creating = true;
    newName = '';
    newDefault = false;
  }
  function cancelCreate() {
    creating = false;
  }
  async function commitCreate() {
    if (busy) return;
    if (!newName.trim()) {
      toast.error($t('admin.sites.toast.requireName'));
      return;
    }
    busy = true;
    try {
      await createSite({
        value: generateSiteValue(),
        name: newName.trim(),
        isDefault: newDefault
      });
      await navDataStore.refetch();
      creating = false;
      toast.success($t('admin.sites.toast.created'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : $t('admin.sites.toast.createFailed'));
    } finally {
      busy = false;
    }
  }
</script>

<div class="tab">
  <header class="head">
    <h3>{$t('admin.sites.head.title')} <small>({sites.length})</small></h3>
    {#if !creating}
      <Button intent="primary" size="sm" onclick={startCreate}
        >{$t('admin.sites.action.new')}</Button
      >
    {/if}
  </header>
  <p class="hint">{$t('admin.sites.hint')}</p>

  {#if creating}
    <div class="row create-row">
      <Input
        label={$t('admin.sites.field.name')}
        bind:value={newName}
        placeholder={$t('admin.sites.field.name.placeholder')}
      />
      <label class="def">
        <input type="checkbox" bind:checked={newDefault} />
        {$t('admin.sites.field.default')}
      </label>
      <div class="row-actions">
        <Button intent="primary" size="sm" onclick={commitCreate} loading={busy}
          >{$t('admin.sites.action.create')}</Button
        >
        <Button intent="ghost" size="sm" onclick={cancelCreate}
          >{$t('admin.sites.action.cancel')}</Button
        >
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
          <Input label={$t('admin.sites.field.name')} bind:value={editName} />
          <label class="def">
            <input type="checkbox" bind:checked={editDefault} />
            {$t('admin.sites.field.default')}
          </label>
          <div class="row-actions">
            <Button intent="primary" size="sm" onclick={saveEdit} loading={busy}
              >{$t('admin.sites.action.save')}</Button
            >
            <Button intent="ghost" size="sm" onclick={cancelEdit}
              >{$t('admin.sites.action.cancel')}</Button
            >
          </div>
        {:else}
          <span class="handle" class:disabled={dragDisabled} aria-hidden="true">⋮⋮</span>
          <div class="info">
            <strong>{s.name}</strong>
            {#if s.isDefault}<span class="badge">{$t('admin.sites.badge.default')}</span>{/if}
            <span class="count"
              >{$t('admin.sites.linkCount', { count: linkCountBySite.get(s.value) ?? 0 })}</span
            >
          </div>
          <div class="row-actions">
            <Button intent="ghost" size="sm" onclick={() => startEdit(s)}
              >{$t('admin.sites.action.edit')}</Button
            >
            <Button intent="ghost" size="sm" onclick={() => remove(s)}
              >{$t('admin.sites.action.delete')}</Button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if sites.length === 0}
    <p class="empty">{$t('admin.sites.empty')}</p>
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
    grid-template-columns: 1fr auto auto;
    /* Bottom-align so action buttons sit flush with the input box's
     * baseline. Without this the buttons hover at the top of the row
     * (because grid items default to `stretch` and an Input cell is
     * taller than a Button cell — the label adds vertical space above
     * the actual input control). */
    align-items: end;
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
  }
  /* Match input control's vertical position: the Input has a label
   * above it, so its actual control box sits ~20px below the cell's
   * top edge. With grid `align-items: end` on the parent, this cell
   * is positioned at the row bottom, so the row of buttons lands at
   * the same baseline as the input boxes themselves. */
  .row.editing .row-actions,
  .create-row .row-actions {
    padding-bottom: 0;
  }
  .def {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--c-text-2);
    /* Sit at the input's baseline (control bottom) by reserving the
     * same control height the Input uses. The .control inside Input
     * is 36px tall; matching that here keeps the checkbox vertically
     * centred against the input box rather than floating above it. */
    height: 36px;
  }
  .empty {
    padding: var(--sp-4);
    text-align: center;
    color: var(--c-text-3);
    font-size: var(--fs-sm);
  }
</style>
