use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::Deserialize;

use crate::error::Result;
use crate::services::favicon::FaviconService;
use crate::state::AppState;
use std::sync::Arc;

pub fn router() -> Router<AppState> {
    Router::new().route("/favicon", get(favicon))
}

#[derive(Deserialize)]
struct Q {
    host: String,
}

async fn favicon(State(s): State<AppState>, Query(q): Query<Q>) -> Result<impl IntoResponse> {
    let svc: &Arc<FaviconService> = &s.favicon;
    let (mime, bytes) = svc.fetch(&q.host).await?;
    let mut h = HeaderMap::new();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
    h.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=86400"),
    );
    Ok((h, bytes))
}
