//! SQLite connection pool with safe defaults (WAL, foreign keys, busy timeout).

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{ConnectOptions, SqlitePool};
use std::str::FromStr;
use std::time::Duration;

/// Build a pool against the given URL, applying recommended pragmas.
pub async fn connect(url: &str) -> sqlx::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .log_statements(tracing::log::LevelFilter::Debug);

    SqlitePoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(opts)
        .await
}

/// Run all bundled migrations against the pool.
pub async fn migrate(pool: &SqlitePool) -> sqlx::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

/// Build an in-memory pool with migrations applied. Used by unit and
/// integration tests; not intended for production callers.
#[doc(hidden)]
pub async fn connect_in_memory() -> sqlx::Result<SqlitePool> {
    let pool = connect("sqlite::memory:").await?;
    migrate(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pool_runs_pragmas() {
        let pool = connect("sqlite::memory:").await.unwrap();
        let row: (String,) = sqlx::query_as("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        // SQLite returns "memory" for in-memory DBs even after WAL request, so just sanity-check connectivity.
        assert!(!row.0.is_empty());
        let row: (i64,) = sqlx::query_as("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.0, 1);
    }

    #[tokio::test]
    async fn migrate_creates_tables() {
        let pool = connect_in_memory().await.unwrap();
        let row: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='items'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, 1);
    }
}
