<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { createTag, patchTag, deleteTag } from '$lib/api/admin';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';
  import type { Tag } from '$lib/types/nav';

  const tags = $derived($navDataStore.bundle?.tags ?? []);
  const itemCountByTag = $derived.by(() => {
    const map = new Map<string, number>();
    for (const it of $navDataStore.bundle?.items ?? []) {
      for (const slug of it.tagSlugs) {
        map.set(slug, (map.get(slug) ?? 0) + 1);
      }
    }
    return map;
  });

  let editingId = $state<number | null>(null);
  let editSlug = $state('');
  let editName = $state('');

  let creating = $state(false);
  let newSlug = $state('');
  let newName = $state('');
  let busy = $state(false);

  function startEdit(t: Tag) {
    editingId = t.id;
    editSlug = t.slug;
    editName = t.name;
  }
  function cancelEdit() {
    editingId = null;
  }
  async function saveEdit() {
    if (editingId == null || busy) return;
    busy = true;
    try {
      await patchTag(editingId, { slug: editSlug.trim(), name: editName.trim() });
      await navDataStore.refetch();
      editingId = null;
      toast.success($t('common.save') + ' ✓');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      busy = false;
    }
  }

  async function remove(tag: Tag) {
    if (busy) return;
    const count = itemCountByTag.get(tag.slug) ?? 0;
    const msg =
      count > 0
        ? `Tag "${tag.name}" is used by ${count} item(s). Delete it (links will be removed)?`
        : `Delete tag "${tag.name}"?`;
    if (!confirm(msg)) return;
    busy = true;
    try {
      await deleteTag(tag.id);
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
    newSlug = '';
    newName = '';
  }
  function cancelCreate() {
    creating = false;
  }
  async function commitCreate() {
    if (busy) return;
    if (!newSlug.trim() || !newName.trim()) {
      toast.error('Both slug and name are required');
      return;
    }
    busy = true;
    try {
      await createTag({ slug: newSlug.trim(), name: newName.trim() });
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
    <h3>Tags <small>({tags.length})</small></h3>
    {#if !creating}
      <Button intent="primary" size="sm" onclick={startCreate}>＋ New tag</Button>
    {/if}
  </header>
  <p class="hint">
    Tags are free-form labels you can attach to items via the comma-separated input on the item
    editor. New slugs typed there are auto-created with their name set to the slug — you can
    rename them here later.
  </p>

  {#if creating}
    <div class="row create-row">
      <Input label="Slug" bind:value={newSlug} placeholder="fav" />
      <Input label="Name" bind:value={newName} placeholder="Favorite" />
      <div class="row-actions">
        <Button intent="primary" size="sm" onclick={commitCreate} loading={busy}>Create</Button>
        <Button intent="ghost" size="sm" onclick={cancelCreate}>Cancel</Button>
      </div>
    </div>
  {/if}

  <ul class="list">
    {#each tags as tag (tag.id)}
      <li class="row">
        {#if editingId === tag.id}
          <Input label="Slug" bind:value={editSlug} />
          <Input label="Name" bind:value={editName} />
          <div class="row-actions">
            <Button intent="primary" size="sm" onclick={saveEdit} loading={busy}>Save</Button>
            <Button intent="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
          </div>
        {:else}
          <div class="info">
            <strong>{tag.name}</strong>
            <span class="slug">{tag.slug}</span>
            <span class="count">{itemCountByTag.get(tag.slug) ?? 0} item(s)</span>
          </div>
          <div class="row-actions">
            <Button intent="ghost" size="sm" onclick={() => startEdit(tag)}>Edit</Button>
            <Button intent="ghost" size="sm" onclick={() => remove(tag)}>Delete</Button>
          </div>
        {/if}
      </li>
    {/each}
    {#if tags.length === 0}
      <li class="empty">No tags yet.</li>
    {/if}
  </ul>
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
    grid-template-columns: 1fr auto;
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
  .create-row {
    grid-template-columns: 1fr 1fr auto;
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
