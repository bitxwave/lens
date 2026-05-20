use crate::error::Result;
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

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
