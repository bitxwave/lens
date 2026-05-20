use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};

use crate::auth::RequireAuth;
use crate::dto::{Group, GroupPatch, GroupPayload, ReorderEntry};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/groups", post(create))
        .route("/groups/reorder", post(reorder))
        .route("/groups/:id", patch(update).delete(remove))
}

async fn create(
    _a: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<GroupPayload>,
) -> Result<(StatusCode, Json<Group>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_group(body).await?)))
}
async fn update(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<GroupPatch>,
) -> Result<Json<Group>> {
    Ok(Json(s.nav.patch_group(id, body).await?))
}
async fn remove(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    s.nav.delete_group(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn reorder(
    _a: RequireAuth,
    State(s): State<AppState>,
    Json(entries): Json<Vec<ReorderEntry>>,
) -> Result<StatusCode> {
    s.nav.reorder_groups(entries).await?;
    Ok(StatusCode::NO_CONTENT)
}
