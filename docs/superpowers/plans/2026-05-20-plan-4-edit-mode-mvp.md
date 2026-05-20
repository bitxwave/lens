# Edit Mode MVP Implementation Plan (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest editor that lets the admin actually administer the site: log in, toggle edit mode, create / edit / delete nav items, change the admin password. After this plan, a single user can run `cargo run + pnpm dev`, log in, add or remove items, and have changes persist via the Plan 1 backend.

**Scope (intentionally MVP):** Login + item CRUD UI + admin-only context menu + new-item affordance + change-password dialog + 1 end-to-end smoke. **Out of scope (deferred to Plan 4b or absorbed into Plan 5):** drag-and-drop reorder, group/site/tag full management UIs, site settings dialog, icon upload UI, double-click inline rename. The data model already supports all of those (Plan 1 has the endpoints, Plan 2 has the primitives, Plan 3 has the auth wiring); they're skipped here purely to keep this plan small enough to land cleanly.

**Architecture:** Three layers added on top of Plan 3.
1. **API wrappers** under `src/lib/api/nav.ts` (typed thin functions over `apiClient` for items/auth/config).
2. **`editModeStore`** — a simple `Writable<boolean>` gated by `sessionStore.authed`. Toggled via the new `EditToggle` button in the Header (already shows after login per Plan 3's `AuthControls`).
3. **`Editor/` components** — `LoginDialog`, `ItemEditDialog`, `NavItemContextMenu`, `NewItemAffordance`, `ChangePasswordDialog`. They consume the Plan 2 primitives (Dialog/Input/Button/Menu/Toast) and call the API wrappers.

Mutations are **optimistic with rollback**: writes patch `navDataStore` immediately, then the API call confirms or rolls back via `navDataStore.refetch()` on error. Deletes use `ConfirmToast` with a 3-second undo window.

**Tech Stack (already provisioned):** Plans 1/1.5/2/3.

**Spec reference:** `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md` § 5.1 (entry/exit), § 5.2 (operation matrix — items rows + change password row only), § 5.3 (consistency / failure / offline).

**Predecessors:** Plans 1, 1.5, 2, 3 (all merged into `feat/rust-platform`).

**Successors:** Plan 5 (Docker + dump-bootstrap + Playwright e2e) absorbs the deferred polish (drag-drop, full group/site/tag UI, site settings).

---

## Conventions

- **Working directory:** every `pnpm` command runs in `web/`.
- **Sub-branch:** `plan-4/edit-mode-mvp`, branched from `feat/rust-platform`.
- **Commits:** Conventional Commits, no `Co-Authored-By` trailer. One commit per task.
- **Verification gate:** every task ends with `pnpm check` clean, or vitest if logic added.
- **a11y:** every new interactive element is `<button>` with aria; ContextMenu reuses Plan 2's `Menu`.
- **i18n:** every new user-visible string goes through `$t('key')`. New keys added to both `zh.json` and `en.json` in the same commit.
- **Optimistic update protocol:** every mutation handler:
  1. Runs the local patch (`navDataStore.applyItemPatch` or equivalent).
  2. Calls the API.
  3. On success → toast.success.
  4. On error → `navDataStore.refetch()` to re-sync, plus toast.error.

---

## Phase 0: API + Store Foundations (Tasks 1–2)

### Task 1: API wrappers for items + auth + config

**Files:**
- Create: `web/src/lib/api/nav.ts`

- [ ] **Step 1: Write the wrappers**

```ts
// web/src/lib/api/nav.ts
import { apiClient } from './client';
import {
  ItemSchema,
  type Item,
  type IconKind,
  type NavBundle
} from '$lib/types/nav';

// ----- Item CRUD -----

export interface ItemPayload {
  groupId: number | null;
  name: string;
  nameI18n?: Record<string, string> | null;
  description?: string | null;
  descriptionI18n?: Record<string, string> | null;
  iconKind: IconKind;
  iconValue: string;
  links: Record<string, string>;
  tagSlugs: string[];
}

export type ItemPatch = Partial<ItemPayload>;

export function createItem(payload: ItemPayload): Promise<Item> {
  return apiClient<Item>({
    method: 'POST',
    path: '/api/items',
    body: payload,
    responseSchema: ItemSchema
  });
}

export function patchItem(id: number, patch: ItemPatch): Promise<Item> {
  return apiClient<Item>({
    method: 'PATCH',
    path: `/api/items/${id}`,
    body: patch,
    responseSchema: ItemSchema
  });
}

export function deleteItem(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/items/${id}` });
}

// ----- Auth -----

export function changePassword(current: string, next: string): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/config/password',
    body: { current, next }
  });
}

// ----- Convenience: refetch the bundle from outside the store -----

export function fetchBundle(): Promise<NavBundle> {
  return apiClient<NavBundle>({
    method: 'GET',
    path: '/api/nav',
    responseSchema: (typeof window !== 'undefined' ? undefined : undefined) ??
      // schema is wired in navData store; this fallback delegates to the store-side wrapper.
      undefined as never
  });
}
```

Note: `fetchBundle()` is unused in Plan 4 (navDataStore.refetch handles re-sync); included for completeness so Plan 5 / future plans can call it from non-Svelte contexts. If your linter complains, drop it — it's just a documentation hint.

Practical version (use this — the placeholder above is illustrative):

```ts
// web/src/lib/api/nav.ts
import { apiClient } from './client';
import { ItemSchema, type Item, type IconKind } from '$lib/types/nav';

export interface ItemPayload {
  groupId: number | null;
  name: string;
  nameI18n?: Record<string, string> | null;
  description?: string | null;
  descriptionI18n?: Record<string, string> | null;
  iconKind: IconKind;
  iconValue: string;
  links: Record<string, string>;
  tagSlugs: string[];
}

export type ItemPatch = Partial<ItemPayload>;

export function createItem(payload: ItemPayload): Promise<Item> {
  return apiClient<Item>({
    method: 'POST',
    path: '/api/items',
    body: payload,
    responseSchema: ItemSchema
  });
}

export function patchItem(id: number, patch: ItemPatch): Promise<Item> {
  return apiClient<Item>({
    method: 'PATCH',
    path: `/api/items/${id}`,
    body: patch,
    responseSchema: ItemSchema
  });
}

export function deleteItem(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/items/${id}` });
}

export function changePassword(current: string, next: string): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/config/password',
    body: { current, next }
  });
}
```

(Use this final version. Drop the placeholder.)

- [ ] **Step 2: Verify**

```bash
cd web
pnpm check 2>&1 | tail -3
cd ..
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/nav.ts
git commit -m "feat(web): API wrappers for items + auth/changePassword"
```

### Task 2: editModeStore

**Files:**
- Create: `web/src/lib/stores/editMode.ts`

- [ ] **Step 1: Write store**

```ts
// web/src/lib/stores/editMode.ts
import { writable, derived, type Readable } from 'svelte/store';
import { sessionStore } from './session';

const _on = writable<boolean>(false);

/** Edit mode can ONLY be on when the user is authed. Logout flips it off. */
sessionStore.subscribe((s) => {
  if (!s.authed) _on.set(false);
});

export const editModeStore: Readable<boolean> & {
  toggle(): void;
  set(v: boolean): void;
} = {
  subscribe: derived([_on, sessionStore], ([$on, $s]) => $on && $s.authed).subscribe,
  toggle: () => _on.update((v) => !v),
  set: (v: boolean) => _on.set(v)
};
```

- [ ] **Step 2: Test**

```ts
// web/src/lib/stores/editMode.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { editModeStore } from './editMode';
import { sessionStore } from './session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  editModeStore.set(false);
  // Force authed=false baseline
  fetchMock.mockResolvedValueOnce(
    new Response(null, { status: 204 })
  );
});

describe('editModeStore', () => {
  it('toggle when not authed stays false', () => {
    editModeStore.toggle();
    expect(get(editModeStore)).toBe(false);
  });

  it('toggle when authed flips on', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    editModeStore.toggle();
    expect(get(editModeStore)).toBe(true);
  });

  it('logout flips edit mode off', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    editModeStore.set(true);
    expect(get(editModeStore)).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.logout();
    expect(get(editModeStore)).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd web
pnpm test:unit 2>&1 | tail -10
cd ..
git add web/src/lib/stores/editMode.ts web/src/lib/stores/editMode.test.ts
git commit -m "feat(web): editModeStore (auth-gated; logout flips off)"
```

---

## Phase 1: Login + EditToggle (Tasks 3–6)

### Task 3: LoginDialog

**Files:**
- Create: `web/src/lib/components/Editor/LoginDialog.svelte`

```svelte
<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { ApiError } from '$lib/api/client';
  import { t } from '$lib/i18n/store';
  import { toast } from '$lib/components/ui/toast';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  let password = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (!password || submitting) return;
    error = null;
    submitting = true;
    try {
      await sessionStore.login(password);
      toast.success($t('auth.login.title') + ' ✓');
      password = '';
      open = false;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) error = $t('auth.login.error.bad_password');
        else if (e.status === 429) error = $t('auth.login.error.rate_limited');
        else error = $t('error.unknown');
      } else {
        error = $t('error.network.offline');
      }
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open title={$t('auth.login.title')} width="sm">
  <form onsubmit={submit}>
    <Input
      label={$t('auth.login.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      invalid={!!error}
      errorText={error ?? undefined}
    />
  </form>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={() => submit()} disabled={!password} loading={submitting}>
      {$t('auth.login.submit')}
    </Button>
  {/snippet}
</Dialog>
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Editor/LoginDialog.svelte
git commit -m "feat(web): LoginDialog (Dialog + Input + Button; handles 401/429)"
```

### Task 4: Wire LoginDialog into AuthControls

**Files:**
- Modify: `web/src/lib/components/Header/AuthControls.svelte`

Replace contents:

```svelte
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import LoginDialog from '$lib/components/Editor/LoginDialog.svelte';
  import EditToggle from './EditToggle.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  let dialogOpen = $state(false);

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <EditToggle />
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={() => (dialogOpen = true)}>
    {$t('header.login')}
  </Button>
{/if}

<LoginDialog bind:open={dialogOpen} />
```

Note: `EditToggle` is created in Task 5; this commit will fail to compile until Task 5 lands. To avoid that, **temporarily** stub `EditToggle.svelte` first or merge Tasks 4 + 5 in one commit. Recommended: do them as **two separate commits but in the order Task 5 first → Task 4 second**. Adjust the order:

**Re-order:** Implement Task 5 (EditToggle) BEFORE Task 4 (AuthControls integration).

Run `pnpm check`. Commit (after Task 5):
```bash
git add web/src/lib/components/Header/AuthControls.svelte
git commit -m "feat(web): AuthControls opens LoginDialog + shows EditToggle when authed"
```

### Task 5: EditToggle button

**Files:**
- Create: `web/src/lib/components/Header/EditToggle.svelte`

```svelte
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { t } from '$lib/i18n/store';
</script>

<Button
  intent={$editModeStore ? 'primary' : 'secondary'}
  size="sm"
  onclick={editModeStore.toggle}
>
  {$editModeStore ? $t('header.editMode.exit') : $t('header.editMode.enter')}
</Button>
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Header/EditToggle.svelte
git commit -m "feat(web): EditToggle button (binds editModeStore)"
```

### Task 6: Visual indicator when in edit mode

**Files:**
- Modify: `web/src/routes/+layout.svelte`

Add a `<svelte:body>` directive (or class on `<main>`) that signals edit mode. Read `+layout.svelte`, then update:

```svelte
<script lang="ts">
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();
</script>

<svelte:body class:edit-mode={$editModeStore} />

<Header />

<main>
  {@render children()}
</main>

<Footer />

<ToastViewport />

<style lang="scss">
  main {
    flex: 1;
    width: 100%;
    max-width: 1024px;
    margin: var(--sp-6) auto 0;
    padding: 0 var(--sp-4);
    box-sizing: border-box;
  }

  :global(body.edit-mode main) {
    outline: 2px dashed var(--c-accent);
    outline-offset: var(--sp-2);
    border-radius: var(--rd-md);
  }

  :global(body.edit-mode)::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--c-accent);
    z-index: 200;
  }
</style>
```

Run `pnpm check`. Commit:
```bash
git add web/src/routes/+layout.svelte
git commit -m "feat(web): visual indicator (top bar + main outline) when edit mode is on"
```

---

## Phase 2: Item CRUD UI (Tasks 7–11)

### Task 7: NavItem context menu in edit mode

**Files:**
- Create: `web/src/lib/components/Editor/NavItemContextMenu.svelte`
- Modify: `web/src/lib/components/Nav/NavItem.svelte`

- [ ] **Step 1: Write the menu component**

```svelte
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
```

- [ ] **Step 2: Update NavItem to support edit mode interactions**

Modify `web/src/lib/components/Nav/NavItem.svelte`. Read the file first; the goal is:

- Import `editModeStore` and `NavItemContextMenu`.
- When in edit mode: right-click on the card opens the context menu at the cursor position.
- Edit mode also passes `onEdit` (opens ItemEditDialog from page level — wired via callback prop).
- Delete uses optimistic delete + toast undo.

Add new props and event handlers:

```svelte
<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { localeStore, t } from '$lib/i18n/store';
  import { editModeStore } from '$lib/stores/editMode';
  import NavItemContextMenu from '$lib/components/Editor/NavItemContextMenu.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { deleteItem } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';

  interface Props {
    item: Item;
    onEdit?: (item: Item) => void;
  }
  let { item, onEdit }: Props = $props();

  const url = $derived($currentSite.site ? item.links[$currentSite.site.value] ?? null : null);
  const displayName = $derived(item.nameI18n?.[$localeStore] ?? item.name);
  const isFav = $derived($uiPrefs.favoriteItemIds.includes(item.id));

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);

  function iconSrc(): string {
    switch (item.iconKind) {
      case 'asset': return `/navIcons/${item.iconValue}`;
      case 'url': return item.iconValue;
      case 'auto-favicon': return `/api/favicon?host=${encodeURIComponent(item.iconValue)}`;
    }
  }

  function open() {
    if ($editModeStore) return; // suppress nav navigation in edit mode
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function onKeydown(e: KeyboardEvent) {
    if ($editModeStore) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  function onFavClick(e: MouseEvent) {
    e.stopPropagation();
    uiPrefs.toggleFavorite(item.id);
  }

  function onContextMenu(e: MouseEvent) {
    if (!$editModeStore) return;
    e.preventDefault();
    menuX = e.clientX;
    menuY = e.clientY;
    menuOpen = true;
  }

  async function onConfirmDelete() {
    // optimistic remove
    const before = $navDataStore.bundle;
    if (!before) return;
    navDataStore.setBundle({
      ...before,
      items: before.items.filter((i) => i.id !== item.id)
    });
    try {
      await deleteItem(item.id);
      toast.success($t('common.delete') + ' ✓');
    } catch (e) {
      // rollback
      navDataStore.refetch();
      toast.error($t('error.unknown'));
    }
  }
</script>

<div class="cell" oncontextmenu={onContextMenu}>
  <button
    type="button"
    class="card"
    class:edit={$editModeStore}
    onclick={open}
    onkeydown={onKeydown}
    aria-label={displayName}
    disabled={!url && !$editModeStore}
  >
    <img class="icon" src={iconSrc()} alt="" loading="lazy" />
  </button>
  <button
    type="button"
    class="fav"
    aria-label={isFav ? 'Unfavorite' : 'Favorite'}
    aria-pressed={isFav}
    onclick={onFavClick}
  >★</button>
  <span class="label">{displayName}</span>
</div>

<NavItemContextMenu
  bind:open={menuOpen}
  x={menuX}
  y={menuY}
  onEdit={() => onEdit?.(item)}
  onDelete={onConfirmDelete}
/>

<style lang="scss">
  .cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); width: 96px; }
  .card {
    width: 96px; height: 96px; padding: var(--sp-3);
    background: var(--c-surface); border: 1px solid var(--c-border);
    border-radius: var(--rd-lg); box-shadow: var(--sh-sm);
    cursor: pointer; transition: transform var(--tr-base), box-shadow var(--tr-base), border-color var(--tr-fast);
    &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--sh-md); border-color: var(--c-accent); }
    &.edit { cursor: context-menu; }
    &:disabled { opacity: 0.55; cursor: not-allowed; }
    .icon { width: 100%; height: 100%; object-fit: contain; border-radius: var(--rd-sm); }
  }
  .fav {
    position: absolute; top: 2px; right: 2px;
    width: 22px; height: 22px;
    background: transparent; border: 0; color: var(--c-text-3);
    font-size: 14px; line-height: 1; cursor: pointer; border-radius: var(--rd-pill);
    opacity: 0; transition: opacity var(--tr-fast), color var(--tr-fast);
    &[aria-pressed='true'] { color: var(--c-warn); opacity: 1; }
  }
  .cell:hover .fav, .fav:focus-visible { opacity: 1; }
  .label { font-size: var(--fs-sm); color: var(--c-text); text-align: center; line-height: var(--lh-tight); word-break: break-word; }
</style>
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Editor/NavItemContextMenu.svelte web/src/lib/components/Nav/NavItem.svelte
git commit -m "feat(web): NavItem right-click context menu in edit mode (edit + delete with optimistic update)"
```

### Task 8: ItemEditDialog

**Files:**
- Create: `web/src/lib/components/Editor/ItemEditDialog.svelte`

```svelte
<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n/store';
  import { navDataStore } from '$lib/stores/navData';
  import { createItem, patchItem, type ItemPayload } from '$lib/api/nav';
  import { toast } from '$lib/components/ui/toast';
  import { ApiError } from '$lib/api/client';
  import type { Item } from '$lib/types/nav';

  interface Props {
    open: boolean;
    /** When set, dialog is in edit mode for this item; null = create. */
    target: Item | null;
    /** Initial group for create mode. */
    defaultGroupId?: number | null;
  }

  let { open = $bindable(false), target, defaultGroupId = null }: Props = $props();

  // Form state
  let name = $state('');
  let groupId = $state<number | null>(null);
  let iconKind = $state<'asset' | 'url' | 'auto-favicon'>('asset');
  let iconValue = $state('');
  let linksJson = $state('{}'); // simplified MVP: edit links as JSON
  let tagSlugsCsv = $state(''); // simplified: comma-separated
  let submitting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    // sync form when target / open changes
    if (!open) return;
    if (target) {
      name = target.name;
      groupId = target.groupId;
      iconKind = target.iconKind;
      iconValue = target.iconValue;
      linksJson = JSON.stringify(target.links, null, 2);
      tagSlugsCsv = target.tagSlugs.join(', ');
    } else {
      name = '';
      groupId = defaultGroupId;
      iconKind = 'asset';
      iconValue = '';
      linksJson = '{}';
      tagSlugsCsv = '';
    }
    error = null;
  });

  function parseLinks(): Record<string, string> {
    try {
      const parsed = JSON.parse(linksJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        );
      }
    } catch {
      /* fallthrough to error */
    }
    throw new Error('links must be a JSON object: { "siteValue": "url", ... }');
  }

  async function submit() {
    if (submitting) return;
    error = null;
    submitting = true;
    try {
      const links = parseLinks();
      const payload: ItemPayload = {
        groupId,
        name: name.trim(),
        iconKind,
        iconValue: iconValue.trim(),
        links,
        tagSlugs: tagSlugsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      };
      if (target) {
        await patchItem(target.id, payload);
        toast.success($t('common.save') + ' ✓');
      } else {
        await createItem(payload);
        toast.success($t('editor.item.new') + ' ✓');
      }
      navDataStore.refetch();
      open = false;
    } catch (e) {
      if (e instanceof ApiError) error = `${e.code}${e.message ? ': ' + e.message : ''}`;
      else if (e instanceof Error) error = e.message;
      else error = $t('error.unknown');
    } finally {
      submitting = false;
    }
  }

  const groupOptions = $derived($navDataStore.bundle?.groups ?? []);
</script>

<Dialog
  bind:open
  title={target ? $t('common.edit') : $t('editor.item.new')}
  width="md"
>
  <div class="form">
    <Input label={$t('common.edit') + ' — name'} bind:value={name} />
    <label class="grp">
      <span class="lbl">Group</span>
      <select bind:value={groupId}>
        <option value={null}>—</option>
        {#each groupOptions as g (g.id)}
          <option value={g.id}>{g.name}</option>
        {/each}
      </select>
    </label>
    <label class="grp">
      <span class="lbl">Icon kind</span>
      <select bind:value={iconKind}>
        <option value="asset">asset (file under /navIcons/)</option>
        <option value="url">url (full URL)</option>
        <option value="auto-favicon">auto-favicon (host)</option>
      </select>
    </label>
    <Input label="Icon value" bind:value={iconValue} placeholder="example.png / https://… / example.com" />
    <label class="grp">
      <span class="lbl">Links (JSON: siteValue → URL)</span>
      <textarea rows="4" bind:value={linksJson}></textarea>
    </label>
    <Input label="Tag slugs (comma-separated)" bind:value={tagSlugsCsv} placeholder="fav, tools" />
    {#if error}<p class="err">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={submit} loading={submitting} disabled={!name || !iconValue}>
      {$t('common.save')}
    </Button>
  {/snippet}
</Dialog>

<style lang="scss">
  .form { display: flex; flex-direction: column; gap: var(--sp-3); }
  .grp { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-sm); }
  .lbl { color: var(--c-text-2); font-weight: var(--fw-medium); }
  select, textarea {
    background: var(--c-surface); color: var(--c-text);
    border: 1px solid var(--c-border); border-radius: var(--rd-md);
    padding: var(--sp-2) var(--sp-3); font-family: inherit; font-size: var(--fs-md);
    &:focus { border-color: var(--c-accent); outline: none; box-shadow: 0 0 0 3px var(--c-accent-bg); }
  }
  textarea { font-family: var(--ft-mono); font-size: var(--fs-sm); }
  .err { margin: 0; color: var(--c-danger); font-size: var(--fs-sm); }
</style>
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Editor/ItemEditDialog.svelte
git commit -m "feat(web): ItemEditDialog (create + edit; links as JSON, tags as CSV — MVP)"
```

### Task 9: Wire ItemEditDialog into +page.svelte

**Files:**
- Modify: `web/src/routes/+page.svelte`
- Modify: `web/src/lib/components/Nav/NavGrid.svelte` (pass through onEdit)
- Modify: `web/src/lib/components/Nav/GroupSection.svelte` (pass through)
- Modify: `web/src/lib/components/Nav/FavoritesSection.svelte` (pass through)

Read each file. Add an `onEdit?: (item: Item) => void` prop chain from `+page.svelte` → `FavoritesSection`/`GroupSection` → `NavGrid` → `NavItem`. The page owns the dialog state.

Updated `+page.svelte`:

```svelte
<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { visibleSections, hasActiveFilter, clearFilters } from '$lib/stores/visible';
  import GroupSection from '$lib/components/Nav/GroupSection.svelte';
  import FavoritesSection from '$lib/components/Nav/FavoritesSection.svelte';
  import EmptyState from '$lib/components/Nav/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ItemEditDialog from '$lib/components/Editor/ItemEditDialog.svelte';
  import NewItemAffordance from '$lib/components/Editor/NewItemAffordance.svelte';
  import { editModeStore } from '$lib/stores/editMode';
  import { t } from '$lib/i18n/store';
  import type { Item } from '$lib/types/nav';

  const siteTitle = $derived($navDataStore.bundle?.meta.siteName ?? '');

  let editTarget = $state<Item | null>(null);
  let createForGroupId = $state<number | null>(null);
  let editDialogOpen = $state(false);

  function openEdit(item: Item) {
    editTarget = item;
    createForGroupId = null;
    editDialogOpen = true;
  }
  function openCreate(groupId: number | null) {
    editTarget = null;
    createForGroupId = groupId;
    editDialogOpen = true;
  }
</script>

<svelte:head><title>{siteTitle}</title></svelte:head>

{#if $navDataStore.loading && !$navDataStore.bundle}
  <div class="loading">
    <Skeleton width="240px" height="24px" />
    <Skeleton width="180px" height="16px" />
    <Skeleton width="220px" height="16px" />
  </div>
{:else if $navDataStore.error}
  <EmptyState title={$t('error.network.offline')} hint={$navDataStore.error} />
  <div class="retry">
    <Button onclick={() => navDataStore.refetch()}>{$t('error.network.retry')}</Button>
  </div>
{:else}
  <FavoritesSection onEdit={openEdit} />
  {#if $visibleSections.length === 0}
    {#if $hasActiveFilter}
      <EmptyState title={$t('nav.empty.search')} hint={$t('nav.empty.search.hint')} />
      <div class="retry">
        <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
      </div>
    {:else}
      <EmptyState title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
      {#if $editModeStore}
        <div class="retry"><Button onclick={() => openCreate(null)}>{$t('editor.item.new')}</Button></div>
      {/if}
    {/if}
  {:else}
    {#each $visibleSections as section (section.group?.id ?? 'ungrouped')}
      <GroupSection {section} onEdit={openEdit} />
      {#if $editModeStore}
        <NewItemAffordance onClick={() => openCreate(section.group?.id ?? null)} />
      {/if}
    {/each}
  {/if}
{/if}

<ItemEditDialog bind:open={editDialogOpen} target={editTarget} defaultGroupId={createForGroupId} />

<style lang="scss">
  .loading { display: flex; flex-direction: column; gap: var(--sp-3); align-items: center; margin-top: var(--sp-6); }
  .retry { display: flex; justify-content: center; margin-top: var(--sp-3); }
</style>
```

Update `NavGrid.svelte`:

```svelte
<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import NavItem from './NavItem.svelte';

  interface Props {
    items: Item[];
    onEdit?: (item: Item) => void;
  }
  let { items, onEdit }: Props = $props();
</script>

<div class="grid">
  {#each items as item (item.id)}
    <NavItem {item} {onEdit} />
  {/each}
</div>

<style lang="scss">
  .grid { display: grid; grid-template-columns: repeat(auto-fill, 96px); gap: var(--sp-5) var(--sp-4); justify-content: center; width: 100%; }
</style>
```

Update `GroupSection.svelte`:

```svelte
<script lang="ts">
  import type { VisibleGroup } from '$lib/stores/visible';
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import GroupHeader from './GroupHeader.svelte';
  import NavGrid from './NavGrid.svelte';

  interface Props {
    section: VisibleGroup;
    onEdit?: (item: Item) => void;
  }
  let { section, onEdit }: Props = $props();
  const isOpen = $derived(section.group ? $uiPrefs.groupOpen[section.group.slug] !== false : true);
</script>

<section class="section">
  {#if section.group}<GroupHeader group={section.group} />{/if}
  {#if isOpen}<NavGrid items={section.items} {onEdit} />{/if}
</section>

<style lang="scss">
  .section { display: flex; flex-direction: column; gap: var(--sp-4); margin-bottom: var(--sp-7); }
</style>
```

Update `FavoritesSection.svelte`:

```svelte
<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { visibleFavorites } from '$lib/stores/visible';
  import NavGrid from './NavGrid.svelte';
  import { t } from '$lib/i18n/store';

  interface Props {
    onEdit?: (item: Item) => void;
  }
  let { onEdit }: Props = $props();
</script>

{#if $visibleFavorites.length > 0}
  <section class="favorites">
    <h2 class="heading">★ {$t('nav.favorites.title')}</h2>
    <NavGrid items={$visibleFavorites} {onEdit} />
  </section>
{/if}

<style lang="scss">
  .favorites { margin-bottom: var(--sp-7); }
  .heading { margin: 0 0 var(--sp-4); font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--c-text-2); letter-spacing: 0.05em; text-transform: uppercase; }
</style>
```

Run `pnpm check`. Commit (single commit, all 4 files):
```bash
git add web/src/routes/+page.svelte web/src/lib/components/Nav/NavGrid.svelte web/src/lib/components/Nav/GroupSection.svelte web/src/lib/components/Nav/FavoritesSection.svelte
git commit -m "feat(web): wire ItemEditDialog through +page → FavoritesSection/GroupSection/NavGrid → NavItem"
```

### Task 10: NewItemAffordance

**Files:**
- Create: `web/src/lib/components/Editor/NewItemAffordance.svelte`

```svelte
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
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2);
    width: 96px; min-height: 96px; margin: 0 auto var(--sp-7);
    background: transparent; border: 2px dashed var(--c-border); border-radius: var(--rd-lg);
    color: var(--c-text-3); cursor: pointer;
    transition: border-color var(--tr-fast), color var(--tr-fast), background var(--tr-fast);
    &:hover { border-color: var(--c-accent); color: var(--c-accent); background: var(--c-accent-bg); }
  }
  .plus { font-size: 28px; line-height: 1; }
  .lbl { font-size: var(--fs-xs); }
</style>
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Editor/NewItemAffordance.svelte
git commit -m "feat(web): NewItemAffordance ('+' card shown after each group in edit mode)"
```

### Task 11: ChangePasswordDialog

**Files:**
- Create: `web/src/lib/components/Editor/ChangePasswordDialog.svelte`
- Modify: `web/src/lib/components/Header/AuthControls.svelte` (add menu trigger)

- [ ] **Step 1: Dialog**

```svelte
<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { changePassword } from '$lib/api/nav';
  import { ApiError } from '$lib/api/client';
  import { toast } from '$lib/components/ui/toast';
  import { t } from '$lib/i18n/store';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit() {
    error = null;
    if (next.length < 8) { error = 'New password must be ≥ 8 chars'; return; }
    if (next !== confirm) { error = 'New passwords do not match'; return; }
    submitting = true;
    try {
      await changePassword(current, next);
      toast.success($t('common.save') + ' ✓');
      current = next = confirm = '';
      open = false;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) error = $t('auth.login.error.bad_password');
        else error = e.message ?? $t('error.unknown');
      } else error = $t('error.unknown');
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open title="Change admin password" width="sm">
  <div class="form">
    <Input label="Current password" type="password" bind:value={current} />
    <Input label="New password (≥ 8 chars)" type="password" bind:value={next} />
    <Input label="Confirm new password" type="password" bind:value={confirm} />
    {#if error}<p class="err">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <Button intent="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</Button>
    <Button intent="primary" onclick={submit} loading={submitting}
      disabled={!current || !next || !confirm}>{$t('common.save')}</Button>
  {/snippet}
</Dialog>

<style lang="scss">
  .form { display: flex; flex-direction: column; gap: var(--sp-3); }
  .err { margin: 0; color: var(--c-danger); font-size: var(--fs-sm); }
</style>
```

- [ ] **Step 2: Add a "Change password" entry to AuthControls (when authed)**

Modify `AuthControls.svelte` to include a small Menu next to logout, OR just add a second button. For MVP, the simplest is a third button:

```svelte
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import LoginDialog from '$lib/components/Editor/LoginDialog.svelte';
  import ChangePasswordDialog from '$lib/components/Editor/ChangePasswordDialog.svelte';
  import EditToggle from './EditToggle.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  let loginOpen = $state(false);
  let pwOpen = $state(false);

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <EditToggle />
  <Button intent="ghost" size="sm" onclick={() => (pwOpen = true)}>🔑</Button>
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={() => (loginOpen = true)}>{$t('header.login')}</Button>
{/if}

<LoginDialog bind:open={loginOpen} />
<ChangePasswordDialog bind:open={pwOpen} />
```

Run `pnpm check`. Commit:
```bash
git add web/src/lib/components/Editor/ChangePasswordDialog.svelte web/src/lib/components/Header/AuthControls.svelte
git commit -m "feat(web): ChangePasswordDialog + 🔑 button in AuthControls"
```

---

## Phase 3: End-to-End Smoke (Task 12)

### Task 12: Full editor flow smoke

**Files:** none modified.

```bash
# Backend
cd server
rm -rf dev-data
SQLX_OFFLINE=true PORT=8080 BOOTSTRAP_ADMIN_PASSWORD=test1234 cargo run --quiet > /tmp/srv.log 2>&1 &
SRV=$!
sleep 18

# Login + create item via curl (proves API path)
curl -s -c /tmp/cookies.txt -X POST -H 'Content-Type: application/json' \
  -d '{"password":"test1234"}' http://127.0.0.1:8080/api/auth/login -w 'login=%{http_code}\n'

curl -s -b /tmp/cookies.txt -X POST -H 'Content-Type: application/json' \
  -d '{"groupId":null,"name":"SmokeTest","iconKind":"asset","iconValue":"x.png","links":{"shangHai":"http://test"},"tagSlugs":[]}' \
  http://127.0.0.1:8080/api/items -w '\ncreate=%{http_code}\n' | head -c 200
echo

# Bundle now has the item
curl -s http://127.0.0.1:8080/api/nav | python3 -c "
import sys, json; b = json.load(sys.stdin)
print('items:', [i['name'] for i in b['items']])
"

# Frontend dev server
cd ../web
pnpm dev --host 127.0.0.1 --port 5173 > /tmp/web.log 2>&1 &
WEB=$!
sleep 8
curl -sf http://127.0.0.1:5173/ -o /dev/null && echo "frontend OK"
cd ..

# Full pipeline
cd web
pnpm check 2>&1 | tail -3
pnpm test:unit 2>&1 | tail -5
pnpm build 2>&1 | tail -5
pnpm lint 2>&1 | tail -5
cd ..

kill $WEB 2>/dev/null
kill $SRV 2>/dev/null
sleep 1
```

Expected:
- login=204
- create=201
- /api/nav items array contains "SmokeTest"
- frontend serves OK
- check / test / build / lint all green

If anything fails, fix in this task and commit. Otherwise no commit.

## Self-Review

**Spec coverage**

| Spec section | Where covered |
|---|---|
| §5.1 entry/exit | Tasks 3 (login), 5 (toggle), 6 (visual indicator) |
| §5.2 row "delete item" | Task 7 (context menu + optimistic delete) |
| §5.2 row "new item" | Tasks 8 + 10 (dialog + affordance) |
| §5.2 row "edit item full form" | Task 8 (ItemEditDialog) |
| §5.2 row "change password" | Task 11 |
| §5.3 optimistic + rollback | Task 7 (delete), Task 8 (refetch on success/error) |

**Out of scope (deferred to Plan 4b/5)**

- Drag-drop reorder (`svelte-dnd-action`)
- Group / Site / Tag full management UIs (currently editable only via direct API)
- SiteSettingsDialog (站名/avatar/备案 via UI)
- Icon upload (multipart) UI
- Double-click inline rename (use ItemEditDialog instead)

**Type / signature consistency**

- `onEdit?: (item: Item) => void` chained from +page → FavoritesSection / GroupSection → NavGrid → NavItem.
- `editModeStore` is auth-gated: cannot turn on without authed=true, auto-flips off on logout.

**Verification gates**

- 5 of 12 tasks add svelte-check / vitest gates inline.
- Phase 3 (Task 12) is an e2e smoke combining real backend + frontend dev server.

**Deferred plans**

- Plan 4b (optional): drag-drop, full group/site/tag UI, SiteSettingsDialog, icon upload.
- Plan 5: dump-bootstrap.mjs, Dockerfile, docker-compose, Playwright e2e, README finalization. Plan 5 may absorb the Plan 4b items if user wants.
