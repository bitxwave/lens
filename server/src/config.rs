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
    /// Favicon provider URL template; `{host}` is substituted at fetch
    /// time. Defaults to Google s2. Override on intranet deployments
    /// where Google is unreachable (e.g. DuckDuckGo's `ip3` endpoint).
    #[serde(default = "default_favicon_provider")]
    pub favicon_provider_url: String,
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
fn default_favicon_provider() -> String {
    crate::services::favicon::DEFAULT_PROVIDER_URL.into()
}

impl Settings {
    pub fn load() -> anyhow::Result<Self> {
        // Best-effort .env loading; ignore if missing.
        let _ = dotenvy::dotenv();
        // Two layers, last-merge-wins:
        //
        // 1. `Env::raw()` reads bare names like `PORT`, `DATA_DIR`,
        //    `BOOTSTRAP_ADMIN_PASSWORD`. The Dockerfile, docker-compose,
        //    and the existing operator-facing docs all use this form
        //    and we don't want to break them silently.
        // 2. `Env::prefixed("LENS_")` reads `LENS_PORT` etc. and strips
        //    the prefix. Layered second, it overrides the bare reading
        //    when both are set — useful when `PORT` is already taken
        //    by another tenant in the same shell / container.
        //
        // Field-name typos still get silently swallowed by figment
        // (the field doesn't exist on `Settings` so no error fires);
        // the prefix doesn't change that. What it DOES give us is a
        // way for new deployments to opt out of bare-name collisions.
        let s: Settings = Figment::new()
            .merge(Env::raw())
            .merge(Env::prefixed("LENS_"))
            .extract()?;
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

    /// `cargo test` runs cases on the same thread pool, and they all
    /// poke at the process-wide environment. Hold this mutex across
    /// any test that mutates env vars to keep them serialised. Other
    /// tests in the crate that touch env (notably `tests/cli.rs`)
    /// run in their own process, so they don't need this lock.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn clear_env() {
        for k in [
            "PORT",
            "DATA_DIR",
            "STATIC_DIR",
            "BOOTSTRAP_ADMIN_PASSWORD",
            "SECURE_COOKIES",
            "RUST_LOG",
            "FAVICON_PROVIDER_URL",
            "LENS_PORT",
            "LENS_DATA_DIR",
            "LENS_STATIC_DIR",
            "LENS_BOOTSTRAP_ADMIN_PASSWORD",
            "LENS_SECURE_COOKIES",
            "LENS_RUST_LOG",
            "LENS_FAVICON_PROVIDER_URL",
        ] {
            std::env::remove_var(k);
        }
    }

    #[test]
    fn defaults_are_sane() {
        let _g = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear_env();
        let s = Settings::load().unwrap();
        assert_eq!(s.port, 8080);
        assert!(s.data_dir.ends_with("dev-data"));
        assert!(!s.secure_cookies);
        assert!(s.bootstrap_admin_password.is_none());
        assert!(s.favicon_provider_url.contains("{host}"));
    }

    #[test]
    fn lens_prefix_overrides_bare_name() {
        let _g = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear_env();
        std::env::set_var("PORT", "8000");
        std::env::set_var("LENS_PORT", "9000");
        let s = Settings::load().unwrap();
        // LENS_ wins because it merges last.
        assert_eq!(s.port, 9000);
        clear_env();
    }

    #[test]
    fn bare_names_still_accepted_back_compat() {
        let _g = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear_env();
        std::env::set_var("PORT", "8000");
        let s = Settings::load().unwrap();
        assert_eq!(s.port, 8000);
        clear_env();
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
            favicon_provider_url: default_favicon_provider(),
        };
        assert_eq!(s.db_url(), "sqlite:///tmp/x/data.db?mode=rwc");
    }
}
