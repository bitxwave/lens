use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, NavRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::services::migration::seed_if_empty;
use std::sync::Arc;

#[tokio::test]
async fn seed_populates_sites_and_groups() {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    seed_if_empty(nav.clone(), cfg.clone()).await.unwrap();
    let (sites, groups, _items) = nav.get_bundle().await.unwrap();
    assert!(sites.iter().any(|s| s.value == "shangHai"));
    assert!(groups.iter().any(|g| g.slug == "network"));
    assert_eq!(
        cfg.get("site_name").await.unwrap().as_deref(),
        Some("Pico 的小站导航")
    );
}

#[tokio::test]
async fn seed_idempotent() {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    seed_if_empty(nav.clone(), cfg.clone()).await.unwrap();
    let count_before = nav.get_bundle().await.unwrap().0.len();
    seed_if_empty(nav.clone(), cfg.clone()).await.unwrap();
    let count_after = nav.get_bundle().await.unwrap().0.len();
    assert_eq!(count_before, count_after);
}
