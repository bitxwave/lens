use crate::repo::{ConfigRepo, NavRepo};
use crate::services::favicon::{self, FaviconService, DEFAULT_PROVIDER_URL};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub nav: Arc<dyn NavRepo>,
    pub config: Arc<dyn ConfigRepo>,
    pub data_dir: PathBuf,
    pub favicon: Arc<FaviconService>,
}

impl AppState {
    /// Build an AppState with the default favicon provider (Google s2).
    /// Most call sites — including tests — use this; production wires
    /// a configurable provider via `with_favicon_provider`.
    pub fn new(nav: Arc<dyn NavRepo>, config: Arc<dyn ConfigRepo>, data_dir: PathBuf) -> Self {
        Self::with_favicon_provider(nav, config, data_dir, DEFAULT_PROVIDER_URL.to_string())
    }

    pub fn with_favicon_provider(
        nav: Arc<dyn NavRepo>,
        config: Arc<dyn ConfigRepo>,
        data_dir: PathBuf,
        favicon_provider_url: String,
    ) -> Self {
        let favicon = Arc::new(FaviconService::new(
            favicon::cache_dir(&data_dir),
            favicon_provider_url,
        ));
        Self {
            nav,
            config,
            data_dir,
            favicon,
        }
    }
}
