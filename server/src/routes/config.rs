use axum::{
    extract::State,
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};
use serde::Deserialize;

use crate::auth::{password, RequireAuth};
use crate::error::{AppError, Result};
use crate::repo::config_keys as k;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config", patch(patch_config))
        .route("/config/password", post(change_password))
}

#[derive(Deserialize)]
struct ConfigEntry {
    key: String,
    value: String,
}

async fn patch_config(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(items): Json<Vec<ConfigEntry>>,
) -> Result<StatusCode> {
    let pairs: Vec<(&str, &str)> = items
        .iter()
        .map(|i| (i.key.as_str(), i.value.as_str()))
        .collect();
    s.config.upsert_many(&pairs).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct ChangePassword {
    current: String,
    next: String,
}

async fn change_password(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<ChangePassword>,
) -> Result<StatusCode> {
    if body.next.len() < 8 {
        return Err(AppError::Validation(
            "password must be at least 8 chars".into(),
        ));
    }
    let current_hash = s
        .config
        .get(k::ADMIN_PASSWORD_HASH)
        .await?
        .ok_or(AppError::Unauthenticated)?;
    if !password::verify(&body.current, &current_hash)? {
        return Err(AppError::Unauthenticated);
    }
    let new_hash = password::hash(&body.next)?;
    let now = chrono::Utc::now().timestamp_millis().to_string();
    s.config
        .upsert_many(&[
            (k::ADMIN_PASSWORD_HASH, &new_hash),
            (k::ADMIN_PASSWORD_UPDATED_AT, &now),
        ])
        .await?;

    let initial = s.data_dir.join("INITIAL_PASSWORD.txt");
    match tokio::fs::remove_file(&initial).await {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            tracing::warn!(error=%e, ?initial, "failed to remove INITIAL_PASSWORD.txt");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}
