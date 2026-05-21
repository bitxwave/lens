use axum::Router;

pub mod auth;
pub mod config;
pub mod favicon;
pub mod groups;
pub mod health;
pub mod icons;
pub mod items;
pub mod nav;
pub mod sites;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest(
            "/api",
            Router::new()
                .merge(health::router())
                .merge(nav::router())
                .merge(auth::router())
                .merge(config::router())
                .merge(items::router())
                .merge(groups::router())
                .merge(sites::router())
                .merge(icons::router())
                .merge(favicon::router()),
        )
        .with_state(state)
}
