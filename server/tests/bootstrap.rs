use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo};
use navsrv::services::bootstrap::{ensure_admin_password, BootstrapOutcome};
use std::sync::Arc;
use tempfile::TempDir;

#[tokio::test]
async fn first_boot_with_env_writes_hash_only() {
    let pool = connect_in_memory().await.unwrap();
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool));
    let dir = TempDir::new().unwrap();

    let out = ensure_admin_password(cfg.clone(), dir.path(), Some("env-pw".into()))
        .await
        .unwrap();
    assert!(matches!(out, BootstrapOutcome::SetFromEnv));
    assert!(cfg.get("admin_password_hash").await.unwrap().is_some());
    assert!(!dir.path().join("INITIAL_PASSWORD.txt").exists());
}

#[tokio::test]
async fn first_boot_without_env_generates_and_writes_file() {
    let pool = connect_in_memory().await.unwrap();
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool));
    let dir = TempDir::new().unwrap();

    let out = ensure_admin_password(cfg.clone(), dir.path(), None)
        .await
        .unwrap();
    let pw = match out {
        BootstrapOutcome::Generated(pw) => pw,
        _ => panic!("expected Generated"),
    };
    assert_eq!(pw.len(), 24);
    let path = dir.path().join("INITIAL_PASSWORD.txt");
    assert!(path.exists());
    let content = std::fs::read_to_string(&path).unwrap();
    assert!(content.contains(&pw));
}

#[tokio::test]
async fn second_boot_is_idempotent() {
    let pool = connect_in_memory().await.unwrap();
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool));
    let dir = TempDir::new().unwrap();

    ensure_admin_password(cfg.clone(), dir.path(), Some("first".into()))
        .await
        .unwrap();
    let out = ensure_admin_password(cfg.clone(), dir.path(), Some("ignored".into()))
        .await
        .unwrap();
    assert!(matches!(out, BootstrapOutcome::AlreadySet));
}
