//! Plan 6 host-language migration: copy `groups` + `items` + `item_links`
//! into the new polymorphic `cards` + `card_links` tables, then drop the
//! legacy tables. Idempotent: a no-op once the legacy tables are gone.
//!
//! Runs once on boot, after `migrate(pool)` has finished. The whole copy
//! lives inside a single transaction, so a failure rolls back and leaves
//! the legacy tables intact for an operator to investigate. The
//! application refuses to start if this returns an error.

use crate::error::{AppError, Result};
use sqlx::{Row, SqlitePool};
use std::collections::{BTreeMap, HashMap};

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub async fn migrate_if_needed(pool: &SqlitePool) -> Result<()> {
    let legacy_present: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='groups'")
            .fetch_one(pool)
            .await?;
    if legacy_present == 0 {
        return Ok(());
    }

    tracing::info!("legacy_migrate: copying groups/items into cards");
    let now = now_ms();
    let mut tx = pool.begin().await?;

    // ----- 1. groups -> cards (kind='folder', root) -----
    let group_rows = sqlx::query("SELECT id, slug, name, sort_order FROM groups ORDER BY sort_order, id")
        .fetch_all(&mut *tx)
        .await?;

    let mut group_id_map: HashMap<i64, i64> = HashMap::new();
    for (idx, row) in group_rows.iter().enumerate() {
        let old_id: i64 = row.try_get("id")?;
        let slug: String = row.try_get("slug")?;
        let name: String = row.try_get("name")?;
        let sort_order = idx as i64;
        let res = sqlx::query(
            "INSERT INTO cards (kind, parent_id, sort_order, name, slug, created_at, updated_at) \
             VALUES ('folder', NULL, ?, ?, ?, ?, ?)",
        )
        .bind(sort_order)
        .bind(name)
        .bind(slug)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        group_id_map.insert(old_id, res.last_insert_rowid());
    }
    let folder_count = group_id_map.len() as i64;

    // ----- 2. items -> cards (kind='item') -----
    let item_rows = sqlx::query(
        "SELECT id, group_id, name, description, icon_kind, icon_value, sort_order, created_at, updated_at \
         FROM items ORDER BY group_id, sort_order, id",
    )
    .fetch_all(&mut *tx)
    .await?;

    // Bucket items by their NEW parent_id (None = root) so we can renumber
    // contiguously starting at the next free slot in each bucket.
    type LegacyItem = (i64, Option<i64>, String, Option<String>, String, String, i64, i64);
    let mut buckets: BTreeMap<Option<i64>, Vec<usize>> = BTreeMap::new();
    let mut item_records: Vec<LegacyItem> = Vec::with_capacity(item_rows.len());
    for (idx, row) in item_rows.iter().enumerate() {
        let old_id: i64 = row.try_get("id")?;
        let old_group: Option<i64> = row.try_get("group_id")?;
        let new_parent = old_group.and_then(|g| group_id_map.get(&g).copied());
        let name: String = row.try_get("name")?;
        let description: Option<String> = row.try_get("description")?;
        let icon_kind: String = row.try_get("icon_kind")?;
        let icon_value: String = row.try_get("icon_value")?;
        let created_at: i64 = row.try_get("created_at")?;
        let updated_at: i64 = row.try_get("updated_at")?;
        item_records.push((
            old_id,
            new_parent,
            name,
            description,
            icon_kind,
            icon_value,
            created_at,
            updated_at,
        ));
        buckets.entry(new_parent).or_default().push(idx);
    }

    let mut item_id_map: HashMap<i64, i64> = HashMap::new();
    for (parent, indices) in buckets {
        // Root bucket already holds folders at slots 0..folder_count;
        // start root items after them. Folder buckets start at 0.
        let base_offset = if parent.is_none() { folder_count } else { 0 };
        for (offset, idx) in indices.iter().enumerate() {
            let (old_id, new_parent, name, description, icon_kind, icon_value, created_at, updated_at) =
                &item_records[*idx];
            let sort_order = base_offset + offset as i64;
            let res = sqlx::query(
                "INSERT INTO cards (kind, parent_id, sort_order, name, icon_kind, icon_value, description, created_at, updated_at) \
                 VALUES ('item', ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(*new_parent)
            .bind(sort_order)
            .bind(name)
            .bind(icon_kind)
            .bind(icon_value)
            .bind(description.as_deref())
            .bind(*created_at)
            .bind(*updated_at)
            .execute(&mut *tx)
            .await?;
            item_id_map.insert(*old_id, res.last_insert_rowid());
        }
    }

    // ----- 3. item_links -> card_links -----
    let link_rows = sqlx::query("SELECT item_id, site_id, url FROM item_links")
        .fetch_all(&mut *tx)
        .await?;
    for row in link_rows {
        let item_id: i64 = row.try_get("item_id")?;
        let site_id: i64 = row.try_get("site_id")?;
        let url: String = row.try_get("url")?;
        let card_id = item_id_map.get(&item_id).copied().ok_or_else(|| {
            AppError::Other(anyhow::anyhow!("orphan item_link for item {item_id}"))
        })?;
        sqlx::query("INSERT INTO card_links (card_id, site_id, url) VALUES (?, ?, ?)")
            .bind(card_id)
            .bind(site_id)
            .bind(url)
            .execute(&mut *tx)
            .await?;
    }

    // ----- 4. drop legacy tables -----
    sqlx::query("DROP TABLE item_links").execute(&mut *tx).await?;
    sqlx::query("DROP TABLE items").execute(&mut *tx).await?;
    sqlx::query("DROP TABLE groups").execute(&mut *tx).await?;

    tx.commit().await?;
    tracing::info!(
        "legacy_migrate: complete ({} folder(s), {} item(s))",
        folder_count,
        item_id_map.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Bring up a fully-migrated in-memory pool. After all SQL migrations
    /// run, the legacy tables (`groups` / `items` / `item_links`) are
    /// still present — only `legacy_migrate::migrate_if_needed` drops
    /// them. So this matches the exact runtime state on first boot of a
    /// pre-Plan-6 deployment.
    async fn legacy_pool() -> SqlitePool {
        crate::db::connect_in_memory().await.unwrap()
    }

    #[tokio::test]
    async fn migrate_copies_groups_items_and_drops_legacy() {
        let pool = legacy_pool().await;
        // Seed legacy data
        sqlx::query("INSERT INTO sites (value, name, sort_order, is_default) VALUES ('a', 'A', 0, 1)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO groups (slug, name, sort_order, collapsed_default) VALUES ('tools', 'Tools', 0, 0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO groups (slug, name, sort_order, collapsed_default) VALUES ('media', 'Media', 1, 0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (group_id, name, icon_kind, icon_value, sort_order, created_at, updated_at) VALUES (1, 'X', 'asset', 'x.png', 0, 0, 0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (group_id, name, icon_kind, icon_value, sort_order, created_at, updated_at) VALUES (1, 'Y', 'asset', 'y.png', 1, 0, 0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO item_links (item_id, site_id, url) VALUES (1, 1, 'http://x')")
            .execute(&pool).await.unwrap();

        migrate_if_needed(&pool).await.unwrap();

        // Cards: 2 folders + 2 items
        let card_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cards")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(card_count, 4);
        let folder_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cards WHERE kind='folder'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(folder_count, 2);
        // Items live under the first folder
        let parent: Option<i64> = sqlx::query_scalar("SELECT parent_id FROM cards WHERE name='X'")
            .fetch_one(&pool).await.unwrap();
        assert!(parent.is_some());

        // Card link migrated
        let link_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM card_links")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(link_count, 1);

        // Legacy tables dropped
        let groups_left: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='groups'",
        )
        .fetch_one(&pool).await.unwrap();
        assert_eq!(groups_left, 0);
    }

    #[tokio::test]
    async fn migrate_is_idempotent_when_legacy_already_gone() {
        let pool = legacy_pool().await;
        migrate_if_needed(&pool).await.unwrap();
        // Second call: must be a no-op
        migrate_if_needed(&pool).await.unwrap();
        let card_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cards")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(card_count, 0);
    }
}
