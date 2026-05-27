use axum_test::TestServer;
use lens::app::build_app;
use lens::auth::{password, session::layer as session_layer};
use lens::db::connect_in_memory;
use lens::dto::SitePayload;
use lens::repo::{ConfigRepo, NavRepo, SqlxConfigRepo, SqlxNavRepo};
use lens::state::AppState;
use std::sync::Arc;

async fn auth_server() -> TestServer {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap())
        .await
        .unwrap();
    nav.create_site(SitePayload {
        value: "shangHai".into(),
        name: "上海".into(),
        is_default: true,
    })
    .await
    .unwrap();
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg, dir.clone());
    let mut server = TestServer::new(build_app(state, session_layer(pool, false), dir)).unwrap();
    server.do_save_cookies();
    server
        .post("/api/auth/login")
        .json(&serde_json::json!({"password": "pw"}))
        .await
        .assert_status_success();
    server
}

#[tokio::test]
async fn create_root_item_via_api() {
    let server = auth_server().await;
    let res = server
        .post("/api/cards")
        .json(&serde_json::json!({
            "kind": "item",
            "name": "X",
            "iconKind": "asset",
            "iconValue": "x.png",
            "links": {"shangHai": "http://x"}
        }))
        .await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = res.json();
    assert_eq!(body["kind"], "item");
    assert_eq!(body["sortOrder"], 0);
    assert_eq!(body["links"]["shangHai"], "http://x");
}

#[tokio::test]
async fn auto_folder_via_api() {
    let server = auth_server().await;
    let a: serde_json::Value = server
        .post("/api/cards")
        .json(&serde_json::json!({
            "kind": "item", "name": "A", "iconKind": "asset", "iconValue": "a.png"
        }))
        .await
        .json();
    let b: serde_json::Value = server
        .post("/api/cards")
        .json(&serde_json::json!({
            "kind": "item", "name": "B", "iconKind": "asset", "iconValue": "b.png"
        }))
        .await
        .json();
    let res = server
        .post("/api/cards/auto-folder")
        .json(&serde_json::json!({
            "sourceItemId": a["id"], "targetItemId": b["id"], "name": "Untitled"
        }))
        .await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let folder: serde_json::Value = res.json();
    assert_eq!(folder["kind"], "folder");
}

#[tokio::test]
async fn nav_bundle_includes_cards_array() {
    let server = auth_server().await;
    server
        .post("/api/cards")
        .json(&serde_json::json!({
            "kind": "item", "name": "X", "iconKind": "asset", "iconValue": "x.png"
        }))
        .await
        .assert_status(axum::http::StatusCode::CREATED);
    let res = server.get("/api/nav").await;
    res.assert_status_ok();
    let body: serde_json::Value = res.json();
    assert!(!body["cards"].as_array().unwrap().is_empty());
    assert!(body.get("groups").is_none());
    assert!(body.get("items").is_none());
}

#[tokio::test]
async fn legacy_routes_are_unreachable() {
    // The /api/groups and /api/items families are removed in Plan 6.
    // Axum may answer with 404 (route gone) or 405 (catch-all method
    // mismatch on a leftover prefix); either way the route does not
    // succeed. We assert the absence of a 2xx.
    let server = auth_server().await;
    let r1 = server
        .post("/api/groups")
        .json(&serde_json::json!({}))
        .await;
    assert!(!r1.status_code().is_success());
    let r2 = server.post("/api/items").json(&serde_json::json!({})).await;
    assert!(!r2.status_code().is_success());
}
