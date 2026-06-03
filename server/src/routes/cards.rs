use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};

use crate::auth::RequireAuth;
use crate::dto::{AutoFolderPayload, Card, CardPatch, CardPayload, ReorderEntry};
use crate::error::{validate, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cards", post(create))
        .route("/cards/reorder", post(reorder))
        .route("/cards/auto-folder", post(auto_folder))
        .route("/cards/{id}", patch(update).delete(remove))
}

async fn create(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<CardPayload>,
) -> Result<(StatusCode, Json<Card>)> {
    validate(&body)?;
    let card = s.nav.create_card(body).await?;
    Ok((StatusCode::CREATED, Json(card)))
}

async fn update(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<CardPatch>,
) -> Result<Json<Card>> {
    validate(&body)?;
    Ok(Json(s.nav.patch_card(id, body).await?))
}

async fn remove(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    s.nav.delete_card(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn reorder(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(entries): Json<Vec<ReorderEntry>>,
) -> Result<StatusCode> {
    s.nav.reorder_cards(entries).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn auto_folder(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<AutoFolderPayload>,
) -> Result<(StatusCode, Json<Card>)> {
    validate(&body)?;
    let folder = s.nav.auto_folder(body).await?;
    Ok((StatusCode::CREATED, Json(folder)))
}
