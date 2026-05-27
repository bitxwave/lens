use lens::auth::password;
use lens::cli::{run_command, Command};
use lens::config::Settings;

#[tokio::test]
async fn reset_password_flow() {
    let dir = tempfile::TempDir::new().unwrap();
    std::env::set_var("DATA_DIR", dir.path());
    std::env::remove_var("BOOTSTRAP_ADMIN_PASSWORD");
    std::env::set_var("RUST_LOG", "warn");
    // Touch a fake initial password file to ensure it gets removed.
    std::fs::write(dir.path().join("INITIAL_PASSWORD.txt"), "old").unwrap();

    run_command(Command::ResetPassword {
        password: Some("brand-new-pw".into()),
    })
    .await
    .unwrap();

    let s = Settings::load().unwrap();
    let pool = lens::db::connect(&s.db_url()).await.unwrap();
    let h: (String,) = sqlx::query_as("SELECT value FROM config WHERE key='admin_password_hash'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(password::verify("brand-new-pw", &h.0).unwrap());
    assert!(!dir.path().join("INITIAL_PASSWORD.txt").exists());

    // cleanup env
    std::env::remove_var("DATA_DIR");
}
