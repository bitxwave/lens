use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use rand::distributions::{Alphanumeric, DistString};
use serde_json::{json, Value};

use crate::auth::RequireAuth;
use crate::error::{AppError, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/icons/upload", post(upload))
}

async fn upload(
    _auth: RequireAuth,
    State(s): State<AppState>,
    mut form: Multipart,
) -> Result<(StatusCode, Json<Value>)> {
    let icons_dir = s.data_dir.join("icons");
    tokio::fs::create_dir_all(&icons_dir).await?;

    while let Some(field) = form
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let filename = field
            .file_name()
            .map(str::to_owned)
            .unwrap_or_else(|| "icon".into());
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png")
            .to_lowercase();
        if !matches!(
            ext.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "svg" | "gif"
        ) {
            return Err(AppError::Validation("unsupported icon type".into()));
        }
        let mime = field.content_type().map(str::to_owned);
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::Validation(format!("multipart read: {e}")))?;
        if data.len() > 1024 * 1024 {
            return Err(AppError::Validation("icon larger than 1MiB".into()));
        }
        let nonce = Alphanumeric.sample_string(&mut rand::thread_rng(), 8);
        let stored = format!("{nonce}.{ext}");
        let path = icons_dir.join(&stored);
        tokio::fs::write(&path, &data).await?;
        let public_path = format!("/icons/{stored}");
        return Ok((
            StatusCode::CREATED,
            Json(json!({
                "path": public_path,
                "size": data.len(),
                "mime": mime
            })),
        ));
    }
    Err(AppError::Validation("no `file` field".into()))
}
