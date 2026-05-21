use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::dto::{GroupPayload, SitePayload};
use navsrv::repo::{ConfigRepo, NavRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;

async fn auth_server() -> (TestServer, i64) {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap())
        .await
        .unwrap();
    let g = nav
        .create_group(GroupPayload {
            slug: "tools".into(),
            name: "Tools".into(),
            name_i18n: None,
            collapsed_default: false,
        })
        .await
        .unwrap();
    nav.create_site(SitePayload {
        value: "shangHai".into(),
        name: "上海".into(),
        name_i18n: None,
        is_default: true,
    })
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
    (server, g.id)
}

#[tokio::test]
async fn create_then_list_via_bundle() {
    let (server, gid) = auth_server().await;
    let body = serde_json::json!({
        "groupId": gid,
        "name": "Router",
        "iconKind": "asset",
        "iconValue": "router.png",
        "links": { "shangHai": "http://10.0.0.1" }
    });
    let res = server.post("/api/items").json(&body).await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let v: serde_json::Value = res.json();
    let id = v["id"].as_i64().unwrap();
    assert_eq!(v["name"], "Router");

    let bundle: serde_json::Value = server.get("/api/nav").await.json();
    let item = bundle["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"].as_i64() == Some(id))
        .unwrap();
    assert_eq!(item["links"]["shangHai"], "http://10.0.0.1");
}

#[tokio::test]
async fn patch_changes_name() {
    let (server, gid) = auth_server().await;
    let id = server
        .post("/api/items")
        .json(&serde_json::json!({
            "groupId": gid, "name": "old", "iconKind":"asset", "iconValue":"x.png"
        }))
        .await
        .json::<serde_json::Value>()["id"]
        .as_i64()
        .unwrap();

    let res = server
        .patch(&format!("/api/items/{id}"))
        .json(&serde_json::json!({ "name": "new" }))
        .await;
    res.assert_status_ok();
    let v: serde_json::Value = res.json();
    assert_eq!(v["name"], "new");
}

#[tokio::test]
async fn delete_removes_item() {
    let (server, gid) = auth_server().await;
    let id = server
        .post("/api/items")
        .json(&serde_json::json!({
            "groupId": gid, "name": "x", "iconKind":"asset", "iconValue":"x.png"
        }))
        .await
        .json::<serde_json::Value>()["id"]
        .as_i64()
        .unwrap();
    server
        .delete(&format!("/api/items/{id}"))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);

    let bundle: serde_json::Value = server.get("/api/nav").await.json();
    assert!(bundle["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|i| i["id"].as_i64() != Some(id)));
}

#[tokio::test]
async fn unauthed_returns_401() {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg, dir.clone());
    let app = build_app(state, session_layer(pool, false), dir);
    let server = TestServer::new(app).unwrap();
    server
        .post("/api/items")
        .json(&serde_json::json!({
            "name":"x","iconKind":"asset","iconValue":"x.png"
        }))
        .await
        .assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
