use axum_test::TestServer;
use lens::app::build_app;
use lens::auth::{password, session::layer as session_layer};
use lens::db::connect_in_memory;
use lens::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo};
use lens::state::AppState;
use std::net::SocketAddr;
use std::sync::Arc;
use tempfile::TempDir;

async fn boot() -> (TestServer, std::sync::Arc<dyn ConfigRepo>, TempDir) {
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("old").unwrap())
        .await
        .unwrap();
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("INITIAL_PASSWORD.txt"), "old").unwrap();
    let state = AppState::new(nav, cfg.clone(), dir.path().to_path_buf());
    let app = build_app(state, session_layer(pool, false), dir.path().to_path_buf())
        .into_make_service_with_connect_info::<SocketAddr>();
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server
        .post("/api/auth/login")
        .json(&serde_json::json!({"password":"old"}))
        .await
        .assert_status_success();
    (server, cfg, dir)
}

#[tokio::test]
async fn change_password_replaces_hash_and_deletes_initial_file() {
    let (server, cfg, dir) = boot().await;
    let res = server
        .post("/api/config/password")
        .json(&serde_json::json!({"current":"old","next":"newPwLongEnough"}))
        .await;
    res.assert_status(axum::http::StatusCode::NO_CONTENT);

    let h = cfg.get("admin_password_hash").await.unwrap().unwrap();
    assert!(password::verify("newPwLongEnough", &h).unwrap());
    assert!(!password::verify("old", &h).unwrap());

    assert!(
        !dir.path().join("INITIAL_PASSWORD.txt").exists(),
        "INITIAL_PASSWORD.txt should be deleted after first successful change"
    );
}

#[tokio::test]
async fn change_password_with_wrong_current_returns_401() {
    let (server, _cfg, _dir) = boot().await;
    server
        .post("/api/config/password")
        .json(&serde_json::json!({"current":"WRONG","next":"newPwLongEnough"}))
        .await
        .assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
