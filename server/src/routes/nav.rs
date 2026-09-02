use axum::{extract::State, routing::get, Json, Router};

use crate::dto::NavBundle;
use crate::error::Result;
use crate::services::bundle::assemble_bundle;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/nav", get(get_nav))
}

async fn get_nav(State(s): State<AppState>) -> Result<Json<NavBundle>> {
    let bundle = assemble_bundle(s.nav.clone(), s.config.clone()).await?;
    Ok(Json(bundle))
}
