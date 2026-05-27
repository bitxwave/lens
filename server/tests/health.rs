use axum_test::TestServer;
use lens::app::build_app_for_tests;

#[tokio::test]
async fn health_returns_ok_json() {
    let app = build_app_for_tests().await.expect("app builds");
    let server = TestServer::new(app).expect("server");
    let res = server.get("/api/health").await;
    res.assert_status_ok();
    res.assert_json(&serde_json::json!({ "status": "ok" }));
}
