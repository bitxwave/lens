use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};

use crate::auth::RequireAuth;
use crate::dto::{Tag, TagPatch, TagPayload};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tags", post(create))
        .route("/tags/:id", patch(update).delete(remove))
}

async fn create(
    _a: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<TagPayload>,
) -> Result<(StatusCode, Json<Tag>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_tag(body).await?)))
}
async fn update(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<TagPatch>,
) -> Result<Json<Tag>> {
    Ok(Json(s.nav.patch_tag(id, body).await?))
}
async fn remove(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    s.nav.delete_tag(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
