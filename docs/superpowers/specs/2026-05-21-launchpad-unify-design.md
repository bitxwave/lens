# Launchpad Unification — Design

**Status**: Approved 2026-05-21
**Author**: brainstorming session
**Scope**: Replace the dual `grouped` / `flat` home layouts with a single
macOS Launchpad-style canvas; unify `groups` and `items` into one polymorphic
`cards` table; introduce long-press jiggle mode with full drag-and-drop
(reorder, auto-create folder, drop into folder, drag out of folder); drop
all i18n columns from user-facing data.

This document is the design contract. The implementation plan and tasks
are produced separately by `writing-plans`.

---

## 1. Goals

1. One home view: every nav target — whether a single link or a folder
   containing multiple links — is a `card` rendered in one grid.
2. Long-press any card → enter "jiggle mode": all cards animate, drag to
   reorder, drag-on-drag to auto-create a folder, drag into / out of a
   folder, click ✕ to delete, click folder name to rename.
3. Eliminate the layout-mode toggle (`grouped` vs `flat`) entirely.
4. Eliminate per-row internationalisation columns; product is single-locale
   for now (UI strings still go through `$t()`).
5. Migrate existing data losslessly.

## 2. Non-goals

- Folder-in-folder nesting (matches macOS Launchpad and iOS Home Screen).
- Drag handle UX (drag is initiated by long-press, not by a visible
  handle).
- Multi-locale per-card content (deliberately removed).
- Mobile-specific gesture rework — long-press on touch devices is
  identical to long-press on desktop.

## 3. Data model

### 3.1 `cards` table

```sql
CREATE TABLE cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('folder', 'item')),
  parent_id   INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  -- folder-only
  slug        TEXT,
  -- item-only
  icon_kind   TEXT,    -- 'asset' | 'url' | 'auto-favicon'
  icon_value  TEXT,
  description TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (parent_id, sort_order)
);
CREATE INDEX cards_parent_sort ON cards(parent_id, sort_order);
```

**Rules** (enforced by the application + a CHECK trigger):
- `parent_id IS NULL` ↔ top-level card on the home grid.
- `parent_id IS NOT NULL` ↔ inside a folder; the referenced card MUST be
  `kind='folder'`.
- `kind='folder'` MUST have `parent_id IS NULL` (no nested folders).
- `kind='folder'` rows MUST have `slug NOT NULL` and `icon_kind`,
  `icon_value`, `description` all `NULL`.
- `kind='item'` rows MUST have `icon_kind NOT NULL`, `icon_value NOT NULL`,
  and `slug IS NULL`.
- `(parent_id, sort_order)` is unique — duplicate slot in the same bucket
  is invalid.

### 3.2 `card_links` table

```sql
CREATE TABLE card_links (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url     TEXT    NOT NULL,
  PRIMARY KEY (card_id, site_id)
);
```

Only valid when `cards.kind='item'`. Application enforces this; folders
have no links.

### 3.3 Columns to drop

- `groups`, `items`, `item_links` — entire tables.
- `sites.name_i18n` — drop column.
- All `*_i18n` columns/fields anywhere in DTOs / TS types.

The bundle's `meta` retains its config-table-backed scalars; nothing
i18n in `meta` is currently populated, so no data loss there.

## 4. Migration

Migration is split because it can't be expressed cleanly as a single
SQL file (id remapping needs a host-language map). Three steps run in
order on boot:

1. **`0003_create_cards.sql`** — Create `cards` and `card_links`. No
   data movement; legacy tables untouched.

2. **`legacy_migrate.rs`** runs only when `groups` table still exists at
   startup. Inside one transaction:
   ```
   for g in SELECT * FROM groups ORDER BY sort_order, id:
       INSERT INTO cards (kind='folder', parent_id=NULL, sort_order=g.sort_order,
                          name=g.name, slug=g.slug, ...)
           returning id  →  remember as new_id_for_group[g.id]
   for i in SELECT * FROM items ORDER BY group_id, sort_order, id:
       parent = i.group_id ? new_id_for_group[i.group_id] : NULL
       INSERT INTO cards (kind='item', parent_id=parent, sort_order=i.sort_order,
                          name=i.name, icon_kind=i.icon_kind, ...)
           returning id  →  remember as new_id_for_item[i.id]
   for il in SELECT * FROM item_links:
       INSERT INTO card_links (card_id=new_id_for_item[il.item_id],
                               site_id=il.site_id, url=il.url)
   DROP TABLE item_links;
   DROP TABLE items;
   DROP TABLE groups;
   commit
   ```
   The function is idempotent (no-op when `groups` is gone). Failures
   roll back the whole transaction; legacy tables stay intact and the
   app refuses to start until the operator investigates.

3. **`0004_drop_i18n_cols.sql`** — `ALTER TABLE sites DROP COLUMN
   name_i18n;`. (SQLite supports DROP COLUMN since 3.35 / 2021; minimum
   version already in our toolchain.)

Rollback strategy: a manual recovery script is out of scope. Operator
backs up `data.db` before upgrade. Migration is destructive of the
legacy schema.

## 5. API

### 5.1 New endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cards` | Create folder or item. Body: `{kind, parentId?, name, slug?, iconKind?, iconValue?, description?, links?}`. Returns the created Card. |
| `PATCH` | `/api/cards/:id` | Update any subset of `name / slug / iconKind / iconValue / description / parentId / links`. Returns the updated Card. |
| `DELETE` | `/api/cards/:id` | Delete card. If folder with children: children are released to top-level (parent_id=NULL, appended at end of root sort_order) in the same transaction. |
| `POST` | `/api/cards/reorder` | Body: `[{id, parentId, sortOrder}]`. Atomically updates the affected bucket(s). Validates that all listed cards within one parentId form a contiguous 0..N permutation; rejects partial / overlapping orderings. |
| `POST` | `/api/cards/auto-folder` | Body: `{sourceItemId, targetItemId, name}`. Atomic: create folder card with `name` at the target item's slot; both items become its children at sort_order 0 and 1; original item slots are renumbered. |

### 5.2 Removed

- `/api/groups` (POST/PATCH/DELETE/reorder)
- `/api/items` (POST/PATCH/DELETE/reorder)

Frontend code calling these must be removed in the same PR; backend
returns 404 for them.

### 5.3 Bundle endpoint

`GET /api/nav` payload changes:

- Remove `groups` array, `items` array.
- Add `cards: Card[]` containing every card (top-level and inside folders).
- Frontend reconstructs the hierarchy by `parent_id`.
- `meta`, `sites` unchanged structurally except for the removed
  `name_i18n` field on Site.

`Card` shape (TS / Rust):
```
{
  id: number
  kind: 'folder' | 'item'
  parentId: number | null
  sortOrder: number
  name: string
  slug?: string                 // folder only
  iconKind?: 'asset' | 'url' | 'auto-favicon'  // item only
  iconValue?: string                            // item only
  description?: string | null                   // item only
  links?: Record<siteValue, url>                // item only
  createdAt: number
  updatedAt: number
}
```

## 6. Frontend interaction

### 6.1 Long-press → jiggle mode

A new `jiggleMode` store replaces `editModeStore`. The store toggles
based on:
- Pointerdown on any card. After 600ms with no pointerup and movement
  ≤ 5px, the store flips to `true` and the originating card immediately
  enters drag.
- ESC key, or click on grid background outside any card → flips to
  `false`.
- Programmatic exit after a successful auto-folder rename, item
  delete, etc. — actions that finish the user's edit intent.

Jiggle mode is gated by auth: unauthenticated users never enter it.
For unauth users long-press is a no-op (short tap still opens the link
or expands the folder).

### 6.2 Card visuals in jiggle mode

- CSS keyframe animation: each card rotates between -1° and +1° on a
  staggered ~250ms loop (each card's loop offset is derived from `id %
  4` to avoid synchronised motion).
- Top-left corner: ✕ button (16×16, danger color). Click: confirm
  (`name`) → `DELETE /api/cards/:id`.
- For folders: name is rendered as an inline-editable label. Click
  enters rename; Enter commits via `PATCH /api/cards/:id { name }`,
  ESC cancels.

### 6.3 Folder open / expand

Folders open inline, **not** in a modal. When a folder is clicked
(short tap, with or without jiggle):

- The folder's row gets a logical "expansion slot" rendered immediately
  below as a full-width sub-grid containing its children.
- Visual: a card-styled panel that pushes subsequent rows down.
- Closing: click another folder, or click empty space, or Esc.
- `GroupFolderModal.svelte` is removed.

This is what makes "drag out of folder" natural: in jiggle mode, the
folder is open and inline, so the child card and the parent grid share
one DOM scope. Dropping a child outside the folder panel → `PATCH
parent_id = null`, the child is appended to the home grid root, and
the folder collapses if it was open.

### 6.4 Drag rules

| Source | Drop target | Effect |
|---|---|---|
| any card | between two card slots in same bucket | reorder via `/cards/reorder` |
| item | item, hover ≥600ms over the same slot | auto-folder via `/cards/auto-folder`; new folder named (default `$t('home.folder.untitled')`, currently rendered as "未命名" in zh, "Untitled" in en); opens inline + focuses rename |
| item | folder, hover ≥600ms over the same slot | reorder + reparent: client emits a single `/cards/reorder` payload that places the dragged item inside the target folder's bucket at sort_order 0 (or end, depending on hover position) |
| item inside an open folder | grid area outside that folder's expansion panel | reorder + reparent to root: same `/cards/reorder` payload moves the item into the root bucket and renumbers; folder panel collapses if it was open |
| folder | another folder or item slot in root | reorder root bucket only — folder-on-folder hover does NOT merge (no nested folders allowed) |
| folder | inside an open folder | rejected; folder cannot become a child of another folder |

`svelte-dnd-action` drives the dnd. The "hover ≥600ms" auto-merge logic
is wrapped around `onConsider`/`onFinalize` with a debounced timer
keyed on (sourceId, targetId). All reparenting flows through
`/cards/reorder` (whose payload already carries `parentId`); a separate
PATCH-only path exists in the API for non-drag use (e.g. admin), but
the home grid never uses it.

### 6.5 New card creation

- The home grid always renders a "+" placeholder at the end of the root
  bucket when authenticated.
- Click "+" → opens `ItemEditDialog` (existing component, slightly
  pruned since `groupId` is now `parentId` and `tagSlugs` is already
  gone). Submit → `POST /api/cards { kind: 'item', parentId: null, ... }`.
- A folder is created only via auto-folder drag; there is no
  "create empty folder" affordance. (If we ever need it, an `Admin →
  Cards` future tab can offer it.)

### 6.6 Search

Search behaviour is unchanged in spirit:
- When `searchQuery` non-empty, the home grid is replaced by a flat
  filtered grid of matching items (regardless of folder), as today.
- Folders, jiggle mode, dnd are disabled while searching.

### 6.7 Removed UI

- `GroupFolderModal.svelte`
- `GroupSection.svelte`, `GroupHeader.svelte` (replaced by inline expand)
- `EditToggle.svelte` (long-press supersedes)
- `editModeStore` (replaced by `jiggleMode`)
- Layout-mode picker in `AdminSiteTab.svelte`
- Admin Groups tab + admin route entry
- `layoutMode` config key + `bundle.meta.layoutMode` field

## 7. Admin page after the change

- **Site tab** — Branding only (title, avatar, footer). Layout mode
  block deleted.
- **Sites tab** — unchanged (drag reorder + CRUD).
- **No Groups tab** — folder lifecycle lives on the home grid.
- **No Cards / Items tab** — items are managed on the home grid via
  long-press jiggle.

## 8. Delete semantics

- `DELETE /api/cards/:id` on an item → simple delete; cascade removes
  `card_links` rows by FK.
- `DELETE /api/cards/:id` on a folder → in one transaction:
  1. Compute `next_root_sort = MAX(sort_order)+1 FROM cards WHERE parent_id IS NULL`.
  2. For each child in old folder (ordered by current `sort_order`):
     `UPDATE cards SET parent_id=NULL, sort_order=next_root_sort` and
     `next_root_sort += 1`.
  3. `DELETE FROM cards WHERE id=<folder_id>`.
- `DELETE /api/sites/:id` — keep the existing 409 Conflict if any
  `card_links` reference it; client must clear references first.

Frontend always shows a confirm prompt before delete. For folders the
prompt names the count of children that will be released.

## 9. Files (summary)

### Backend new

- `server/migrations/0003_create_cards.sql`
- `server/migrations/0004_drop_i18n_cols.sql`
- `server/src/services/legacy_migrate.rs`
- `server/src/routes/cards.rs`
- `server/tests/repo_cards.rs`
- `server/tests/api_cards.rs`

### Backend changed (rewritten in part)

- `server/src/dto.rs` (Card / CardPayload / CardPatch / ReorderEntry refit; drop Group / Item DTOs and i18n fields)
- `server/src/repo/nav.rs` (NavRepo trait → CardRepo: list_cards / create_card / patch_card / delete_card / reorder_cards / auto_folder)
- `server/src/repo/sqlx_impl.rs` (rewrite CRUD against `cards` / `card_links`)
- `server/src/services/bundle.rs` (return `cards`)
- `server/src/services/migration.rs` (bootstrap seed writes cards directly)
- `server/src/routes/mod.rs` (drop groups/items, mount cards)
- `server/src/main.rs` (call `legacy_migrate::migrate_if_needed()` after `migrate(pool)`)

### Backend removed

- `server/src/routes/groups.rs`
- `server/src/routes/items.rs`
- `server/tests/repo_items.rs`
- `server/tests/api_items.rs`
- `server/tests/api_groups_sites.rs` (group section gone; site section kept inline in api_cards or a new `api_sites.rs`)
- `server/tests/repo_sites.rs` `delete_site_referenced_by_item_returns_conflict` updated to query `card_links`

### Frontend new

- `web/src/lib/types/card.ts` (replaces Group/Item types)
- `web/src/lib/api/cards.ts` (replaces nav.ts CRUD; nav.ts keeps only the bundle fetch helper)
- `web/src/lib/components/Nav/Card.svelte` (polymorphic renderer)
- `web/src/lib/components/Nav/InlineFolderExpand.svelte`
- `web/src/lib/components/Nav/JiggleHost.svelte`
- `web/src/lib/stores/jiggle.ts`
- `web/src/lib/util/longPress.ts` (Svelte action)

### Frontend changed (significant)

- `web/src/lib/types/nav.ts` (replaces Group/Item with Card; drop tagSlugs; drop layoutMode)
- `web/src/lib/stores/{navData.ts, visible.ts}` (cards-aware)
- `web/src/lib/api/nav.ts` (drop item CRUD)
- `web/src/routes/+page.svelte` (single rendering path)
- `web/src/lib/components/Editor/ItemEditDialog.svelte` (`groupId` → `parentId`; minor)
- `web/src/lib/components/Admin/AdminSiteTab.svelte` (drop Layout block)
- `web/src/routes/admin/+page.svelte` (drop Groups tab)

### Frontend removed

- `web/src/lib/components/Header/EditToggle.svelte`
- `web/src/lib/stores/editMode.ts`
- `web/src/lib/components/Admin/AdminGroupsTab.svelte`
- `web/src/lib/components/Nav/{GroupFolderModal.svelte, GroupSection.svelte, GroupHeader.svelte, GroupFolder.svelte}` (Card.svelte subsumes folder rendering)
- `web/src/lib/api/admin.ts` group section + reorderGroups (kept: site CRUD + reorder)

### Tests touched

- All existing `repo_items` / `repo_sites` cases that pass `tag_slugs` / `group_id` get refactored to the cards model.
- New tests for: cards CRUD, reorder permutation validation, folder
  delete releases children, auto-folder transactionality, legacy
  migration idempotency.

## 10. Acceptance criteria

1. After deploy, `GET /api/nav` includes a `cards` array, no `groups` /
   `items` / `tagSlugs` / `layoutMode` keys; existing data appears in
   the new shape.
2. Existing 4 groups + 20 items + 4 sites visible on the home grid in
   the same visual layout (folders for the four group folders).
3. Long-press 600ms on any card → all cards begin to jiggle within 100ms.
4. Drag two `kind='item'` cards onto each other → new folder appears
   with the locale-appropriate default name (`未命名` in zh, `Untitled`
   in en), both items inside, inline rename input focused.
5. Drag a card from inside an open folder to the root grid → it
   becomes a top-level card; the folder collapses.
6. ✕ on a folder card with children → confirm prompt names the child
   count; on confirm, the folder is gone, children appear at the end
   of the root grid in their original order.
7. ESC or click on root background exits jiggle mode within 1 frame.
8. Admin → Site has no Layout block; Admin top tabs are exactly Site
   and Sites; no Groups tab.
9. `cargo test` passes, `pnpm test:unit` passes, `cargo clippy
   -- -D warnings` passes, `svelte-check` produces no new errors
   beyond pre-existing baseline.

## 11. Risks and how we mitigate

- **Migration loses data**: legacy_migrate is wrapped in one
  transaction; refuses to start the server on error. Operator must
  back up `data.db` before upgrade — README will say so.
- **Sortorder collisions during concurrent reorders**: the unique
  constraint on `(parent_id, sort_order)` will reject the second
  writer; client retries by fetching current state. Single-admin
  product, so contention is rare.
- **Touch long-press vs scroll on mobile**: pointerdown listener
  cancels the 600ms timer if movement >5px; scrolling does not trip
  jiggle.
- **Auto-folder accidental triggers**: the 600ms hover threshold and
  the visual hover indicator (target item halo) prevent accidental
  merges.

## 12. Out of scope (parked)

- Folder cover image / custom 4-tile arrangement (current auto-tile
  preview is fine).
- Multi-select drag (single drag is sufficient).
- Per-folder background colour, emoji.
- Reordering across pages — there are no pages, only one grid.
