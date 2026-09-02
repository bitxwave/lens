# Launchpad Explicit Page Column — Design

**Status**: Draft 2026-07-17 — **ready for `writing-plans`** (Q1–Q5
closed; Q6+ are non-blocking implementation details deferred to the
plan)
**Scope**: Migrate the root-level launchpad from an implicit
`ceil(sort_order / pageSize)` page derivation to an **explicit `page`
column** on `cards`, so pages can be sparse (each page holds 0..pageSize
items) and drop semantics match macOS Launchpad's "tolerant overflow +
auto-densify" feel.

The pager physics rewrite ([2026-07-16-launchpad-pager-physics-design.md](2026-07-16-launchpad-pager-physics-design.md))
made page count a first-class store value (`pager.setPageCount(n)`) but
still leaves the caller to compute `n = ceil(itemCount / pageSize)`. That
formula bakes an unwritten invariant into the client — "every non-final
page holds exactly `pageSize` items" — which fights every drop and
reorder operation. This spec makes that invariant go away.

Related priors:
- [2026-05-21-launchpad-unify-design.md](2026-05-21-launchpad-unify-design.md) — original launchpad grid + pager unification
- [2026-05-26-launchpad-drag-merge-disambiguation-design.md](2026-05-26-launchpad-drag-merge-disambiguation-design.md) — drop/merge/reorder gesture semantics
- [2026-05-19-rust-navigation-platform-design.md](2026-05-19-rust-navigation-platform-design.md) — server data model baseline

This document is the design contract. The implementation plan is
produced separately by `writing-plans` once open questions close.

---

## 1. Goals

1. Root-level cards (`parent_id IS NULL`) carry an **explicit `page`
   integer**, independent of `sort_order`. Pages may be **sparse**
   (0..pageSize items per page).
2. `sort_order` becomes **page-local**: it orders items within a single
   page only; cross-page ordering is by `(page, sort_order)`. Two pages
   can each have `sort_order = 3` without collision.
3. Drop semantics follow macOS Launchpad: **tolerant overflow during and
   after a drop** (a page may briefly hold `pageSize + 1` items) with
   **no cascading reshuffle** to keep implementation simple.
4. **Empty middle pages are auto-densified** on drop commit — a page
   whose last item was moved out disappears, and higher-numbered pages
   shift down by one. This keeps `PageDots` free of "dead" dots.
5. Folder-contained items are unaffected (folders have no pager). Only
   the root pager changes.
6. Migration from the current `sort_order`-only schema is one-way and
   deterministic (chunk existing rows by `pageSize=20` into
   `(page, sort_order)` pairs).

## 2. Non-goals

- Vertical / two-axis pagers.
- Pager physics changes (the spring/rubber-band model from
  2026-07-16 stays as-is).
- Drag-merge / jiggle / edge-pan gesture rewriting (those semantics
  from 2026-05-26 stay as-is; only the payload contract changes to
  include a `page` field where needed).
- Folder ordering (folders keep their existing `sort_order`-only
  scheme).
- Retroactive normalization of user-configured `pageSize` — the
  migration hard-codes `pageSize = 20` as its chunking window; runtime
  `pageSize` changes do not re-chunk existing rows.
- Per-page names or metadata (Launchpad doesn't have them either).
- Keyboard reordering (Ctrl+Arrow to nudge a selected card between
  pages / slots). No "selected card" concept exists today and jiggle-
  mode drag already covers manual reorder. Deferred.
- Dev-only densify-repair admin endpoint. If invariant 5.1 breaks in
  production, the fuzz tests should have caught it in CI first.
- Server-side re-chunking on `pageSize` change. `pageSize` is a
  client-side viewport concept; window resize / breakpoint changes
  do not mutate the database (see §3.7).
- Real-time multi-client sync (SSE / WebSocket push). Client B
  refreshes on its own cadence (see §3.9).

## 3. User-facing behavior

### 3.1 Data model contract (as seen by the client)

- Each root-level card has `(page: number ≥ 0, sort_order: number ≥ 0)`.
- The pager shows one dot per **distinct `page` value that has ≥1
  card**. Sparse pages never produce empty dots (invariant maintained
  by server-side normalize on every mutation).
- A page may hold **more than `pageSize`** items after a drop (tolerant
  overflow, see 3.3). `pageSize` is a client-side visual/grid layout
  parameter; the server does not enforce it.

### 3.2 Rendering rule

Client-side, given the list of cards sorted by `(page, sort_order)`:

- Group by `page`.
- For each group, lay out the first `pageSize` items into the standard
  grid; any items beyond `pageSize` overflow visually (see 3.3.a).
- `PageDots` shows one dot per group. `pager.setPageCount(groups.length)`.

### 3.3 Drop semantics (Q2 = A + Q2b = yes)

Terminology: `K` = current item count of the target page before drop;
`pageSize` = client visual capacity (default 20).

#### a. During drag (pointer held)

| Scenario | Behavior |
|---|---|
| Drop preview into page with `K < pageSize` | Page shows `K+1` items in the standard grid; no overflow. |
| Drop preview into page with `K = pageSize`, anywhere | Page **tolerates** `K+1`; the extra item renders in the position implied by the drop intent. **No cascading shift** to neighboring pages while the pointer is held. |
| Source page becomes `K-1` | Renders `K-1` items; no auto-fill. |

The overflowed cell may fall outside the visible grid rows — that is
acceptable and matches Launchpad's transient overflow. Do not truncate
or reposition to hide it.

#### b. On drop commit (pointer up)

- Insert the dragged item at its final `(page, sort_order)`.
- **Do not cascade-shift** siblings into a neighboring page even if the
  page ends up with `pageSize + 1` items. The overflow persists.
- **Densify pages**: after the insert/delete transaction, renumber
  `page` values across all root cards so they form a contiguous
  `[0, N-1]` range with no gaps (see 3.4).
- The `pager.gotoPage` target after drop is the page the user dropped
  into, in the **densified** numbering.

#### c. Source page becomes empty

- The empty page is removed as part of the densify step (3.4).
- If the user's current page was strictly greater than the removed
  page, their view shifts down by one page (target page number
  decrements after densify).
- If the user was on the removed page, they land on the same numeric
  page in the new numbering (which corresponds to the next page in the
  old numbering).

### 3.4 Server-side densify (auto-cleanup)

After every mutation that touches root-card `(page, sort_order)`
(drop / reorder / delete / folder dissolve / folder unpack), the server:

1. Selects all root cards ordered by `(page, sort_order)`.
2. Computes the distinct sorted list of existing `page` values, e.g.
   `[0, 2, 5]`.
3. Builds a mapping `old_page → new_page` = `[0→0, 2→1, 5→2]`.
4. Applies the mapping in a single `UPDATE ... WHERE id IN (...)` per
   old page (or via `CASE WHEN` if RETURNING/perf demands).
5. All within the same transaction as the triggering mutation.

The client re-fetches nav data (existing pattern) and sees the densified
result. There is no client-side densify; the server is the sole
authority for page numbering.

### 3.5 New-item placement (create card at root)

When a new item is created at the root (via edit dialog, no drop
target):

1. If any page has `K < pageSize`, append to the **lowest-numbered such
   page** at `sort_order = MAX(sort_order) + 1` within that page.
2. Otherwise, create a new page at `page = MAX(page) + 1` and place the
   item at `sort_order = 0`.
3. The pager then animates to that page (existing `ItemEditDialog.onCreated`
   hook already calls `pager.gotoPage(pageCount - 1)`; the target
   changes to "the page the new item landed on", not necessarily the
   last).

### 3.6 Same-page reorder (drop within one page)

Dragging a card from `(page P, slot A)` to `(page P, slot B)` still
routes through `POST /api/cards/{id}/move` with the semantic payload —
same code path as cross-page moves. Rationale (Q4 = α):

- One entry point for all root reorders keeps server logic single-
  file, fuzz-testable, and free of client/server duplicated ordering
  math.
- The server's densify step is a no-op for a same-page move (no page
  boundary changes), so there is no runtime cost vs a hypothetical
  "same-page fast path".
- The client's `handleDrop` doesn't have to branch on "same page vs
  different page" — it packages `{target_page, target_sort_order,
  intent}` regardless.

### 3.7 `pageSize` changes at runtime

`pageSize` is derived client-side from container width
(`cols × rows` in `+page.svelte`). When the viewport resizes, breakpoint
changes, or the user toggles the sidebar, `pageSize` may change:

- **No server call is triggered.** The visible grid re-lays out under
  the new `pageSize`. Cards beyond position `pageSize - 1` on a given
  page remain "overflow" — they render past the last row of the grid
  (may be partially or wholly clipped by the pager viewport; that is
  acceptable, matches the tolerant-overflow semantics of §3.3).
- Only user-initiated drops mutate server state. Window resize alone
  never re-chunks the database.
- Corollary: the same underlying `(page, sort_order)` layout can look
  different across viewports (a 21-card page might be 3 rows × 7 cols
  wide-screen versus 5 rows × 4 cols mobile). This is expected and
  consistent with Launchpad's "your custom layout is preserved even
  when the grid changes shape".

### 3.8 Overflowed cells stay interactive

A card whose grid slot falls beyond the visible `pageSize` area is
still a first-class card:

- Pointer events, hover, jiggle-mode drag are all live.
- Dragging it to a screen edge triggers edge-pan the same way any
  interior card does. This is the primary user affordance for
  manually densifying an overflow — pick up the 21st card and drop
  it on the next page.
- Rendering is at the same z-index; the card is not visually demoted.
  If the CSS grid clips it, that clipping is due to the page
  container's `overflow` boundary, not a special "overflow card"
  style.

### 3.9 Multi-client freshness

If two clients (browser tabs) both view the same server:

- **No push channel is added.** Client B keeps rendering its stale
  snapshot until it next refetches — which happens on route change,
  reconnect, or manual refresh.
- A client's own mutations always trigger a local refetch (existing
  pattern via `navDataStore.refetch`), so the actor sees the fresh
  state immediately.
- The stale-render window is bounded by whatever refetch cadence the
  app already has. Real-time cross-client sync is out of scope (see
  §2 non-goals).

### 3.10 Drop failure UX

When `POST /api/cards/{id}/move` errors (network drop, server
validation failure, transaction rollback):

- Client shows a toast with the error message (existing
  `describeError` helper reuse).
- Client re-fetches the nav bundle. The store re-hydrates, and card
  cells rebind to their true server positions — visually equivalent
  to "undo the drop", but without a bespoke ghost-reverse animation
  in `dragGrid.ts`.
- The dragGrid ghost has already fallen off the pointer at drop-
  commit; there's no "in-flight optimistic state" to unwind in the
  store (Q3c = C3), so recovery is a plain re-render.

### 3.11 Folder interactions

- Folders themselves live on the root pager and have `(page, sort_order)`.
- Items **inside** a folder have `parent_id != NULL` and their `page`
  column is **NULL** or ignored. Folder-internal ordering remains
  `sort_order`-only.
- **Folder dissolve** (folder collapses to its last remaining child,
  from [2026-05-26-launchpad-drag-merge-disambiguation-design.md](2026-05-26-launchpad-drag-merge-disambiguation-design.md)):
  the surviving child inherits the folder's `(page, sort_order)` slot,
  as already implemented (`fix(server): dissolved folder's lone child
  inherits folder's slot` — commit 94b2956).
- **Folder unpack** (all items back to root; if we support it):
  unpacked items append to the current page-with-space, following 3.5.

## 4. Data model

### 4.1 Schema change

New migration `0002_add_page_column.sql`:

```sql
-- Add explicit page column for root-level cards. Folder-contained
-- cards leave page = 0 (unused; ordering is by sort_order alone).
ALTER TABLE cards ADD COLUMN page INTEGER NOT NULL DEFAULT 0;

-- Backfill: chunk existing root cards into pages of 20 by their
-- current global sort_order, and reset sort_order to be page-local.
-- This is a one-shot data migration; subsequent drops keep it
-- densified via the server's normalize step.
--
-- Strategy (pseudo-SQL — actual migration will use a temporary
-- numbered CTE or a Rust-side migration script if SQLite lacks
-- window function coverage; see 4.4):
--   WITH ranked AS (
--     SELECT id,
--            (ROW_NUMBER() OVER (ORDER BY sort_order) - 1) / 20 AS new_page,
--            (ROW_NUMBER() OVER (ORDER BY sort_order) - 1) % 20 AS new_sort
--     FROM cards WHERE parent_id IS NULL
--   )
--   UPDATE cards SET page = ranked.new_page, sort_order = ranked.new_sort
--   FROM ranked WHERE cards.id = ranked.id;

-- Drop the old global-unique-per-parent index and replace with a
-- per-page one.
DROP INDEX cards_unique_slot;
DROP INDEX cards_parent_sort;

-- Root cards: (page, sort_order) unique within root scope.
-- Folder cards: (parent_id, sort_order) unique within their folder.
-- The COALESCE(parent_id, -1) trick still works because folder cards
-- ignore `page` (it's 0 for all of them, which is fine — folders
-- discriminate by parent_id, not page).
CREATE UNIQUE INDEX cards_unique_slot
  ON cards(COALESCE(parent_id, -1), page, sort_order);
CREATE INDEX cards_parent_sort ON cards(parent_id, page, sort_order);
```

Notes:
- `page` defaults to 0 so folder-contained cards get a valid value with
  zero effort. The `COALESCE(parent_id, -1) = -1` group is the "root
  bucket"; the `page` dimension only matters there. Non-root buckets
  effectively ignore `page` because they never mutate it.
- If SQLite's `ROW_NUMBER() OVER` availability is a concern on the
  target minimum version, the backfill runs as a Rust-side data
  migration (fetch all root rows, sort, chunk, batch-update) rather
  than pure SQL. See 4.4.

### 4.2 DTO / API changes

**Decision (Q3 = B, Q3b = split, Q3c = C3)**: root-level moves shift
from the current client-computed flat `Vec<ReorderEntry>` to a
**server-computed semantic move**. Folder-internal ordering keeps the
existing flat reorder API. Optimistic UI keeps only its DOM-layer
transition; store commits wait for the server response.

#### 4.2.a Server: new endpoint `POST /api/cards/{id}/move` (root moves)

```rust
// server/src/dto.rs
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCardPayload {
    /// Destination page for root-level moves. Server may end up
    /// remapping it in the densify step; the value here is the page
    /// **as seen by the client at drop-commit time** (pre-densify).
    pub target_page: i64,

    /// Destination sort_order within `target_page`. Same
    /// pre-densify semantic.
    pub target_sort_order: i64,

    /// Whether the target index is "insert-before" (i.e. the card
    /// lands *at* `target_sort_order`, shifting existing items right)
    /// or "insert-after". Matches the `DropIntent::Before | After`
    /// the client already tracks.
    pub intent: MoveIntent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MoveIntent { Before, After }
```

Semantics:
- Server-side sequence per request:
  1. Validate: `target_page >= 0`, card exists, card is currently
     root-level (`parent_id IS NULL`). Cross-parent moves stay on
     `PATCH /api/cards/{id}` (reparent-only) and are out of scope for
     this endpoint.
  2. Compute final `(page, sort_order)` in a transaction: locate the
     insertion point, shift existing items on the target page from
     `target_sort_order` onward by +1 (before) or from
     `target_sort_order + 1` onward (after), assign the moved card its
     new slot.
  3. Run `normalize_root_pages(&mut tx)` (4.3) which densifies pages
     and rewrites `sort_order` to be contiguous per page.
  4. Return the new `Vec<Card>` for the root bucket so the client can
     patch its store without a full refetch (still allowed to
     refetch — the payload is a convenience, not a contract).

**Response body**: `Vec<Card>` (the root cards, in `(page, sort_order)`
order, post-densify).

#### 4.2.b Folder-internal reorder keeps the existing endpoint

`POST /api/cards/reorder` continues to accept
`Vec<ReorderEntry>` for folder-internal ordering. Its behavior:

- Existing contract preserved: each `ReorderEntry` has `id`,
  `sort_order`, `parent_id`. `page` **is not part of this DTO**
  (folder items don't page).
- Server-side validation: rejects any entry with `parent_id IS NULL`
  (root moves must go through `/api/cards/{id}/move`). This is a
  behavioral change — clients that still POST root reorders here get
  a `400 Bad Request` with a clear message. The client migration
  removes those callers in the same PR.

#### 4.2.c Auto-folder and delete: implicit normalize

- `POST /api/cards/auto-folder`: after existing logic, run
  `normalize_root_pages` (auto-folder can leave a gap when the two
  source items were on different pages).
- `DELETE /api/cards/{id}`: after existing logic (which already
  releases folder children to root), run `normalize_root_pages`.
- Folder dissolve (which happens implicitly when a folder's second-to-
  last child is moved out): the existing slot-inheritance fix
  (commit 94b2956) plus `normalize_root_pages` at the end.

#### 4.2.d Card creation: server picks the slot

`POST /api/cards` with root-level payload (`parent_id: null`) drops the
requirement that clients send `sort_order` for the root case; the
server places new cards per rule 3.5 (lowest page with `K < pageSize`,
else new page). If a client sends `sort_order` for a root card, the
server ignores it and logs a warning at debug level.

- Folder-internal creation (`parent_id != null`) keeps its existing
  behavior — the client can supply `sort_order`, or omit for
  end-of-folder.

#### 4.2.e DTO field additions

- `Card` (response DTO): gains `pub page: i64`. Non-root cards report
  `page: 0` (garbage; clients must gate reads on `parent_id`).
- `CardPayload` (create request): `page` **not** accepted (server
  places the card). Clients that send `page` get it ignored + a
  debug-level warning.
- `CardPatch` (update request): `page` **not** accepted (moves go
  through `/move`; a card that patches its `parent_id` from `null` to
  a folder id is a reparent, which the server handles by dropping its
  page value and appending inside the folder).

#### 4.2.f Client-side changes

- `web/src/lib/api/cards.ts`: add `moveCard(id, MoveCardPayload)`; keep
  `reorderCards(entries)` but restrict its callers to folder-internal
  drops.
- `web/src/lib/stores/navDataStore.ts`: page-count derivation switches
  from `ceil(items.length / pageSize)` to
  `new Set(rootItems.map(i => i.page)).size`. Given invariant 5.1.1
  this equals `max(rootItems.map(i => i.page)) + 1`.
- `web/src/routes/+page.svelte` — `handleDrop`:
  - Root moves → call `moveCard(sourceId, {targetPage, targetSortOrder, intent})`.
  - Folder-internal moves → keep the current
    `reorderCards(reorderEntries(...))` path.
  - Cross-zone moves (root → folder, folder → root):
    - Root → folder: existing `patchCard(id, {parentId})` + folder
      reorder if needed. Server-side, the reparent's `parent_id`
      transition automatically clears the moved card's page value.
    - Folder → root: `moveCard(id, ...)` with the target page/slot
      the drop hit. Server sees `parent_id IS NULL` post-move and
      applies root densify. (This may require adding `parentId` to
      `MoveCardPayload` — see §4.2.g.)
- `web/src/lib/util/dragGrid.ts` — no changes to gesture layer; the
  `DragDropInfo` payload the callback receives is already
  intent-flavored (`before | after | merge`), which maps cleanly to
  `MoveIntent`.
- Optimistic UI (Q3c = C3): `handleDrop` triggers the API call and
  **does not commit** the reordered state into `navDataStore` locally.
  DragGrid's own DOM-level ghost/settle animation covers the ~50-200ms
  round-trip. On response (either success or error), `navDataStore`
  refetches (or applies the returned `Vec<Card>` directly) and the
  card-cells rebind to their real positions. If the current DOM
  transition is running when the store update lands, the transition
  finishes to its ghost-target and then the store's re-render
  animates to the true final positions via existing FLIP/motion
  primitives.

#### 4.2.g Open sub-question — cross-zone MoveCardPayload

Folder → root moves need to communicate two facts: "clear parent_id"
and "insert at (page, sort_order)". Options:

- **G1**: Add `parent_id: Option<i64>` to `MoveCardPayload`. Server
  accepts folder → root as a special case; still errors on
  `parent_id = Some(folder_id)` (reparent into folder stays on PATCH).
- **G2**: Client does two calls: `patchCard(id, {parentId: null})`
  then `moveCard(id, ...)`. Slower (two round-trips) and creates a
  transient state where the card sits at the end of root.

**Recommendation**: G1. One transaction, one round-trip, matches
folder-dissolve pattern. Cost: `MoveCardPayload` grows one field.

### 4.3 Repo layer

`server/src/repo/nav.rs` gains:

- `async fn move_card(&self, id: i64, payload: MoveCardPayload) -> Result<Vec<Card>>`
  — implements 4.2.a; returns the fresh root bucket for the client to
  patch.
- `async fn normalize_root_pages(&self, tx: &mut Tx) -> Result<()>`
  — helper called by every mutation that touches root `(page, sort_order)`:
  `move_card`, `delete_card`, `auto_folder`, `create_card`
  (root only), `patch_card` (when `parent_id` transitions).

The helper's SQL is a self-contained mini-transaction that reads the
distinct sorted page list, computes the mapping, and issues the minimal
set of `UPDATE` statements. It is idempotent (running twice on an
already-dense layout is a no-op).

The trait's existing `reorder_cards(Vec<ReorderEntry>)` is retained
but its precondition tightens: rejects any entry with
`parent_id IS NULL`.

### 4.4 Migration risk mitigation

- The migration is destructive to `sort_order` values (they're reset to
  page-local). Users' existing external references to sort_order (there
  are none — sort_order is server-internal) are unaffected.
- `0002_add_page_column.sql` is one-way. There is no rollback path;
  the migration includes a `PRAGMA user_version` bump so the app
  refuses to boot against a schema older than expected.
- If the SQL-level `ROW_NUMBER() OVER` path proves fragile
  cross-version, the fallback is a Rust migration hook run in
  `server/src/services/migration.rs` alongside the SQL migration
  runner. Decide during implementation planning.
- **Pre-release data audit**: this project has not released; there is
  no user data at risk. The migration correctness bar is "the
  developer's local dev DB and the CI sample data both densify
  correctly", not "preserve arbitrary production layouts".

## 5. Contracts and invariants

### 5.1 Server invariants (post-transaction)

For all root cards (`parent_id IS NULL`) at rest:

1. **Contiguous pages**: `SELECT DISTINCT page ORDER BY page` yields
   `0, 1, 2, ..., N-1` with no gaps.
2. **Page-local sort_order**: within each page, `sort_order` values
   form a contiguous range starting at 0.
3. **No empty pages**: every page value in (1) has ≥1 card.
4. **No overflow enforcement**: a page may have any count ≥ 1. The
   server does not enforce `count ≤ pageSize`; that's a client concern.

Invariants 1–3 are checked by an integration test that fuzzes 100
random mutation sequences and asserts the invariants hold after each
transaction.

### 5.2 Client invariants

1. **Read-only wrt page numbering**: the client never mutates `page`
   locally; it always round-trips through the server.
2. **Optimistic previews are allowed to violate 5.1**: during a drag
   preview, the client may temporarily show a layout with a page
   holding `pageSize + 1` items or (rarely) a gap. The invariants
   re-establish on drop commit + nav refetch.
3. **PageDots count** = number of distinct `page` values in the current
   nav snapshot. Given 5.1.1, this is also `max(page) + 1`.

## 6. Verification checklist

### 6.1 Automated (Rust integration tests)

- Fresh DB → seed N cards → assert dense page layout.
- Drop card A from page 2 to page 5 (end) → assert page 5 has one more,
  page 2 has one less; if page 2 becomes empty, pages 3+ shift down.
- Delete only card on page 3 → assert page 3 gone, page 4→3, page 5→4.
- Dissolve folder (already tested in commit 94b2956) → assert lone
  child inherits slot AND surrounding pages remain dense.
- Fuzz test: 100 random sequences of {create, delete, move, dissolve};
  after each, assert invariants 5.1.1, 5.1.2, 5.1.3.

### 6.2 Automated (Vitest)

- `PageDots` renders exactly `N` dots for `N` distinct page values.
- `pager.setPageCount(N)` called with the correct N on nav refresh.
- Client sort/group logic produces `pageSize+1` in-DOM cards for a
  server response that reports an overflowed page (regression guard
  for the "grid silently drops the 21st card" failure mode).

### 6.3 Manual (dev server)

- Create 21 cards → see 1 page with 20 items and page 2 with 1 item.
- Drag the lone card off page 2 back to page 1 → page 2 disappears,
  PageDots shows 1 dot, page 1 tolerates the 21st cell (visible if it
  spills beyond the grid — that's the intended "tolerant overflow"
  behavior).
- Create a 22nd card → server places it on the lowest-page-with-space;
  since page 1 has 21 (over pageSize), and page 2 doesn't exist, the
  new card creates page 2. (Note: this is a subtle case for 3.5 — the
  "lowest page with `K < pageSize`" rule means an overflowed page 1 is
  considered "full" for placement purposes, so page 2 is created.)
- Fill page 1 back to 20, dissolve a folder on page 3 whose surviving
  child inherits the folder's slot → page 3 layout unchanged, pages
  stay dense.

### 6.4 Static (spec-implementation-auditor)

Auditor checks the implementation diff against each acceptance point
in this section, keyed on `file:line` evidence.

## 7. Open questions

- **Q1** — DECIDED: explicit `page` column on `cards`.
- **Q2 / Q2b** — DECIDED: Option A (tolerant overflow, no cascading
  shift on drop) + Q2b=yes (auto-densify empty middle pages on drop
  commit).
- **Q3** — DECIDED: thin-client semantic move API. Root moves go
  through `POST /api/cards/{id}/move` with a `{target_page,
  target_sort_order, intent}` payload; server computes the final
  slot, densifies, and returns the fresh root bucket.
- **Q3b** — DECIDED: split API surface. Folder-internal moves keep
  the existing `POST /api/cards/reorder` flat-entries API (now
  restricted to `parent_id != NULL` entries only). Root moves go
  through the new semantic endpoint.
- **Q3c** — DECIDED: **C3 (DOM-only optimistic)**. `handleDrop` fires
  the API call without committing local store state; dragGrid's DOM
  transition covers the round-trip, and the returned `Vec<Card>` (or
  a refetch) updates the store which re-renders through existing
  FLIP/motion primitives.
- **Q3g** — DECIDED: G1. `MoveCardPayload` carries an optional
  `parent_id` field so folder → root moves are one transaction.
  `parent_id = Some(folder_id)` (reparent into folder) still routes
  through `PATCH /api/cards/{id}` — the `/move` endpoint accepts only
  `null` or "unchanged".
- **Q4** — DECIDED (α): same-page reorder goes through
  `POST /api/cards/{id}/move` too. One code path for all root moves;
  same-page densify is a no-op so no perf concern.
- **Q4b** — DECIDED (A): keyboard reorder is out-of-scope (see §2
  non-goals). Jiggle-mode drag is sufficient.
- **Q4c** — DECIDED (A): drop failure = toast + refetch (see §3.7).
  No bespoke ghost-reverse animation in dragGrid.
- **Q4d** — DECIDED (B): no dev-only densify-repair admin endpoint.
  Fuzz tests in §6.1 are the enforcement mechanism.
- **Q5** — DECIDED (A): `pageSize` change (viewport resize) does not
  fire any API. Overflow renders past the grid; the DB is untouched.
  See §3.7.
- **Q5b** — DECIDED (A): overflowed cells remain fully interactive,
  including edge-pan. Primary manual affordance for densifying an
  overflow. See §3.8.
- **Q5c** — DECIDED (A): no multi-client push channel. Stale tabs
  refresh on their own cadence. See §3.9.
- **Q6+** — TBD. Deferred to plan / implementation. Non-blocking:
  i18n key additions for any new toast messages, telemetry events,
  exact SQLite version compatibility fallback path for
  `ROW_NUMBER() OVER` in the backfill (§4.4).

Spec is unblocked for `writing-plans`.

## 8. Files touched (scope discipline — to be finalized when Q3+ close)

Placeholder — the plan produced from this spec will enumerate the exact
file list. Anticipated coverage:

- `server/migrations/0002_add_page_column.sql` (new)
- `server/src/dto.rs`
- `server/src/repo/nav.rs`
- `server/src/repo/sqlx_impl.rs`
- `server/src/services/migration.rs` (if Rust-side backfill path)
- `server/src/routes/` (reorder / drop handlers)
- `web/src/lib/api/nav.ts`
- `web/src/lib/stores/navDataStore.ts`
- `web/src/routes/+page.svelte` (page-count derivation, ItemEditDialog
  onCreated target)
- `web/src/lib/components/Nav/PageDots.svelte` (unchanged if it already
  reads a prop-driven count)
- `web/src/lib/util/dragGrid.ts` (drop payload construction)

Explicitly untouched:
- Pager physics (`pagerPhysics.ts`, `pagerStore.ts`).
- Folder-internal ordering.
- Site switch, session management, auth.
