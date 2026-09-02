use sqlx::SqlitePool;
use std::time::Duration;
use tower_sessions::cookie::time::Duration as CookieDur;
use tower_sessions::cookie::SameSite;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::SqliteStore;

pub const SESSION_KEY_AUTHED: &str = "authed";

pub fn layer(pool: SqlitePool, secure: bool) -> SessionManagerLayer<SqliteStore> {
    let store = SqliteStore::new(pool)
        .with_table_name("tower_sessions")
        .expect("valid table");
    // RFC 6265bis: `__Host-` prefix REQUIRES Secure. Use it only when secure=true
    // (HTTPS deploy) so dev-mode HTTP cookies aren't silently rejected by clients.
    let name = if secure { "__Host-sid" } else { "sid" };
    SessionManagerLayer::new(store)
        .with_name(name)
        .with_secure(secure)
        .with_http_only(true)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(CookieDur::days(30)))
}

/// Background task: prune expired sessions every hour.
pub async fn run_pruner(pool: SqlitePool) {
    let mut tick = tokio::time::interval(Duration::from_secs(3600));
    loop {
        tick.tick().await;
        let now = chrono::Utc::now().timestamp_millis();
        if let Err(e) = sqlx::query("DELETE FROM tower_sessions WHERE expiry_date < ?")
            .bind(now)
            .execute(&pool)
            .await
        {
            tracing::warn!(error = %e, "session pruner failed");
        }
    }
}
