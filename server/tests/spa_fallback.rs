use axum_test::TestServer;
use lens::app::build_app;
use lens::auth::session::layer as session_layer;
use lens::db::connect_in_memory;
use lens::repo::{SqlxConfigRepo, SqlxNavRepo};
use lens::state::AppState;
use std::sync::Arc;
use tempfile::TempDir;

#[tokio::test]
async fn unknown_path_falls_back_to_index_html() {
    let dir = TempDir::new().unwrap();
    std::fs::write(
        dir.path().join("index.html"),
        "<html><body>SPA</body></html>",
    )
    .unwrap();

    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let state = AppState::new(nav, cfg, dir.path().to_path_buf());

    let app = build_app(state, session_layer(pool, false), dir.path().to_path_buf());
    let server = TestServer::new(app).unwrap();
    let res = server.get("/some/spa/route").await;
    res.assert_status_ok();
    assert!(res.text().contains("SPA"));
}
