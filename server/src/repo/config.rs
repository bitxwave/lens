use crate::error::Result;
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

/// Centralised string keys for the `config` k/v table. Anything that
/// reaches into `ConfigRepo::get` / `upsert*` should reference these
/// constants instead of inline string literals — typos then become
/// compile errors and grep finds every reader/writer.
pub mod keys {
    pub const ADMIN_PASSWORD_HASH: &str = "admin_password_hash";
    pub const ADMIN_PASSWORD_UPDATED_AT: &str = "admin_password_updated_at";

    pub const SITE_NAME: &str = "site_name";
    pub const SITE_AVATAR_PATH: &str = "site_avatar_path";
    pub const SITE_COPYRIGHT: &str = "site_copyright";
    pub const SITE_ICP_TEXT: &str = "site_icp_text";
    pub const SITE_ICP_URL: &str = "site_icp_url";
    pub const SITE_POLICE_TEXT: &str = "site_police_text";
    pub const SITE_POLICE_URL: &str = "site_police_url";
    pub const DEFAULT_THEME: &str = "default_theme";
}

#[async_trait]
pub trait ConfigRepo: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<String>>;
    async fn get_many(&self, keys: &[&str]) -> Result<BTreeMap<String, String>>;
    async fn upsert(&self, key: &str, value: &str) -> Result<()>;
    async fn upsert_many(&self, pairs: &[(&str, &str)]) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
}

pub struct SqlxConfigRepo {
    pool: SqlitePool,
}

impl SqlxConfigRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ConfigRepo for SqlxConfigRepo {
    async fn get(&self, key: &str) -> Result<Option<String>> {
        let row = sqlx::query_scalar!("SELECT value FROM config WHERE key = ?", key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    async fn get_many(&self, keys: &[&str]) -> Result<BTreeMap<String, String>> {
        let mut out = BTreeMap::new();
        for k in keys {
            if let Some(v) = self.get(k).await? {
                out.insert((*k).to_string(), v);
            }
        }
        Ok(out)
    }

    async fn upsert(&self, key: &str, value: &str) -> Result<()> {
        sqlx::query!(
            "INSERT INTO config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            key,
            value
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn upsert_many(&self, pairs: &[(&str, &str)]) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for (k, v) in pairs {
            sqlx::query!(
                "INSERT INTO config (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                k,
                v
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query!("DELETE FROM config WHERE key = ?", key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
