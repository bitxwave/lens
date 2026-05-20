use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, NavRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;

async fn boot() -> TestServer {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap())
        .await
        .unwrap();
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg, dir.clone());
    let app = build_app(state, session_layer(pool, false), dir);
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server
        .post("/api/auth/login")
        .json(&serde_json::json!({"password":"pw"}))
        .await
        .assert_status_success();
    server
}

#[tokio::test]
async fn group_lifecycle() {
    let server = boot().await;
    let g: serde_json::Value = server
        .post("/api/groups")
        .json(&serde_json::json!({
            "slug":"net","name":"Network"
        }))
        .await
        .json();
    let id = g["id"].as_i64().unwrap();
    server
        .patch(&format!("/api/groups/{id}"))
        .json(&serde_json::json!({"name":"NET"}))
        .await
        .assert_status_ok();
    server
        .delete(&format!("/api/groups/{id}"))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn site_lifecycle() {
    let server = boot().await;
    let s: serde_json::Value = server
        .post("/api/sites")
        .json(&serde_json::json!({
            "value":"sh","name":"Shanghai"
        }))
        .await
        .json();
    let id = s["id"].as_i64().unwrap();
    server
        .patch(&format!("/api/sites/{id}"))
        .json(&serde_json::json!({"name":"SH"}))
        .await
        .assert_status_ok();
    server
        .delete(&format!("/api/sites/{id}"))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn tag_lifecycle() {
    let server = boot().await;
    let t: serde_json::Value = server
        .post("/api/tags")
        .json(&serde_json::json!({
            "slug":"fav","name":"Favorite"
        }))
        .await
        .json();
    let id = t["id"].as_i64().unwrap();
    server
        .patch(&format!("/api/tags/{id}"))
        .json(&serde_json::json!({"name":"⭐"}))
        .await
        .assert_status_ok();
    server
        .delete(&format!("/api/tags/{id}"))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
}
