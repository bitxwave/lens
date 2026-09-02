use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::SmartIpKeyExtractor;
use tower_governor::GovernorLayer;
use tower_sessions::Session;

use crate::auth::password;
use crate::auth::session::SESSION_KEY_AUTHED;
use crate::error::{AppError, Result};
use crate::repo::config_keys as k;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    // 5 attempts per 15 minutes ≈ 1 token replenished every 180s with a burst of 5.
    // Per-IP bucket so a single attacker can't lock out other operators.
    // `SmartIpKeyExtractor` reads `X-Forwarded-For` / `X-Real-IP` / `Forwarded`
    // first (reverse-proxy friendly) and falls back to peer-IP. The peer-IP
    // path requires the binary's `axum::serve` site to use
    // `.into_make_service_with_connect_info::<SocketAddr>()` — see `main.rs`.
    let conf = std::sync::Arc::new(
        GovernorConfigBuilder::default()
            .per_second(180)
            .burst_size(5)
            .key_extractor(SmartIpKeyExtractor)
            .finish()
            .expect("governor config"),
    );
    let governor = GovernorLayer::new(conf);

    Router::new()
        .route("/auth/login", post(login).layer(governor))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
}

#[derive(Deserialize)]
struct LoginBody {
    password: String,
}

async fn login(
    State(s): State<AppState>,
    session: Session,
    Json(body): Json<LoginBody>,
) -> Result<StatusCode> {
    let hashed = s
        .config
        .get(k::ADMIN_PASSWORD_HASH)
        .await?
        .ok_or(AppError::Unauthenticated)?;
    if !password::verify(&body.password, &hashed)? {
        return Err(AppError::Unauthenticated);
    }
    session.insert(SESSION_KEY_AUTHED, true).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn logout(session: Session) -> Result<StatusCode> {
    session.flush().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn me(session: Session) -> Result<Json<serde_json::Value>> {
    let authed = session
        .get::<bool>(SESSION_KEY_AUTHED)
        .await?
        .unwrap_or(false);
    Ok(Json(json!({ "authenticated": authed })))
}
