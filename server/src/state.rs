use crate::repo::{ConfigRepo, NavRepo};
use crate::services::favicon::FaviconService;
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
    pub fn new(nav: Arc<dyn NavRepo>, config: Arc<dyn ConfigRepo>, data_dir: PathBuf) -> Self {
        let favicon = Arc::new(FaviconService::new(crate::services::favicon::cache_dir(
            &data_dir,
        )));
        Self {
            nav,
            config,
            data_dir,
            favicon,
        }
    }
}
