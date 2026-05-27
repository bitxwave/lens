use axum_test::TestServer;
use lens::app::build_app_for_tests;
use lens::auth::password;
use lens::db::connect_in_memory;
use lens::repo::{ConfigRepo, SqlxConfigRepo};

async fn server_with_password(pw: &str) -> (TestServer, std::sync::Arc<dyn ConfigRepo>) {
    use lens::app::build_app;
    use lens::auth::session::layer as session_layer;
    use lens::repo::SqlxNavRepo;
    use lens::state::AppState;
    use std::sync::Arc;
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash(pw).unwrap())
        .await
        .unwrap();
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg.clone(), dir.clone());
    let app = build_app(state, session_layer(pool, false), dir);
    (TestServer::new(app).unwrap(), cfg)
}

#[tokio::test]
async fn login_with_correct_password_returns_204_and_cookie() {
    let (server, _cfg) = server_with_password("hunter2").await;
    let res = server
        .post("/api/auth/login")
        .json(&serde_json::json!({ "password": "hunter2" }))
        .await;
    res.assert_status(axum::http::StatusCode::NO_CONTENT);
    // Test runs in insecure mode (secure=false) so cookie name is plain "sid".
    // Production HTTPS deploys get `__Host-sid` automatically (see auth/session.rs).
    assert!(!res.cookie("sid").value().is_empty());
}

#[tokio::test]
async fn login_with_wrong_password_returns_401() {
    let (server, _) = server_with_password("hunter2").await;
    let res = server
        .post("/api/auth/login")
        .json(&serde_json::json!({ "password": "nope" }))
        .await;
    res.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn me_unauth_returns_false() {
    let app = build_app_for_tests().await.unwrap();
    let server = TestServer::new(app).unwrap();
    let res = server.get("/api/auth/me").await;
    res.assert_status_ok();
    res.assert_json(&serde_json::json!({ "authenticated": false }));
}

#[tokio::test]
async fn logout_clears_session() {
    let (mut server, _) = server_with_password("hunter2").await;
    server.do_save_cookies();
    server
        .post("/api/auth/login")
        .json(&serde_json::json!({ "password": "hunter2" }))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
    server
        .get("/api/auth/me")
        .await
        .assert_json(&serde_json::json!({ "authenticated": true }));
    server
        .post("/api/auth/logout")
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
    server
        .get("/api/auth/me")
        .await
        .assert_json(&serde_json::json!({ "authenticated": false }));
}
