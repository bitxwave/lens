use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};

use crate::auth::RequireAuth;
use crate::dto::{Site, SitePatch, SitePayload, SiteReorderEntry};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sites", post(create))
        .route("/sites/reorder", post(reorder))
        .route("/sites/:id", patch(update).delete(remove))
}

async fn create(
    _a: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<SitePayload>,
) -> Result<(StatusCode, Json<Site>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_site(body).await?)))
}
async fn update(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<SitePatch>,
) -> Result<Json<Site>> {
    Ok(Json(s.nav.patch_site(id, body).await?))
}
async fn remove(
    _a: RequireAuth,
    State(s): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    s.nav.delete_site(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn reorder(
    _a: RequireAuth,
    State(s): State<AppState>,
    Json(entries): Json<Vec<SiteReorderEntry>>,
) -> Result<StatusCode> {
    s.nav.reorder_sites(entries).await?;
    Ok(StatusCode::NO_CONTENT)
}
