//! `NavRepo` implementation backed by a SQLite pool.
//!
//! Plan 6 / Launchpad: groups + items collapsed into a single polymorphic
//! `cards` table. We use untyped sqlx queries throughout to avoid
//! coupling the offline `.sqlx/` cache to specific column shapes — the
//! schema has churned three times since this file was first written,
//! and every churn forced a `cargo sqlx prepare`. Untyped queries cost
//! us a bit of compile-time safety but stay stable across migrations.

use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::nav::NavRepo;
use async_trait::async_trait;
use sqlx::{Row, SqliteExecutor, SqlitePool};
use std::collections::{BTreeMap, BTreeSet};

pub struct SqlxNavRepo {
    pool: SqlitePool,
}

impl SqlxNavRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn icon_kind_str(k: IconKind) -> &'static str {
    match k {
        IconKind::Asset => "asset",
        IconKind::Url => "url",
        IconKind::AutoFavicon => "auto-favicon",
    }
}

fn parse_icon_kind(s: &str) -> IconKind {
    match s {
        "url" => IconKind::Url,
        "auto-favicon" => IconKind::AutoFavicon,
        _ => IconKind::Asset,
    }
}

fn map_unique_violation(err: sqlx::Error) -> AppError {
    if let Some(db_err) = err.as_database_error() {
        let msg = db_err.message();
        if msg.contains("UNIQUE constraint failed") {
            return AppError::Conflict(msg.to_string());
        }
    }
    AppError::Sqlx(err)
}

#[async_trait]
impl NavRepo for SqlxNavRepo {
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Card>)> {
        let sites = self.list_sites().await?;
        let cards = self.list_cards().await?;
        Ok((sites, cards))
    }

    // ---- Sites ----

    async fn list_sites(&self) -> Result<Vec<Site>> {
        list_sites_inner(&self.pool).await
    }

    async fn create_site(&self, p: SitePayload) -> Result<Site> {
        let res = sqlx::query("INSERT INTO sites (value, name, is_default) VALUES (?, ?, ?)")
            .bind(&p.value)
            .bind(&p.name)
            .bind(p.is_default)
            .execute(&self.pool)
            .await
            .map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        self.list_sites()
            .await?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn patch_site(&self, id: i64, p: SitePatch) -> Result<Site> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.value {
            sqlx::query("UPDATE sites SET value=? WHERE id=?")
                .bind(v)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?;
        }
        if let Some(v) = p.name {
            sqlx::query("UPDATE sites SET name=? WHERE id=?")
                .bind(v)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.is_default {
            sqlx::query("UPDATE sites SET is_default=? WHERE id=?")
                .bind(v)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        self.list_sites()
            .await?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn delete_site(&self, id: i64) -> Result<()> {
        let referenced: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_links WHERE site_id=?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        if referenced > 0 {
            return Err(AppError::Conflict(format!(
                "site is referenced by {referenced} card link(s); remove them first"
            )));
        }
        let res = sqlx::query("DELETE FROM sites WHERE id=?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    async fn reorder_sites(&self, entries: Vec<SiteReorderEntry>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for e in entries {
            sqlx::query("UPDATE sites SET sort_order=? WHERE id=?")
                .bind(e.sort_order)
                .bind(e.id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    // ---- Cards ----

    async fn list_cards(&self) -> Result<Vec<Card>> {
        list_cards_inner(&self.pool).await
    }

    async fn create_card(&self, p: CardPayload) -> Result<Card> {
        validate_payload(&p)?;
        let now = now_ms();
        let mut tx = self.pool.begin().await?;

        // Resolve parent_id semantics: folder must always be root.
        let parent_id: Option<i64> = match p.kind {
            CardKind::Folder => None,
            CardKind::Item => p.parent_id,
        };
        // Reject parent that is itself an item.
        if let Some(pid) = parent_id {
            ensure_parent_is_folder(&mut *tx, pid).await?;
        }
        // Append at end of bucket.
        let next_slot = next_sort_order(&mut *tx, parent_id).await?;

        let res = match p.kind {
            CardKind::Folder => {
                sqlx::query(
                    "INSERT INTO cards (kind, parent_id, sort_order, name, slug, created_at, updated_at) \
                     VALUES ('folder', NULL, ?, ?, ?, ?, ?)",
                )
                .bind(next_slot)
                .bind(&p.name)
                .bind(p.slug.as_deref())
                .bind(now)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?
            }
            CardKind::Item => {
                let kind_str = icon_kind_str(p.icon_kind.expect("validated"));
                sqlx::query(
                    "INSERT INTO cards (kind, parent_id, sort_order, name, icon_kind, icon_value, description, created_at, updated_at) \
                     VALUES ('item', ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(parent_id)
                .bind(next_slot)
                .bind(&p.name)
                .bind(kind_str)
                .bind(p.icon_value.as_deref())
                .bind(p.description.as_deref())
                .bind(now)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?
            }
        };
        let id = res.last_insert_rowid();
        if matches!(p.kind, CardKind::Item) {
            insert_links(&mut tx, id, &p.links).await?;
        }
        tx.commit().await?;
        fetch_card(&self.pool, id).await
    }

    async fn patch_card(&self, id: i64, p: CardPatch) -> Result<Card> {
        let now = now_ms();
        let mut tx = self.pool.begin().await?;

        // Fetch current row — we need both `kind` (to validate field
        // applicability) and `parent_id` (so we can dissolve the old
        // folder later if it ends up with ≤1 children).
        let row: (String, Option<i64>) =
            sqlx::query_as("SELECT kind, parent_id FROM cards WHERE id=?")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(AppError::NotFound)?;
        let kind_str = row.0;
        let old_parent = row.1;

        if let Some(v) = p.name {
            sqlx::query("UPDATE cards SET name=?, updated_at=? WHERE id=?")
                .bind(v)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.slug {
            if kind_str != "folder" {
                return Err(AppError::Validation("slug only valid on folders".into()));
            }
            sqlx::query("UPDATE cards SET slug=?, updated_at=? WHERE id=?")
                .bind(v)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.parent_id {
            if kind_str == "folder" && v.is_some() {
                return Err(AppError::Validation("folders cannot be nested".into()));
            }
            if let Some(target) = v {
                ensure_parent_is_folder(&mut *tx, target).await?;
            }
            // Append to the new bucket's tail.
            let new_slot = next_sort_order(&mut *tx, v).await?;
            sqlx::query("UPDATE cards SET parent_id=?, sort_order=?, updated_at=? WHERE id=?")
                .bind(v)
                .bind(new_slot)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.icon_kind {
            if kind_str != "item" {
                return Err(AppError::Validation("icon_kind only valid on items".into()));
            }
            sqlx::query("UPDATE cards SET icon_kind=?, updated_at=? WHERE id=?")
                .bind(icon_kind_str(v))
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.icon_value {
            if kind_str != "item" {
                return Err(AppError::Validation(
                    "icon_value only valid on items".into(),
                ));
            }
            sqlx::query("UPDATE cards SET icon_value=?, updated_at=? WHERE id=?")
                .bind(v)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.description {
            sqlx::query("UPDATE cards SET description=?, updated_at=? WHERE id=?")
                .bind(v)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(links) = p.links {
            if kind_str != "item" {
                return Err(AppError::Validation("links only valid on items".into()));
            }
            sqlx::query("DELETE FROM card_links WHERE card_id=?")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            insert_links(&mut tx, id, &links).await?;
        }

        // If the patch moved the card out of a folder, the old folder
        // might be down to 0 or 1 children — dissolve it.
        let mut to_dissolve: Vec<i64> = Vec::new();
        if let Some(opt) = p.parent_id {
            if opt != old_parent {
                if let Some(fid) = old_parent {
                    to_dissolve.push(fid);
                }
            }
        }
        dissolve_singleton_folders(&mut tx, to_dissolve).await?;

        tx.commit().await?;
        fetch_card(&self.pool, id).await
    }

    async fn delete_card(&self, id: i64) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let row: Option<(String, Option<i64>)> =
            sqlx::query_as("SELECT kind, parent_id FROM cards WHERE id=?")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let (kind, old_parent) = row.ok_or(AppError::NotFound)?;
        if kind == "folder" {
            // Release children: parent_id = NULL, appended at end of root bucket.
            let mut next_root: i64 = sqlx::query_scalar(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards WHERE parent_id IS NULL",
            )
            .fetch_one(&mut *tx)
            .await?;
            let child_ids: Vec<i64> = sqlx::query_scalar(
                "SELECT id FROM cards WHERE parent_id=? ORDER BY sort_order, id",
            )
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;
            // Move children OUT of the folder before we delete it. To
            // sidestep the (parent_id, sort_order) uniqueness during the
            // window where two cards share a slot, we move each child
            // through a temporary holding sort value (negative ids) then
            // settle them into their final root slot.
            for (offset, cid) in child_ids.iter().enumerate() {
                let staging = -1_i64 - offset as i64;
                sqlx::query("UPDATE cards SET parent_id=NULL, sort_order=? WHERE id=?")
                    .bind(staging)
                    .bind(cid)
                    .execute(&mut *tx)
                    .await?;
            }
            for cid in &child_ids {
                sqlx::query("UPDATE cards SET sort_order=? WHERE id=?")
                    .bind(next_root)
                    .bind(cid)
                    .execute(&mut *tx)
                    .await?;
                next_root += 1;
            }
        }
        sqlx::query("DELETE FROM cards WHERE id=?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // If we just removed an item from inside a folder, the folder
        // may now be down to ≤1 children — dissolve it.
        if kind == "item" {
            if let Some(fid) = old_parent {
                dissolve_singleton_folders(&mut tx, std::iter::once(fid)).await?;
            }
        }

        tx.commit().await?;
        Ok(())
    }

    async fn reorder_cards(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let entries_dbg: Vec<String> = entries
            .iter()
            .map(|e| {
                format!(
                    "(id={}, parent={:?}, sort={})",
                    e.id, e.parent_id, e.sort_order
                )
            })
            .collect();
        tracing::info!(entries = ?entries_dbg, "reorder_cards: incoming");

        // Group by parent_id.
        let mut buckets: BTreeMap<Option<i64>, Vec<&ReorderEntry>> = BTreeMap::new();
        for e in &entries {
            buckets.entry(e.parent_id).or_default().push(e);
        }
        // Validate each bucket forms a contiguous 0..N permutation.
        for (parent, bucket) in &buckets {
            let mut orders: Vec<i64> = bucket.iter().map(|e| e.sort_order).collect();
            orders.sort();
            for (i, o) in orders.iter().enumerate() {
                if *o != i as i64 {
                    return Err(AppError::Validation(format!(
                        "reorder bucket {parent:?} is not a contiguous 0..N permutation"
                    )));
                }
            }
        }

        let now = now_ms();
        let mut tx = self.pool.begin().await?;

        // Capture each entry's pre-update parent_id so we can dissolve
        // any folder that loses its last (or second-to-last) child as a
        // result of this reorder/reparent.
        let mut maybe_dissolve: BTreeSet<i64> = BTreeSet::new();
        for e in &entries {
            let old_parent: Option<i64> =
                sqlx::query_scalar("SELECT parent_id FROM cards WHERE id=?")
                    .bind(e.id)
                    .fetch_optional(&mut *tx)
                    .await?
                    .flatten();
            if old_parent != e.parent_id {
                if let Some(fid) = old_parent {
                    maybe_dissolve.insert(fid);
                }
            }
        }

        // The previous in-place "stage to negative slots, then reapply"
        // trick was racy: when the client's `entries` only covered the
        // visible subset of a bucket, *unlisted* rows still occupied
        // some of the target slots, and the apply step blew up with
        // UNIQUE constraint failures. Instead we now:
        //   1. Move every listed card into the target parent bucket at
        //      a unique negative slot (so we never collide with any
        //      sibling that we don't know about).
        //   2. Compact every affected bucket: read all rows in that
        //      bucket from the DB, sort them with the listed entries
        //      taking the requested order and remaining rows stable
        //      after them, then rewrite contiguous 0..N sort_orders.
        // This is idempotent and never raises UNIQUE.
        let target_parents: BTreeSet<Option<i64>> = entries.iter().map(|e| e.parent_id).collect();

        // Step 1: stage every entry to a unique negative slot under its
        // TARGET parent. We use very-negative slots (offset by 1<<20) so
        // they can't collide with any pre-existing data.
        for (idx, e) in entries.iter().enumerate() {
            let staging = -(1_i64 << 20) - idx as i64;
            sqlx::query("UPDATE cards SET parent_id=?, sort_order=?, updated_at=? WHERE id=?")
                .bind(e.parent_id)
                .bind(staging)
                .bind(now)
                .bind(e.id)
                .execute(&mut *tx)
                .await?;
        }

        // Step 2: for each affected bucket, compact 0..N. Build the
        // final order: requested entries first (in their requested
        // sort_order), then any pre-existing siblings we didn't know
        // about, in their existing sort_order. Then renumber 0..N.
        for parent in &target_parents {
            // Listed entries for this bucket, sorted by requested order.
            let mut listed: Vec<&ReorderEntry> =
                entries.iter().filter(|e| e.parent_id == *parent).collect();
            listed.sort_by_key(|e| e.sort_order);

            // Other rows in the same bucket that aren't in `listed`.
            let listed_ids: BTreeSet<i64> = listed.iter().map(|e| e.id).collect();
            let other_ids: Vec<i64> = match parent {
                Some(p) => {
                    sqlx::query_scalar(
                        "SELECT id FROM cards WHERE parent_id=? ORDER BY sort_order, id",
                    )
                    .bind(*p)
                    .fetch_all(&mut *tx)
                    .await?
                }
                None => {
                    sqlx::query_scalar(
                        "SELECT id FROM cards WHERE parent_id IS NULL ORDER BY sort_order, id",
                    )
                    .fetch_all(&mut *tx)
                    .await?
                }
            };
            let others: Vec<i64> = other_ids
                .into_iter()
                .filter(|id| !listed_ids.contains(id))
                .collect();

            // Final order: listed (in requested order) followed by others.
            // Stage every row to a fresh negative slot first, then write
            // the contiguous 0..N values, so we never collide.
            let final_order: Vec<i64> = listed
                .iter()
                .map(|e| e.id)
                .chain(others.into_iter())
                .collect();

            for (idx, id) in final_order.iter().enumerate() {
                let staging = -1_i64 - idx as i64;
                sqlx::query("UPDATE cards SET sort_order=? WHERE id=?")
                    .bind(staging)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            for (idx, id) in final_order.iter().enumerate() {
                sqlx::query("UPDATE cards SET sort_order=?, updated_at=? WHERE id=?")
                    .bind(idx as i64)
                    .bind(now)
                    .bind(id)
                    .execute(&mut *tx)
                    .await
                    .map_err(map_unique_violation)?;
            }
        }

        dissolve_singleton_folders(&mut tx, maybe_dissolve).await?;

        tx.commit().await?;
        Ok(())
    }

    async fn auto_folder(&self, p: AutoFolderPayload) -> Result<Card> {
        if p.source_item_id == p.target_item_id {
            return Err(AppError::Validation("source and target must differ".into()));
        }
        let now = now_ms();
        let mut tx = self.pool.begin().await?;

        // Both must be items at root.
        let target_row: Option<(String, Option<i64>, i64)> =
            sqlx::query_as("SELECT kind, parent_id, sort_order FROM cards WHERE id=?")
                .bind(p.target_item_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (target_kind, target_parent, target_sort) = target_row.ok_or(AppError::NotFound)?;
        if target_kind != "item" {
            return Err(AppError::Validation("target must be an item".into()));
        }
        let source_row: Option<(String, Option<i64>)> =
            sqlx::query_as("SELECT kind, parent_id FROM cards WHERE id=?")
                .bind(p.source_item_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (source_kind, source_parent) = source_row.ok_or(AppError::NotFound)?;
        if source_kind != "item" {
            return Err(AppError::Validation("source must be an item".into()));
        }
        // Folders must be at root, so the target item's bucket must be root.
        if target_parent.is_some() {
            return Err(AppError::Validation(
                "auto-folder target must be a root card (folders cannot nest)".into(),
            ));
        }

        // Stage target away to free its slot.
        sqlx::query("UPDATE cards SET sort_order=-100000 WHERE id=?")
            .bind(p.target_item_id)
            .execute(&mut *tx)
            .await?;

        // Create the folder at the target's old slot.
        let slug = match p.slug {
            Some(s) => s,
            None => format!("folder-{now}"),
        };
        let folder_res = sqlx::query(
            "INSERT INTO cards (kind, parent_id, sort_order, name, slug, created_at, updated_at) \
             VALUES ('folder', NULL, ?, ?, ?, ?, ?)",
        )
        .bind(target_sort)
        .bind(&p.name)
        .bind(&slug)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(map_unique_violation)?;
        let folder_id = folder_res.last_insert_rowid();

        // Move source + target into the folder at slots 0 and 1.
        sqlx::query("UPDATE cards SET parent_id=?, sort_order=?, updated_at=? WHERE id=?")
            .bind(folder_id)
            .bind(0_i64)
            .bind(now)
            .bind(p.source_item_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE cards SET parent_id=?, sort_order=?, updated_at=? WHERE id=?")
            .bind(folder_id)
            .bind(1_i64)
            .bind(now)
            .bind(p.target_item_id)
            .execute(&mut *tx)
            .await?;

        // The source's old parent (if it was inside another folder)
        // might now be down to ≤1 children — dissolve it.
        if let Some(fid) = source_parent {
            dissolve_singleton_folders(&mut tx, std::iter::once(fid)).await?;
        }

        tx.commit().await?;
        fetch_card(&self.pool, folder_id).await
    }
}

// --------------- helpers ---------------

/// macOS-Launchpad style auto-dissolve: a folder that's been emptied
/// down to ≤1 children automatically goes away. The lone child (if any)
/// is moved to the root grid, appended at the end. Idempotent — safe to
/// call with ids that no longer exist or aren't actually folders.
async fn dissolve_singleton_folders(
    conn: &mut sqlx::SqliteConnection,
    candidates: impl IntoIterator<Item = i64>,
) -> Result<()> {
    let now = now_ms();
    let mut seen = std::collections::BTreeSet::new();
    for fid in candidates {
        if !seen.insert(fid) {
            continue;
        }
        let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM cards WHERE id=?")
            .bind(fid)
            .fetch_optional(&mut *conn)
            .await?;
        if kind.as_deref() != Some("folder") {
            continue;
        }
        let child_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cards WHERE parent_id=?")
            .bind(fid)
            .fetch_one(&mut *conn)
            .await?;
        if child_count > 1 {
            continue;
        }
        if child_count == 1 {
            // Move the lone child to the end of the root bucket. Stage
            // through a far-negative slot so we never collide.
            let child_id: i64 =
                sqlx::query_scalar("SELECT id FROM cards WHERE parent_id=? LIMIT 1")
                    .bind(fid)
                    .fetch_one(&mut *conn)
                    .await?;
            let next_root: i64 = sqlx::query_scalar(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards WHERE parent_id IS NULL",
            )
            .fetch_one(&mut *conn)
            .await?;
            sqlx::query("UPDATE cards SET parent_id=NULL, sort_order=?, updated_at=? WHERE id=?")
                .bind(-(1_i64 << 30))
                .bind(now)
                .bind(child_id)
                .execute(&mut *conn)
                .await?;
            sqlx::query("UPDATE cards SET sort_order=?, updated_at=? WHERE id=?")
                .bind(next_root)
                .bind(now)
                .bind(child_id)
                .execute(&mut *conn)
                .await?;
        }
        sqlx::query("DELETE FROM cards WHERE id=?")
            .bind(fid)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

async fn ensure_parent_is_folder<'e, E>(executor: E, parent_id: i64) -> Result<()>
where
    E: SqliteExecutor<'e>,
{
    let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM cards WHERE id=?")
        .bind(parent_id)
        .fetch_optional(executor)
        .await?;
    match kind.as_deref() {
        Some("folder") => Ok(()),
        Some(_) => Err(AppError::Validation("parent must be a folder card".into())),
        None => Err(AppError::Validation("parent card does not exist".into())),
    }
}

async fn next_sort_order<'e, E>(executor: E, parent_id: Option<i64>) -> Result<i64>
where
    E: SqliteExecutor<'e>,
{
    let next: i64 = match parent_id {
        Some(p) => {
            sqlx::query_scalar(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards WHERE parent_id=?",
            )
            .bind(p)
            .fetch_one(executor)
            .await?
        }
        None => {
            sqlx::query_scalar(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards WHERE parent_id IS NULL",
            )
            .fetch_one(executor)
            .await?
        }
    };
    Ok(next)
}

async fn insert_links(
    conn: &mut sqlx::SqliteConnection,
    card_id: i64,
    links: &std::collections::BTreeMap<String, String>,
) -> Result<()> {
    for (site_value, url) in links {
        sqlx::query(
            "INSERT INTO card_links (card_id, site_id, url) \
             SELECT ?, sites.id, ? FROM sites WHERE sites.value = ?",
        )
        .bind(card_id)
        .bind(url)
        .bind(site_value)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

fn validate_payload(p: &CardPayload) -> Result<()> {
    match p.kind {
        CardKind::Folder => {
            if p.slug.is_none() {
                return Err(AppError::Validation("folder requires slug".into()));
            }
            if p.icon_kind.is_some() || p.icon_value.is_some() {
                return Err(AppError::Validation(
                    "folder must not have icon_kind / icon_value".into(),
                ));
            }
            if !p.links.is_empty() {
                return Err(AppError::Validation("folder must not have links".into()));
            }
            if p.parent_id.is_some() {
                return Err(AppError::Validation("folders cannot be nested".into()));
            }
        }
        CardKind::Item => {
            if p.icon_kind.is_none() || p.icon_value.is_none() {
                return Err(AppError::Validation(
                    "item requires icon_kind and icon_value".into(),
                ));
            }
            if p.slug.is_some() {
                return Err(AppError::Validation("item must not have slug".into()));
            }
        }
    }
    Ok(())
}

async fn list_sites_inner(pool: &SqlitePool) -> Result<Vec<Site>> {
    let rows = sqlx::query(
        "SELECT id, value, name, sort_order, is_default FROM sites ORDER BY sort_order, id",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Site {
            id: r.get::<i64, _>("id"),
            value: r.get::<String, _>("value"),
            name: r.get::<String, _>("name"),
            sort_order: r.get::<i64, _>("sort_order"),
            is_default: r.get::<i64, _>("is_default") != 0,
        })
        .collect())
}

async fn list_cards_inner(pool: &SqlitePool) -> Result<Vec<Card>> {
    let card_rows = sqlx::query(
        "SELECT id, kind, parent_id, sort_order, name, slug, icon_kind, icon_value, description, created_at, updated_at \
         FROM cards ORDER BY parent_id NULLS FIRST, sort_order, id",
    )
    .fetch_all(pool)
    .await?;

    let mut cards: Vec<Card> = card_rows
        .into_iter()
        .map(|r| {
            let kind_s: String = r.get("kind");
            let kind = match kind_s.as_str() {
                "folder" => CardKind::Folder,
                _ => CardKind::Item,
            };
            let icon_kind_s: Option<String> = r.get("icon_kind");
            Card {
                id: r.get::<i64, _>("id"),
                kind,
                parent_id: r.get::<Option<i64>, _>("parent_id"),
                sort_order: r.get::<i64, _>("sort_order"),
                name: r.get::<String, _>("name"),
                slug: r.get::<Option<String>, _>("slug"),
                icon_kind: icon_kind_s.as_deref().map(parse_icon_kind),
                icon_value: r.get::<Option<String>, _>("icon_value"),
                description: r.get::<Option<String>, _>("description"),
                links: BTreeMap::new(),
                created_at: r.get::<i64, _>("created_at"),
                updated_at: r.get::<i64, _>("updated_at"),
            }
        })
        .collect();

    let link_rows = sqlx::query(
        "SELECT cl.card_id, s.value, cl.url \
         FROM card_links cl JOIN sites s ON s.id = cl.site_id",
    )
    .fetch_all(pool)
    .await?;

    let mut by_id: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for (idx, c) in cards.iter().enumerate() {
        by_id.insert(c.id, idx);
    }
    for r in link_rows {
        let cid: i64 = r.get("card_id");
        let value: String = r.get("value");
        let url: String = r.get("url");
        if let Some(&idx) = by_id.get(&cid) {
            cards[idx].links.insert(value, url);
        }
    }
    Ok(cards)
}

async fn fetch_card(pool: &SqlitePool, id: i64) -> Result<Card> {
    list_cards_inner(pool)
        .await?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or(AppError::NotFound)
}
