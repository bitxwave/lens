use anyhow::Context;
use clap::Parser;
use lens::{
    app::build_app,
    auth::session::{layer as session_layer, run_pruner},
    cli::{run_command, Cli},
    config::Settings,
    db::{connect, migrate},
    repo::{SqlxConfigRepo, SqlxNavRepo},
    services::bootstrap::ensure_admin_password,
    state::AppState,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let settings = Settings::load().context("load settings")?;
    init_tracing(&settings.rust_log);

    if let Some(cmd) = cli.command {
        return run_command(cmd).await;
    }

    let pool = connect(&settings.db_url()).await.context("db connect")?;
    migrate(&pool).await.context("migrate")?;
    lens::services::legacy_migrate::migrate_if_needed(&pool)
        .await
        .context("legacy_migrate")?;

    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));

    ensure_admin_password(
        cfg.clone(),
        &settings.data_dir,
        settings.bootstrap_admin_password.clone(),
    )
    .await?;

    lens::services::migration::seed_if_empty(nav.clone() as _, cfg.clone() as _).await?;

    let state = AppState::new(nav, cfg, settings.data_dir.clone());
    let app = build_app(
        state,
        session_layer(pool.clone(), settings.secure_cookies),
        settings.static_dir.clone(),
    );
    tokio::spawn(run_pruner(pool));

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    let listener = TcpListener::bind(addr).await.context("bind")?;
    tracing::info!(%addr, "lens listening");
    // ConnectInfo<SocketAddr> is required by tower_governor's SmartIpKeyExtractor
    // peer-IP fallback path (see routes/auth.rs).
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .context("serve")?;
    Ok(())
}

fn init_tracing(filter: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let env = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info"));
    fmt()
        .with_env_filter(env)
        .with_target(false)
        .compact()
        .init();
}
