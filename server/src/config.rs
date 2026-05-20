//! Runtime configuration loaded from env (with optional .env).

use figment::providers::Env;
use figment::Figment;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    /// TCP port to listen on.
    #[serde(default = "default_port")]
    pub port: u16,
    /// Directory holding `data.db`, `INITIAL_PASSWORD.txt`, and the icon cache.
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
    /// Directory holding the SvelteKit build output (HTML/JS/CSS).
    #[serde(default = "default_static_dir")]
    pub static_dir: PathBuf,
    /// Initial admin password, if provided. When None, a random one is generated on first boot.
    pub bootstrap_admin_password: Option<String>,
    /// Set true on prod deployments to require Secure cookies.
    #[serde(default)]
    pub secure_cookies: bool,
    /// `tracing-subscriber` env filter, e.g. "info,sqlx=warn".
    #[serde(default = "default_log")]
    pub rust_log: String,
}

fn default_port() -> u16 {
    8080
}
fn default_data_dir() -> PathBuf {
    PathBuf::from("./dev-data")
}
fn default_static_dir() -> PathBuf {
    PathBuf::from("../web/build")
}
fn default_log() -> String {
    "info,sqlx=warn,tower_http=info".into()
}

impl Settings {
    pub fn load() -> anyhow::Result<Self> {
        // Best-effort .env loading; ignore if missing.
        let _ = dotenvy::dotenv();
        let s: Settings = Figment::new().merge(Env::raw().split("__")).extract()?;
        std::fs::create_dir_all(&s.data_dir)?;
        Ok(s)
    }

    pub fn db_url(&self) -> String {
        let path = self.data_dir.join("data.db");
        format!("sqlite://{}?mode=rwc", path.display())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        // SAFETY: this is single-threaded test code; std::env safe in tests.
        std::env::remove_var("PORT");
        std::env::remove_var("DATA_DIR");
        std::env::remove_var("STATIC_DIR");
        std::env::remove_var("BOOTSTRAP_ADMIN_PASSWORD");
        std::env::remove_var("SECURE_COOKIES");
        std::env::remove_var("RUST_LOG");
        let s = Settings::load().unwrap();
        assert_eq!(s.port, 8080);
        assert!(s.data_dir.ends_with("dev-data"));
        assert!(!s.secure_cookies);
        assert!(s.bootstrap_admin_password.is_none());
    }

    #[test]
    fn db_url_uses_data_dir() {
        let s = Settings {
            port: 8080,
            data_dir: PathBuf::from("/tmp/x"),
            static_dir: PathBuf::from("/tmp/static"),
            bootstrap_admin_password: None,
            secure_cookies: false,
            rust_log: "info".into(),
        };
        assert_eq!(s.db_url(), "sqlite:///tmp/x/data.db?mode=rwc");
    }
}
