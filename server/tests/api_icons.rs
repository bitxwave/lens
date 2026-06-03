use axum_test::TestServer;
use lens::app::build_app;
use lens::auth::{password, session::layer as session_layer};
use lens::db::connect_in_memory;
use lens::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo};
use lens::state::AppState;
use std::net::SocketAddr;
use std::sync::Arc;

#[tokio::test]
async fn upload_writes_file_under_data_dir_icons() {
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap())
        .await
        .unwrap();
    let dir = tempfile::TempDir::new().unwrap();
    let state = AppState::new(nav, cfg, dir.path().to_path_buf());
    let app = build_app(state, session_layer(pool, false), dir.path().to_path_buf())
        .into_make_service_with_connect_info::<SocketAddr>();
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server
        .post("/api/auth/login")
        .json(&serde_json::json!({"password":"pw"}))
        .await
        .assert_status_success();

    let res = server
        .post("/api/icons/upload")
        .multipart(
            axum_test::multipart::MultipartForm::new().add_part(
                "file",
                axum_test::multipart::Part::bytes(b"\x89PNG\r\n\x1a\n".to_vec())
                    .file_name("hello.png")
                    .mime_type("image/png"),
            ),
        )
        .await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = res.json();
    let path = body["path"].as_str().unwrap();
    assert!(path.starts_with("/icons/"));
    assert!(dir
        .path()
        .join("icons")
        .join(path.trim_start_matches("/icons/"))
        .exists());
}
