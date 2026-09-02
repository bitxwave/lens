use lens::db::connect_in_memory;
use lens::dto::CardKind;
use lens::repo::{ConfigRepo, NavRepo, SqlxConfigRepo, SqlxNavRepo};
use lens::services::migration::seed_if_empty;
use std::sync::Arc;

#[tokio::test]
async fn seed_populates_sites_and_folders() {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    seed_if_empty(nav.clone(), cfg.clone()).await.unwrap();
    let (sites, cards) = nav.get_bundle().await.unwrap();
    assert!(sites.iter().any(|s| s.value == "shangHai"));
    let folders: Vec<_> = cards
        .iter()
        .filter(|c| matches!(c.kind, CardKind::Folder))
        .collect();
    assert!(
        folders.iter().any(|f| f.slug.as_deref() == Some("network")),
        "expected a folder seeded from the 'network' bootstrap group"
    );
    let items: Vec<_> = cards
        .iter()
        .filter(|c| matches!(c.kind, CardKind::Item))
        .collect();
    assert!(!items.is_empty(), "expected items seeded from bootstrap");
    assert_eq!(cfg.get("site_name").await.unwrap().as_deref(), Some("Lens"));
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
