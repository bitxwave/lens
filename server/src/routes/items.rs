use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};

use crate::auth::RequireAuth;
use crate::dto::{Item, ItemPatch, ItemPayload, ReorderEntry};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/items", post(create))
        .route("/items/reorder", post(reorder))
        .route("/items/:id", patch(update).delete(remove))
}

async fn create(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<ItemPayload>,
) -> Result<(StatusCode, Json<Item>)> {
    let item = s.nav.create_item(body).await?;
    Ok((StatusCode::CREATED, Json(item)))
}

async fn update(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ItemPatch>,
) -> Result<Json<Item>> {
    Ok(Json(s.nav.patch_item(id, body).await?))
}

async fn remove(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    s.nav.delete_item(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn reorder(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(entries): Json<Vec<ReorderEntry>>,
) -> Result<StatusCode> {
    s.nav.reorder_items(entries).await?;
    Ok(StatusCode::NO_CONTENT)
}
