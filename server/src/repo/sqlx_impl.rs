//! `NavRepo` implementation backed by a SQLite pool.
//!
//! Sites/Groups/Tags are fully implemented here. Item methods are stubbed
//! and filled in by Task 14.

use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::nav::NavRepo;
use async_trait::async_trait;
use sqlx::SqlitePool;

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
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Group>, Vec<Item>, Vec<Tag>)> {
        let sites = self.list_sites().await?;
        let groups = self.list_groups().await?;
        let tags = self.list_tags().await?;
        let items = self.list_items_full().await?;
        Ok((sites, groups, items, tags))
    }

    // ---- Sites ----

    async fn list_sites(&self) -> Result<Vec<Site>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", value, name,
                      name_i18n as "name_i18n: serde_json::Value",
                      sort_order as "sort_order!: i64",
                      is_default
               FROM sites ORDER BY sort_order, id"#
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| Site {
                id: r.id,
                value: r.value,
                name: r.name,
                name_i18n: r.name_i18n,
                sort_order: r.sort_order,
                is_default: r.is_default != 0,
            })
            .collect())
    }

    async fn create_site(&self, p: SitePayload) -> Result<Site> {
        let res = sqlx::query!(
            "INSERT INTO sites (value, name, name_i18n, is_default) VALUES (?, ?, ?, ?)",
            p.value,
            p.name,
            p.name_i18n,
            p.is_default
        )
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
            sqlx::query!("UPDATE sites SET value=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?;
        }
        if let Some(v) = p.name {
            sqlx::query!("UPDATE sites SET name=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.name_i18n {
            sqlx::query!("UPDATE sites SET name_i18n=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.is_default {
            sqlx::query!("UPDATE sites SET is_default=? WHERE id=?", v, id)
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
        let referenced: i32 =
            sqlx::query_scalar!("SELECT COUNT(*) FROM item_links WHERE site_id=?", id)
                .fetch_one(&self.pool)
                .await?;
        if referenced > 0 {
            return Err(AppError::Conflict(format!(
                "site is referenced by {referenced} item link(s); remove them first"
            )));
        }
        let res = sqlx::query!("DELETE FROM sites WHERE id=?", id)
            .execute(&self.pool)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    async fn reorder_sites(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for e in entries {
            sqlx::query!(
                "UPDATE sites SET sort_order=? WHERE id=?",
                e.sort_order,
                e.id
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    // ---- Groups ----

    async fn list_groups(&self) -> Result<Vec<Group>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", slug, name,
                      name_i18n as "name_i18n: serde_json::Value",
                      sort_order as "sort_order!: i64",
                      collapsed_default
               FROM groups ORDER BY sort_order, id"#
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| Group {
                id: r.id,
                slug: r.slug,
                name: r.name,
                name_i18n: r.name_i18n,
                sort_order: r.sort_order,
                collapsed_default: r.collapsed_default != 0,
            })
            .collect())
    }

    async fn create_group(&self, p: GroupPayload) -> Result<Group> {
        let res = sqlx::query!(
            "INSERT INTO groups (slug, name, name_i18n, collapsed_default) VALUES (?, ?, ?, ?)",
            p.slug,
            p.name,
            p.name_i18n,
            p.collapsed_default
        )
        .execute(&self.pool)
        .await
        .map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        self.list_groups()
            .await?
            .into_iter()
            .find(|g| g.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn patch_group(&self, id: i64, p: GroupPatch) -> Result<Group> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.slug {
            sqlx::query!("UPDATE groups SET slug=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?;
        }
        if let Some(v) = p.name {
            sqlx::query!("UPDATE groups SET name=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.name_i18n {
            sqlx::query!("UPDATE groups SET name_i18n=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.collapsed_default {
            sqlx::query!("UPDATE groups SET collapsed_default=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        self.list_groups()
            .await?
            .into_iter()
            .find(|g| g.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn delete_group(&self, id: i64) -> Result<()> {
        let referenced: i32 =
            sqlx::query_scalar!("SELECT COUNT(*) FROM items WHERE group_id=?", id)
                .fetch_one(&self.pool)
                .await?;
        if referenced > 0 {
            return Err(AppError::Conflict(format!(
                "group still contains {referenced} item(s); move them first"
            )));
        }
        let res = sqlx::query!("DELETE FROM groups WHERE id=?", id)
            .execute(&self.pool)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    async fn reorder_groups(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for e in entries {
            sqlx::query!(
                "UPDATE groups SET sort_order=? WHERE id=?",
                e.sort_order,
                e.id
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    // ---- Tags ----

    async fn list_tags(&self) -> Result<Vec<Tag>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", slug, name,
                      name_i18n as "name_i18n: serde_json::Value"
               FROM tags ORDER BY id"#
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| Tag {
                id: r.id,
                slug: r.slug,
                name: r.name,
                name_i18n: r.name_i18n,
            })
            .collect())
    }

    async fn create_tag(&self, p: TagPayload) -> Result<Tag> {
        let res = sqlx::query!(
            "INSERT INTO tags (slug, name, name_i18n) VALUES (?, ?, ?)",
            p.slug,
            p.name,
            p.name_i18n
        )
        .execute(&self.pool)
        .await
        .map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        self.list_tags()
            .await?
            .into_iter()
            .find(|t| t.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn patch_tag(&self, id: i64, p: TagPatch) -> Result<Tag> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.slug {
            sqlx::query!("UPDATE tags SET slug=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await
                .map_err(map_unique_violation)?;
        }
        if let Some(v) = p.name {
            sqlx::query!("UPDATE tags SET name=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(v) = p.name_i18n {
            sqlx::query!("UPDATE tags SET name_i18n=? WHERE id=?", v, id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        self.list_tags()
            .await?
            .into_iter()
            .find(|t| t.id == id)
            .ok_or(AppError::NotFound)
    }

    async fn delete_tag(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM tags WHERE id=?", id)
            .execute(&self.pool)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    // ---- Items ----

    async fn create_item(&self, p: ItemPayload) -> Result<Item> {
        let now = now_ms();
        let kind_str = match p.icon_kind {
            IconKind::Asset => "asset",
            IconKind::Url => "url",
            IconKind::AutoFavicon => "auto-favicon",
        };

        let mut tx = self.pool.begin().await?;
        let res = sqlx::query!(
            r#"INSERT INTO items
                (group_id, name, name_i18n, description, description_i18n,
                 icon_kind, icon_value, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM items WHERE group_id IS ?), 0), ?, ?)"#,
            p.group_id, p.name, p.name_i18n, p.description, p.description_i18n,
            kind_str, p.icon_value, p.group_id, now, now
        ).execute(&mut *tx).await?;
        let id = res.last_insert_rowid();

        for (site_value, url) in &p.links {
            sqlx::query!(
                r#"INSERT INTO item_links (item_id, site_id, url)
                    SELECT ?, sites.id, ? FROM sites WHERE sites.value = ?"#,
                id,
                url,
                site_value
            )
            .execute(&mut *tx)
            .await?;
        }

        for slug in &p.tag_slugs {
            sqlx::query!(
                "INSERT OR IGNORE INTO tags (slug, name) VALUES (?, ?)",
                slug,
                slug
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                r#"INSERT INTO item_tags (item_id, tag_id)
                    SELECT ?, tags.id FROM tags WHERE tags.slug = ?"#,
                id,
                slug
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        self.fetch_item(id).await
    }

    async fn patch_item(&self, id: i64, p: ItemPatch) -> Result<Item> {
        let now = now_ms();
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.group_id {
            sqlx::query!(
                "UPDATE items SET group_id=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.name {
            sqlx::query!(
                "UPDATE items SET name=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.name_i18n {
            sqlx::query!(
                "UPDATE items SET name_i18n=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.description {
            sqlx::query!(
                "UPDATE items SET description=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.description_i18n {
            sqlx::query!(
                "UPDATE items SET description_i18n=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.icon_kind {
            let s = match v {
                IconKind::Asset => "asset",
                IconKind::Url => "url",
                IconKind::AutoFavicon => "auto-favicon",
            };
            sqlx::query!(
                "UPDATE items SET icon_kind=?, updated_at=? WHERE id=?",
                s,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        if let Some(v) = p.icon_value {
            sqlx::query!(
                "UPDATE items SET icon_value=?, updated_at=? WHERE id=?",
                v,
                now,
                id
            )
            .execute(&mut *tx)
            .await?;
        }

        if let Some(links) = p.links {
            sqlx::query!("DELETE FROM item_links WHERE item_id=?", id)
                .execute(&mut *tx)
                .await?;
            for (site_value, url) in links {
                sqlx::query!(
                    r#"INSERT INTO item_links (item_id, site_id, url)
                        SELECT ?, sites.id, ? FROM sites WHERE sites.value = ?"#,
                    id,
                    url,
                    site_value
                )
                .execute(&mut *tx)
                .await?;
            }
        }
        if let Some(tag_slugs) = p.tag_slugs {
            sqlx::query!("DELETE FROM item_tags WHERE item_id=?", id)
                .execute(&mut *tx)
                .await?;
            for slug in tag_slugs {
                sqlx::query!(
                    "INSERT OR IGNORE INTO tags (slug, name) VALUES (?, ?)",
                    slug,
                    slug
                )
                .execute(&mut *tx)
                .await?;
                sqlx::query!(
                    r#"INSERT INTO item_tags (item_id, tag_id)
                        SELECT ?, tags.id FROM tags WHERE tags.slug = ?"#,
                    id,
                    slug
                )
                .execute(&mut *tx)
                .await?;
            }
        }
        tx.commit().await?;
        self.fetch_item(id).await
    }

    async fn delete_item(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM items WHERE id=?", id)
            .execute(&self.pool)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    async fn reorder_items(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let now = now_ms();
        let mut tx = self.pool.begin().await?;
        for e in entries {
            match e.group_id {
                Some(gid) => {
                    sqlx::query!(
                        "UPDATE items SET sort_order=?, group_id=?, updated_at=? WHERE id=?",
                        e.sort_order,
                        gid,
                        now,
                        e.id
                    )
                    .execute(&mut *tx)
                    .await?;
                }
                None => {
                    sqlx::query!(
                        "UPDATE items SET sort_order=?, updated_at=? WHERE id=?",
                        e.sort_order,
                        now,
                        e.id
                    )
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
        tx.commit().await?;
        Ok(())
    }
}

impl SqlxNavRepo {
    pub(crate) async fn fetch_item(&self, id: i64) -> Result<Item> {
        self.list_items_full()
            .await?
            .into_iter()
            .find(|i| i.id == id)
            .ok_or(AppError::NotFound)
    }

    pub(crate) async fn list_items_full(&self) -> Result<Vec<Item>> {
        let item_rows = sqlx::query!(
            r#"SELECT id as "id!: i64", group_id,
                      name, name_i18n as "name_i18n: serde_json::Value",
                      description, description_i18n as "description_i18n: serde_json::Value",
                      icon_kind, icon_value,
                      sort_order as "sort_order!: i64",
                      created_at as "created_at!: i64",
                      updated_at as "updated_at!: i64"
               FROM items
               ORDER BY group_id, sort_order, id"#
        )
        .fetch_all(&self.pool)
        .await?;

        let link_rows = sqlx::query!(
            r#"SELECT il.item_id as "item_id!: i64", s.value as "site_value!", il.url as "url!"
               FROM item_links il JOIN sites s ON s.id = il.site_id"#
        )
        .fetch_all(&self.pool)
        .await?;

        let tag_rows = sqlx::query!(
            r#"SELECT it.item_id as "item_id!: i64", t.slug as "slug!"
               FROM item_tags it JOIN tags t ON t.id = it.tag_id"#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut items: Vec<Item> = item_rows
            .into_iter()
            .map(|r| {
                let kind = match r.icon_kind.as_str() {
                    "url" => IconKind::Url,
                    "auto-favicon" => IconKind::AutoFavicon,
                    _ => IconKind::Asset,
                };
                Item {
                    id: r.id,
                    group_id: r.group_id,
                    name: r.name,
                    name_i18n: r.name_i18n,
                    description: r.description,
                    description_i18n: r.description_i18n,
                    icon_kind: kind,
                    icon_value: r.icon_value,
                    sort_order: r.sort_order,
                    links: Default::default(),
                    tag_slugs: Vec::new(),
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                }
            })
            .collect();

        let by_id: std::collections::HashMap<i64, usize> =
            items.iter().enumerate().map(|(i, it)| (it.id, i)).collect();

        for r in link_rows {
            if let Some(&idx) = by_id.get(&r.item_id) {
                items[idx].links.insert(r.site_value, r.url);
            }
        }
        for r in tag_rows {
            if let Some(&idx) = by_id.get(&r.item_id) {
                items[idx].tag_slugs.push(r.slug);
            }
        }
        Ok(items)
    }
}
