use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::GlobalKeyExtractor;
use tower_governor::GovernorLayer;
use tower_sessions::Session;

use crate::auth::password;
use crate::auth::session::SESSION_KEY_AUTHED;
use crate::error::{AppError, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    // 5 attempts per 15 minutes ≈ 1 token replenished every 180s with a burst of 5.
    // GlobalKeyExtractor: single shared bucket for the login route. This avoids
    // per-IP keying which would require `into_make_service_with_connect_info`
    // wiring at the serve site — out of scope for this task.
    let conf = Box::new(
        GovernorConfigBuilder::default()
            .per_second(180)
            .burst_size(5)
            .key_extractor(GlobalKeyExtractor)
            .finish()
            .expect("governor config"),
    );
    let governor = GovernorLayer {
        config: Box::leak(conf),
    };

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
        .get("admin_password_hash")
        .await?
        .ok_or(AppError::Unauthenticated)?;
    if !password::verify(&body.password, &hashed)? {
        return Err(AppError::Unauthenticated);
    }
    session
        .insert(SESSION_KEY_AUTHED, true)
        .await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn logout(session: Session) -> Result<StatusCode> {
    session
        .flush()
        .await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn me(session: Session) -> Result<Json<serde_json::Value>> {
    let authed = session
        .get::<bool>(SESSION_KEY_AUTHED)
        .await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?
        .unwrap_or(false);
    Ok(Json(json!({ "authenticated": authed })))
}
