use anyhow::Context;
use clap::{Parser, Subcommand};
use std::io::{self, Write};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::auth::password;
use crate::config::Settings;
use crate::db::{connect, migrate};
use crate::repo::{config_keys as k, ConfigRepo, SqlxConfigRepo};

const HEALTHCHECK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Parser, Debug)]
#[command(name = "lens", version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Reset the admin password. Reads new password from --password or stdin.
    ResetPassword {
        /// New password. If omitted, prompted on stdin.
        #[arg(long)]
        password: Option<String>,
    },
    /// Probe the running server's /api/health and exit non-zero if it is not healthy.
    /// Used by the Docker HEALTHCHECK, since the distroless image has no shell or curl.
    Healthcheck,
}

pub async fn run_command(cmd: Command) -> anyhow::Result<()> {
    match cmd {
        Command::Healthcheck => {
            let settings = Settings::load()?;
            healthcheck(settings.port).await
        }
        Command::ResetPassword { password: maybe } => {
            let settings = Settings::load()?;
            let pool = connect(&settings.db_url()).await.context("db connect")?;
            migrate(&pool).await.context("migrate")?;
            let cfg: std::sync::Arc<dyn ConfigRepo> =
                std::sync::Arc::new(SqlxConfigRepo::new(pool.clone()));
            let pw = match maybe {
                Some(p) => p,
                None => {
                    let mut buf = String::new();
                    print!("New admin password: ");
                    io::stdout().flush().ok();
                    io::stdin().read_line(&mut buf).context("read stdin")?;
                    buf.trim().to_string()
                }
            };
            if pw.len() < 8 {
                anyhow::bail!("password must be at least 8 chars");
            }
            let hash = password::hash(&pw)?;
            let now = chrono::Utc::now().timestamp_millis().to_string();
            cfg.upsert_many(&[
                (k::ADMIN_PASSWORD_HASH, &hash),
                (k::ADMIN_PASSWORD_UPDATED_AT, &now),
            ])
            .await?;

            // Invalidate all sessions.
            sqlx::query("DELETE FROM tower_sessions")
                .execute(&pool)
                .await?;

            // Remove leftover INITIAL_PASSWORD.txt if any. Async fs is fine
            // here even though the CLI itself is short-lived — keeps the
            // idiom consistent with the request-time path in routes/config.rs.
            let initial = settings.data_dir.join("INITIAL_PASSWORD.txt");
            match tokio::fs::remove_file(&initial).await {
                Ok(()) | Err(_) => {}
            }

            println!("Admin password reset; all sessions invalidated.");
            Ok(())
        }
    }
}

async fn healthcheck(port: u16) -> anyhow::Result<()> {
    let probe = async {
        let mut stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .context("connect")?;
        stream
            .write_all(b"GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .context("send request")?;
        let mut resp = Vec::new();
        stream
            .read_to_end(&mut resp)
            .await
            .context("read response")?;
        anyhow::Ok(resp)
    };
    let resp = tokio::time::timeout(HEALTHCHECK_TIMEOUT, probe)
        .await
        .context("timed out")??;
    if !resp.starts_with(b"HTTP/1.1 200") {
        let status_line =
            String::from_utf8_lossy(resp.split(|&b| b == b'\r').next().unwrap_or_default());
        anyhow::bail!("unhealthy: {status_line}");
    }
    Ok(())
}
