use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub fn router<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/health", get(health))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
