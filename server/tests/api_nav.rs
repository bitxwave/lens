use axum_test::TestServer;
use navsrv::app::build_app_for_tests;

#[tokio::test]
async fn nav_endpoint_returns_empty_bundle_initially() {
    let app = build_app_for_tests().await.unwrap();
    let server = TestServer::new(app).unwrap();
    let res = server.get("/api/nav").await;
    res.assert_status_ok();
    let body: serde_json::Value = res.json();
    assert_eq!(body["schemaVersion"], 1);
    assert!(body["sites"].as_array().unwrap().is_empty());
    assert!(body["items"].as_array().unwrap().is_empty());
    assert_eq!(body["meta"]["defaultTheme"], "system");
}
