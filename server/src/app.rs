use axum::http::{header, HeaderValue, Request};
use axum::Router;
use std::path::PathBuf;
use tower_http::compression::CompressionLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tower_sessions::SessionManagerLayer;
use tower_sessions_sqlx_store::SqliteStore;
use tracing::Level;

use crate::routes;
use crate::state::AppState;

pub fn build_app(
    state: AppState,
    session_layer: SessionManagerLayer<SqliteStore>,
    static_dir: PathBuf,
) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let method = req.method();
            let uri = req.uri().path();
            tracing::info_span!("http", %method, %uri)
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    let index_html = static_dir.join("index.html");
    let serve_dir = ServeDir::new(static_dir.clone()).fallback(ServeFile::new(index_html));

    let user_icons_dir = state.data_dir.join("icons");

    Router::new()
        .merge(routes::api(state))
        .nest_service("/icons", ServeDir::new(user_icons_dir))
        .fallback_service(serve_dir)
        .layer(session_layer)
        .layer(trace)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    use crate::auth::session::layer as session_layer;
    use crate::db::connect_in_memory;
    use crate::repo::{SqlxConfigRepo, SqlxNavRepo};
    use std::sync::Arc;
    let pool = connect_in_memory().await?;
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg, dir.clone());
    Ok(build_app(state, session_layer(pool, false), dir))
}
