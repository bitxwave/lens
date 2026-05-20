use anyhow::Context;
use clap::{Parser, Subcommand};
use std::io::{self, Write};

use crate::auth::password;
use crate::config::Settings;
use crate::db::{connect, migrate};
use crate::repo::{ConfigRepo, SqlxConfigRepo};

#[derive(Parser, Debug)]
#[command(name = "navsrv", version)]
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
}

pub async fn run_command(cmd: Command) -> anyhow::Result<()> {
    match cmd {
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
                ("admin_password_hash", &hash),
                ("admin_password_updated_at", &now),
            ])
            .await?;

            // Invalidate all sessions.
            sqlx::query("DELETE FROM tower_sessions")
                .execute(&pool)
                .await?;

            // Remove leftover INITIAL_PASSWORD.txt if any.
            let initial = settings.data_dir.join("INITIAL_PASSWORD.txt");
            if initial.exists() {
                let _ = std::fs::remove_file(&initial);
            }

            println!("Admin password reset; all sessions invalidated.");
            Ok(())
        }
    }
}
