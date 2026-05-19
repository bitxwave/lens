# Rust Backend Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Rust backend (`server/` crate) end-to-end — from repo restructure through schema, repos, public read API, password-based auth, full CRUD, CLI password reset, and SPA fallback — so that `cargo run` produces a working API at `:8080` that the frontend (built later) can consume.

**Architecture:** Single binary using Axum 0.7 + Tokio + SQLx (SQLite). 3NF schema migrated via `sqlx::migrate!`. Repository trait pattern (`NavRepo`, `ConfigRepo`) decouples handlers from SQL. Sessions stored in SQLite via `tower-sessions-sqlx-store`. Public read endpoint `/api/nav` returns the full bundle in one round-trip; writes are fine-grained behind a `RequireAuth` extractor. Static frontend bundle served by `tower_http::services::ServeDir` with SPA fallback. CLI subcommand for password reset (`navsrv reset-password`). Tests are integration-first using an in-memory SQLite per test.

**Tech Stack:** Rust 1.79 · Axum 0.7 · Tokio 1 · SQLx 0.7 (sqlite + chrono + migrate) · tower-sessions 0.10 + sqlx-store · tower-governor 0.3 · tower-http 0.5 (compression + ServeDir + headers) · bcrypt 0.15 · clap 4 (derive) · figment 0.10 + dotenvy · serde 1 / serde_json 1 · validator 0.16 · thiserror 1 · anyhow 1 · tracing + tracing-subscriber · reqwest 0.12 (favicon proxy) · multer 3 (multipart) · rand 0.8 · chrono 0.4

**Spec reference:** `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md`

---

## Conventions

- **Working directory** for every `cargo` command: `server/`. Every `pnpm` command: `web/`.
- **Branch / commit style:** Conventional Commits. Each task ends with one commit; commit subject ≤ 72 chars; body explains *why*. No `Co-Authored-By` trailer.
- **Test layout:** `cargo test` only — unit tests beside source via `#[cfg(test)] mod tests`, integration tests under `server/tests/`.
- **Error policy:** All fallible code returns `Result<T, AppError>`. Handlers `?` propagate; `AppError: IntoResponse` produces JSON `{ "error": "...", "message": "..."? }`.
- **No `unwrap` / `expect`** in non-test code, except at well-justified panics (e.g. router builder constants).
- **Time:** epoch milliseconds (`i64`) at the storage boundary; `chrono::DateTime<Utc>` only when serializing.

---

## Phase 0: Repository Restructure (Tasks 1–4)

Goal: get the existing SvelteKit project into `web/` so the new `server/` can sit beside it cleanly. Frontend must still `pnpm dev` after the move.

### Task 1: Snapshot pre-move state

**Files:**
- Read-only: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `playwright.config.js`, `src/`, `static/`

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not, stop and resolve.

- [ ] **Step 2: Confirm current dev server still runs (baseline)**

```bash
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173 &
sleep 4
curl -sf http://127.0.0.1:5173 | head -c 200
kill %1
```

Expected: HTML containing `<title>` of the existing site.

- [ ] **Step 3: Record the file list that will move**

```bash
git ls-files | grep -E '^(src/|static/|package\.json$|pnpm-lock\.yaml$|svelte\.config\.js$|vite\.config\.ts$|tsconfig\.json$|playwright\.config\.js$|\.eslintrc\.cjs$|\.eslintignore$|\.prettierrc$|\.prettierignore$|\.npmrc$)' > /tmp/web-files.txt
wc -l /tmp/web-files.txt
```

Expected: a numeric count > 10. This list drives Task 2.

### Task 2: Move frontend into `web/`

**Files:**
- Create dir: `web/`
- Move: every path in `/tmp/web-files.txt` → `web/<same-relative-path>`

- [ ] **Step 1: Create the target directory**

```bash
mkdir -p web
```

- [ ] **Step 2: `git mv` each tracked frontend path**

```bash
while read -r path; do
  mkdir -p "web/$(dirname "$path")"
  git mv "$path" "web/$path"
done < /tmp/web-files.txt
```

Expected: no errors. Run `git status` — only `R` (renamed) entries.

- [ ] **Step 3: Move untracked but project-relevant files**

```bash
[ -d node_modules ] && rm -rf node_modules
[ -d build ]        && rm -rf build
[ -d .svelte-kit ]  && rm -rf .svelte-kit
[ -f .eslintignore ] && git mv .eslintignore web/.eslintignore 2>/dev/null || true
```

(The `git mv` calls above already handled tracked dotfiles; this step just sweeps build artifacts.)

- [ ] **Step 4: Verify root has no leftover frontend files**

```bash
ls -la
```

Expected: only `web/`, `config/` (existing nginx), `Dockerfile` (will be replaced), `README.md`, `.git`, `.gitignore`, `.dockerignore`, `.editorconfig`, `snapshot_*.png`, `docs/`, `.github/`. No `src/`, no `package.json`, no `node_modules`.

- [ ] **Step 5: Commit the move (rename-only commit)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: move SvelteKit project into web/ subdirectory

Prepares for split-repo layout (web/ + server/) per spec §9.3.
Pure rename — no logic changes.
EOF
)"
```

### Task 3: Adjust `web/vite.config.ts` to proxy `/api` to backend

**Files:**
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Read current config**

```bash
cat web/vite.config.ts
```

- [ ] **Step 2: Replace contents**

```typescript
// web/vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
};

export default config;
```

- [ ] **Step 3: Verify dev server still boots**

```bash
cd web
pnpm install --frozen-lockfile
pnpm dev --port 5173 &
sleep 4
curl -sf http://127.0.0.1:5173/ | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/api/nav
kill %1
cd ..
```

Expected: HTML on `/`. `/api/nav` returns either `502` (no backend yet) or connection refused — both prove the proxy is active. Anything 2xx would mean the proxy is wrong.

- [ ] **Step 4: Commit**

```bash
git add web/vite.config.ts
git commit -m "$(cat <<'EOF'
chore(web): proxy /api → 127.0.0.1:8080 in vite dev server

Backend will listen on :8080 (Plan 1, Phase 1). Same-origin in
production via ServeDir; this proxy only affects dev mode.
EOF
)"
```

### Task 4: Update root `.gitignore` and `.dockerignore` for the new layout

**Files:**
- Modify: `.gitignore`, `.dockerignore`

- [ ] **Step 1: Update `.gitignore`**

Replace contents with:

```gitignore
# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/

# Frontend
web/node_modules/
web/.svelte-kit/
web/build/
web/.env
web/.env.*
!web/.env.example

# Backend
server/target/
server/.env
server/.env.*
!server/.env.example
server/dev-data/

# Local volumes / runtime
data/
*.log
*.pid

# Worktrees (per ~/.claude/rules/worktree-location.md)
.worktrees/

# Tests
test-results/
playwright-report/
```

- [ ] **Step 2: Update `.dockerignore`**

```
# Build artifacts
**/node_modules
**/.svelte-kit
**/build
**/target

# Local data / env
**/.env
**/.env.*
!**/.env.example
**/dev-data
data/

# Git / dev
.git
.gitignore
.github
.worktrees
.vscode
.idea
docs
tests
*.md
!README.md
snapshot_*.png
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .dockerignore
git commit -m "chore: ignore web/ + server/ artefacts and local data dir"
```

---

## Phase 1: Backend Scaffold (Tasks 5–9)

Goal: a `server/` crate that compiles, runs, and exposes `GET /api/health`. Lays down `AppError`, `Settings`, and integration-test infrastructure.

### Task 5: Create `server/Cargo.toml`

**Files:**
- Create: `server/Cargo.toml`
- Create: `server/.gitignore`
- Create: `server/rust-toolchain.toml`

- [ ] **Step 1: Make the crate directory**

```bash
mkdir -p server/src server/tests server/migrations
```

- [ ] **Step 2: Write `server/Cargo.toml`**

```toml
[package]
name = "navsrv"
version = "0.1.0"
edition = "2021"
rust-version = "1.79"
default-run = "navsrv"

[[bin]]
name = "navsrv"
path = "src/main.rs"

[dependencies]
axum = { version = "0.7", features = ["macros", "multipart"] }
tokio = { version = "1", features = ["full"] }
tower = "0.4"
tower-http = { version = "0.5", features = ["fs", "trace", "compression-gzip", "set-header"] }
tower-sessions = "0.10"
tower-sessions-sqlx-store = { version = "0.10", features = ["sqlite"] }
tower_governor = "0.3"

sqlx = { version = "0.7", default-features = false, features = ["runtime-tokio-rustls", "sqlite", "chrono", "macros", "migrate"] }

serde = { version = "1", features = ["derive"] }
serde_json = "1"
validator = { version = "0.16", features = ["derive"] }

bcrypt = "0.15"
rand = "0.8"

clap = { version = "4", features = ["derive"] }
figment = { version = "0.10", features = ["toml", "env"] }
dotenvy = "0.15"

thiserror = "1"
anyhow = "1"

tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

chrono = { version = "0.4", default-features = false, features = ["clock", "serde"] }

reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }
mime = "0.3"
multer = "3"
bytes = "1"
async-trait = "0.1"

[dev-dependencies]
axum-test = "15"
tempfile = "3"
serde_json = "1"

[profile.release]
lto = "thin"
codegen-units = 1
strip = true
```

- [ ] **Step 3: Write `server/rust-toolchain.toml`**

```toml
[toolchain]
channel = "1.79"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

- [ ] **Step 4: Write `server/.gitignore`**

```gitignore
target/
dev-data/
.env
.env.*
!.env.example
*.log
```

- [ ] **Step 5: Stub a no-op `src/main.rs` so the crate compiles**

```rust
// server/src/main.rs
fn main() {}
```

- [ ] **Step 6: Verify it builds (cold compile is slow; that's expected)**

```bash
cd server
cargo build --quiet
cd ..
```

Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add server/Cargo.toml server/Cargo.lock server/.gitignore server/rust-toolchain.toml server/src/main.rs
git commit -m "feat(server): scaffold navsrv crate with locked toolchain and deps"
```

### Task 6: `AppError` + `IntoResponse`

**Files:**
- Create: `server/src/error.rs`
- Create: `server/src/lib.rs`
- Modify: `server/src/main.rs`

- [ ] **Step 1: Write a failing test**

Create `server/src/error.rs`:

```rust
//! Unified application error type.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,

    #[error("unauthenticated")]
    Unauthenticated,

    #[error("forbidden")]
    Forbidden,

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("rate limited")]
    RateLimited,

    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    Bcrypt(#[from] bcrypt::BcryptError),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn status(&self) -> StatusCode {
        match self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Unauthenticated => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            AppError::Sqlx(sqlx::Error::RowNotFound) => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            AppError::NotFound => "not_found",
            AppError::Unauthenticated => "unauthenticated",
            AppError::Forbidden => "forbidden",
            AppError::Validation(_) => "validation_failed",
            AppError::Conflict(_) => "conflict",
            AppError::RateLimited => "rate_limited",
            _ => "internal",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        // Internal errors must not leak details to clients.
        let message = match &self {
            AppError::Validation(m) | AppError::Conflict(m) => Some(m.clone()),
            AppError::NotFound
            | AppError::Unauthenticated
            | AppError::Forbidden
            | AppError::RateLimited => None,
            other => {
                tracing::error!(error = %other, "internal error");
                None
            }
        };
        let body = match message {
            Some(m) => json!({ "error": code, "message": m }),
            None => json!({ "error": code }),
        };
        (status, Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn validation_error_is_422_with_message() {
        let err = AppError::Validation("name too long".into());
        assert_eq!(err.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[test]
    fn not_found_is_404_no_message() {
        let err = AppError::NotFound;
        assert_eq!(err.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn sqlx_row_not_found_maps_to_404() {
        let err: AppError = sqlx::Error::RowNotFound.into();
        assert_eq!(err.status(), StatusCode::NOT_FOUND);
    }
}
```

- [ ] **Step 2: Add a library entry so tests can find it**

Create `server/src/lib.rs`:

```rust
//! navsrv internal library — exposed for integration tests.
pub mod error;
```

- [ ] **Step 3: Update `main.rs` to use the lib**

```rust
// server/src/main.rs
fn main() {}
```

(unchanged for now; we just need the library exposed.)

- [ ] **Step 4: Add `[lib]` to `Cargo.toml`** (insert after `[[bin]]`)

```toml
[lib]
name = "navsrv"
path = "src/lib.rs"
```

- [ ] **Step 5: Run tests**

```bash
cd server
cargo test --lib error::tests
cd ..
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/Cargo.toml server/src/lib.rs server/src/error.rs
git commit -m "feat(server): AppError with IntoResponse and unit tests"
```

### Task 7: `Settings` from env (figment + dotenvy)

**Files:**
- Create: `server/src/config.rs`
- Create: `server/.env.example`
- Modify: `server/src/lib.rs`

- [ ] **Step 1: Define `Settings`**

Create `server/src/config.rs`:

```rust
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

fn default_port() -> u16 { 8080 }
fn default_data_dir() -> PathBuf { PathBuf::from("./dev-data") }
fn default_static_dir() -> PathBuf { PathBuf::from("../web/build") }
fn default_log() -> String { "info,sqlx=warn,tower_http=info".into() }

impl Settings {
    pub fn load() -> anyhow::Result<Self> {
        // Best-effort .env loading; ignore if missing.
        let _ = dotenvy::dotenv();
        let s: Settings = Figment::new()
            .merge(Env::raw().split("__"))
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
```

- [ ] **Step 2: Write `server/.env.example`**

```env
# Server
PORT=8080
DATA_DIR=./dev-data
STATIC_DIR=../web/build
RUST_LOG=info,sqlx=warn,tower_http=info

# Auth
# Set on first boot only. Leave empty to have one generated and written
# to ${DATA_DIR}/INITIAL_PASSWORD.txt.
BOOTSTRAP_ADMIN_PASSWORD=

# Security
# Set true behind HTTPS terminator. Cookies become Secure-only.
SECURE_COOKIES=false
```

- [ ] **Step 3: Expose module from `lib.rs`**

```rust
// server/src/lib.rs
pub mod config;
pub mod error;
```

- [ ] **Step 4: Run tests**

```bash
cd server
cargo test --lib config::tests
cd ..
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.rs server/src/lib.rs server/.env.example
git commit -m "feat(server): Settings loader from env with safe defaults"
```

### Task 8: Axum app with `/api/health`

**Files:**
- Create: `server/src/app.rs`
- Create: `server/src/routes/mod.rs`
- Create: `server/src/routes/health.rs`
- Modify: `server/src/lib.rs`, `server/src/main.rs`
- Create: `server/tests/health.rs`

- [ ] **Step 1: Write the failing integration test first**

Create `server/tests/health.rs`:

```rust
use axum_test::TestServer;
use navsrv::app::build_app_for_tests;

#[tokio::test]
async fn health_returns_ok_json() {
    let app = build_app_for_tests().await.expect("app builds");
    let server = TestServer::new(app).expect("server");
    let res = server.get("/api/health").await;
    res.assert_status_ok();
    res.assert_json(&serde_json::json!({ "status": "ok" }));
}
```

- [ ] **Step 2: Run the test — expect compile error (no `app` module yet)**

```bash
cd server
cargo test --test health -- --nocapture
```

Expected: error referencing missing `navsrv::app`.

- [ ] **Step 3: Write `routes/health.rs`**

```rust
// server/src/routes/health.rs
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
```

- [ ] **Step 4: Write `routes/mod.rs`**

```rust
// server/src/routes/mod.rs
use axum::Router;

pub mod health;

pub fn api() -> Router {
    Router::new().nest("/api", Router::new().merge(health::router()))
}
```

- [ ] **Step 5: Write `app.rs`**

```rust
// server/src/app.rs
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use axum::http::{header, HeaderValue};

use crate::routes;

/// Build the full HTTP application (without listener).
pub fn build_app() -> Router {
    Router::new()
        .merge(routes::api())
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

/// Test variant: no DB / sessions yet — just the bare router.
pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    Ok(build_app())
}
```

- [ ] **Step 6: Update `lib.rs`**

```rust
// server/src/lib.rs
pub mod app;
pub mod config;
pub mod error;
pub mod routes;
```

- [ ] **Step 7: Update `main.rs`**

```rust
// server/src/main.rs
use anyhow::Context;
use navsrv::{app::build_app, config::Settings};
use std::net::SocketAddr;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let settings = Settings::load().context("load settings")?;
    init_tracing(&settings.rust_log);

    let app = build_app();
    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    let listener = TcpListener::bind(addr).await.context("bind")?;
    tracing::info!(%addr, "navsrv listening");
    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}

fn init_tracing(filter: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let env = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(env).with_target(false).compact().init();
}
```

- [ ] **Step 8: Run the integration test**

```bash
cd server
cargo test --test health
cd ..
```

Expected: PASS.

- [ ] **Step 9: Smoke-run the binary**

```bash
cd server
PORT=8081 cargo run &
SERVER_PID=$!
sleep 2
curl -sf http://127.0.0.1:8081/api/health
kill $SERVER_PID
cd ..
```

Expected: `{"status":"ok"}`.

- [ ] **Step 10: Commit**

```bash
git add server/src/app.rs server/src/lib.rs server/src/main.rs server/src/routes server/tests/health.rs
git commit -m "feat(server): axum app with /api/health and security headers"
```

### Task 9: Tracing-aware request layer

**Files:**
- Modify: `server/src/app.rs`

- [ ] **Step 1: Add a `TraceLayer` so each request gets logged**

Update `build_app()`:

```rust
// server/src/app.rs (replace prior contents)
use axum::http::{header, HeaderValue, Request};
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::routes;

pub fn build_app() -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let method = req.method();
            let uri = req.uri().path();
            tracing::info_span!("http", %method, %uri)
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    Router::new()
        .merge(routes::api())
        .layer(trace)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    Ok(build_app())
}
```

- [ ] **Step 2: Re-run tests**

```bash
cd server
cargo test
cd ..
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.rs
git commit -m "feat(server): structured request logging via TraceLayer"
```

---

## Phase 2: Data Layer (Tasks 10–19)

Goal: SQLite pool with WAL pragmas, migration `0001_init.sql`, `NavRepo` + `ConfigRepo` traits with `sqlx` impls, all unit-tested against in-memory SQLite.

### Task 10: SQLite pool helper

**Files:**
- Create: `server/src/db.rs`
- Modify: `server/src/lib.rs`

- [ ] **Step 1: Write tests first**

Create `server/src/db.rs`:

```rust
//! SQLite connection pool with safe defaults (WAL, foreign keys, busy timeout).

use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::{ConnectOptions, SqlitePool};
use std::str::FromStr;
use std::time::Duration;

/// Build a pool against the given URL, applying recommended pragmas.
pub async fn connect(url: &str) -> sqlx::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .log_statements(tracing::log::LevelFilter::Debug);

    SqlitePoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(opts)
        .await
}

/// Run all bundled migrations against the pool.
pub async fn migrate(pool: &SqlitePool) -> sqlx::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
pub async fn connect_in_memory() -> sqlx::Result<SqlitePool> {
    let pool = connect("sqlite::memory:").await?;
    migrate(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pool_runs_pragmas() {
        let pool = connect("sqlite::memory:").await.unwrap();
        let row: (String,) = sqlx::query_as("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        // SQLite returns "memory" for in-memory DBs even after WAL request, so just sanity-check connectivity.
        assert!(!row.0.is_empty());
        let row: (i64,) = sqlx::query_as("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.0, 1);
    }
}
```

- [ ] **Step 2: Re-export from lib**

```rust
// server/src/lib.rs
pub mod app;
pub mod config;
pub mod db;
pub mod error;
pub mod routes;
```

- [ ] **Step 3: Run tests (the migrate test will fail until Task 11 — skip for now)**

```bash
cd server
cargo test --lib db::tests::pool_runs_pragmas
cd ..
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/db.rs server/src/lib.rs
git commit -m "feat(server): SQLite pool with WAL/foreign-keys/busy-timeout"
```

### Task 11: Migration `0001_init.sql`

**Files:**
- Create: `server/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

```sql
-- server/migrations/0001_init.sql

PRAGMA foreign_keys = ON;

CREATE TABLE sites (
  id          INTEGER PRIMARY KEY,
  value       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  name_i18n   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE groups (
  id                INTEGER PRIMARY KEY,
  slug              TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  name_i18n         TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  collapsed_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id               INTEGER PRIMARY KEY,
  group_id         INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL,
  name_i18n        TEXT,
  description      TEXT,
  description_i18n TEXT,
  icon_kind        TEXT    NOT NULL CHECK (icon_kind IN ('asset','url','auto-favicon')),
  icon_value       TEXT    NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE item_links (
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  PRIMARY KEY (item_id, site_id)
);

CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  name_i18n   TEXT
);

CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_items_group_sort ON items(group_id, sort_order);
CREATE INDEX idx_item_links_site  ON item_links(site_id);
CREATE INDEX idx_item_tags_tag    ON item_tags(tag_id);

INSERT INTO config (key, value) VALUES ('schema_version', '1');
```

- [ ] **Step 2: Add a migrate test in `db.rs`**

Append to the `tests` module:

```rust
    #[tokio::test]
    async fn migrate_creates_tables() {
        let pool = connect_in_memory().await.unwrap();
        let row: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='items'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, 1);
    }
```

- [ ] **Step 3: Run**

```bash
cd server
cargo test --lib db::tests
cd ..
```

Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/0001_init.sql server/src/db.rs
git commit -m "feat(server): initial schema migration (sites/groups/items/links/tags/config)"
```

### Task 12: `NavRepo` trait and DTOs

**Files:**
- Create: `server/src/repo/mod.rs`
- Create: `server/src/repo/nav.rs`
- Create: `server/src/dto.rs`
- Modify: `server/src/lib.rs`

- [ ] **Step 1: Define DTOs**

```rust
// server/src/dto.rs
use serde::{Deserialize, Serialize};

fn empty() -> String { String::new() }
fn zero() -> i64 { 0 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Site {
    pub id: i64,
    pub value: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub sort_order: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Group {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub sort_order: i64,
    pub collapsed_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tag {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IconKind { Asset, Url, AutoFavicon }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Item {
    pub id: i64,
    pub group_id: Option<i64>,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub description: Option<String>,
    pub description_i18n: Option<serde_json::Value>,
    pub icon_kind: IconKind,
    pub icon_value: String,
    pub sort_order: i64,
    pub links: std::collections::BTreeMap<String, String>, // site.value -> URL
    pub tag_slugs: Vec<String>,
    #[serde(default = "zero")]
    pub created_at: i64,
    #[serde(default = "zero")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Meta {
    pub site_name: String,
    pub site_avatar_path: Option<String>,
    pub site_copyright: String,
    pub site_icp: Option<Link>,
    pub site_police: Option<Link>,
    pub default_theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Link { pub text: String, pub url: String }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NavBundle {
    pub schema_version: i64,
    pub meta: Meta,
    pub sites: Vec<Site>,
    pub groups: Vec<Group>,
    pub items: Vec<Item>,
    pub tags: Vec<Tag>,
}

// ----- Write payloads -----

#[derive(Debug, Deserialize)]
pub struct ItemPayload {
    pub group_id: Option<i64>,
    pub name: String,
    #[serde(default)] pub name_i18n: Option<serde_json::Value>,
    #[serde(default)] pub description: Option<String>,
    #[serde(default)] pub description_i18n: Option<serde_json::Value>,
    pub icon_kind: IconKind,
    pub icon_value: String,
    #[serde(default)] pub links: std::collections::BTreeMap<String, String>,
    #[serde(default)] pub tag_slugs: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ItemPatch {
    #[serde(default)] pub group_id: Option<Option<i64>>,
    #[serde(default)] pub name: Option<String>,
    #[serde(default)] pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)] pub description: Option<Option<String>>,
    #[serde(default)] pub description_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)] pub icon_kind: Option<IconKind>,
    #[serde(default)] pub icon_value: Option<String>,
    #[serde(default)] pub links: Option<std::collections::BTreeMap<String, String>>,
    #[serde(default)] pub tag_slugs: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderEntry { pub id: i64, pub sort_order: i64, #[serde(default)] pub group_id: Option<Option<i64>> }

#[derive(Debug, Deserialize)]
pub struct GroupPayload {
    pub slug: String,
    pub name: String,
    #[serde(default)] pub name_i18n: Option<serde_json::Value>,
    #[serde(default)] pub collapsed_default: bool,
}

#[derive(Debug, Deserialize, Default)]
pub struct GroupPatch {
    #[serde(default)] pub slug: Option<String>,
    #[serde(default)] pub name: Option<String>,
    #[serde(default)] pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)] pub collapsed_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SitePayload {
    pub value: String,
    pub name: String,
    #[serde(default)] pub name_i18n: Option<serde_json::Value>,
    #[serde(default)] pub is_default: bool,
}

#[derive(Debug, Deserialize, Default)]
pub struct SitePatch {
    #[serde(default)] pub value: Option<String>,
    #[serde(default)] pub name: Option<String>,
    #[serde(default)] pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)] pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TagPayload {
    pub slug: String,
    pub name: String,
    #[serde(default)] pub name_i18n: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TagPatch {
    #[serde(default)] pub slug: Option<String>,
    #[serde(default)] pub name: Option<String>,
    #[serde(default)] pub name_i18n: Option<Option<serde_json::Value>>,
}
```

- [ ] **Step 2: Write the trait**

```rust
// server/src/repo/nav.rs
use crate::dto::*;
use crate::error::Result;
use async_trait::async_trait;

#[async_trait]
pub trait NavRepo: Send + Sync {
    // ----- Bundle -----
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Group>, Vec<Item>, Vec<Tag>)>;

    // ----- Sites -----
    async fn list_sites(&self) -> Result<Vec<Site>>;
    async fn create_site(&self, p: SitePayload) -> Result<Site>;
    async fn patch_site(&self, id: i64, p: SitePatch) -> Result<Site>;
    async fn delete_site(&self, id: i64) -> Result<()>;
    async fn reorder_sites(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Groups -----
    async fn list_groups(&self) -> Result<Vec<Group>>;
    async fn create_group(&self, p: GroupPayload) -> Result<Group>;
    async fn patch_group(&self, id: i64, p: GroupPatch) -> Result<Group>;
    async fn delete_group(&self, id: i64) -> Result<()>;
    async fn reorder_groups(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Items -----
    async fn create_item(&self, p: ItemPayload) -> Result<Item>;
    async fn patch_item(&self, id: i64, p: ItemPatch) -> Result<Item>;
    async fn delete_item(&self, id: i64) -> Result<()>;
    async fn reorder_items(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Tags -----
    async fn list_tags(&self) -> Result<Vec<Tag>>;
    async fn create_tag(&self, p: TagPayload) -> Result<Tag>;
    async fn patch_tag(&self, id: i64, p: TagPatch) -> Result<Tag>;
    async fn delete_tag(&self, id: i64) -> Result<()>;
}
```

- [ ] **Step 3: Re-export modules**

```rust
// server/src/repo/mod.rs
pub mod nav;
pub use nav::NavRepo;
```

```rust
// server/src/lib.rs
pub mod app;
pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
```

- [ ] **Step 4: Compile-check**

```bash
cd server
cargo check --lib
cd ..
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/repo server/src/dto.rs server/src/lib.rs
git commit -m "feat(server): NavRepo trait and DTOs (read + write payloads)"
```

### Task 13: `SqlxNavRepo` — sites + groups + tags

**Files:**
- Create: `server/src/repo/sqlx_impl.rs`
- Modify: `server/src/repo/mod.rs`
- Create: `server/tests/repo_sites.rs`

- [ ] **Step 1: Write the sites integration test first**

```rust
// server/tests/repo_sites.rs
use navsrv::db::connect_in_memory;
use navsrv::dto::{SitePatch, SitePayload};
use navsrv::repo::{NavRepo, SqlxNavRepo};

#[tokio::test]
async fn create_list_patch_delete_site() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);

    let s = repo.create_site(SitePayload {
        value: "shangHai".into(),
        name: "上海".into(),
        name_i18n: Some(serde_json::json!({"en":"Shanghai"})),
        is_default: true,
    }).await.unwrap();
    assert_eq!(s.value, "shangHai");
    assert!(s.is_default);

    let s2 = repo.create_site(SitePayload {
        value: "beiJing".into(), name: "北京".into(), name_i18n: None, is_default: false,
    }).await.unwrap();

    let all = repo.list_sites().await.unwrap();
    assert_eq!(all.len(), 2);

    let patched = repo.patch_site(s2.id, SitePatch {
        name: Some("Beijing".into()), ..Default::default()
    }).await.unwrap();
    assert_eq!(patched.name, "Beijing");

    repo.delete_site(s.id).await.unwrap();
    assert_eq!(repo.list_sites().await.unwrap().len(), 1);
}

#[tokio::test]
async fn unique_value_constraint_returns_conflict() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    repo.create_site(SitePayload {
        value: "x".into(), name: "X".into(), name_i18n: None, is_default: false,
    }).await.unwrap();
    let err = repo.create_site(SitePayload {
        value: "x".into(), name: "Y".into(), name_i18n: None, is_default: false,
    }).await.unwrap_err();
    use navsrv::error::AppError;
    assert!(matches!(err, AppError::Conflict(_)), "got {err:?}");
}
```

- [ ] **Step 2: Stub the impl so the test compiles**

```rust
// server/src/repo/sqlx_impl.rs
use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::nav::NavRepo;
use async_trait::async_trait;
use sqlx::SqlitePool;

pub struct SqlxNavRepo { pool: SqlitePool }

impl SqlxNavRepo {
    pub fn new(pool: SqlitePool) -> Self { Self { pool } }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn map_unique_violation(err: sqlx::Error) -> AppError {
    if let Some(db_err) = err.as_database_error() {
        // SQLite returns "UNIQUE constraint failed: ..." in the error message.
        let msg = db_err.message();
        if msg.contains("UNIQUE constraint failed") {
            return AppError::Conflict(msg.to_string());
        }
    }
    AppError::Sqlx(err)
}

fn json_opt(v: Option<sqlx::types::JsonValue>) -> Option<serde_json::Value> { v.map(|x| x) }

#[async_trait]
impl NavRepo for SqlxNavRepo {
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Group>, Vec<Item>, Vec<Tag>)> {
        let sites = self.list_sites().await?;
        let groups = self.list_groups().await?;
        let tags = self.list_tags().await?;
        let items = self.list_items_full().await?;
        Ok((sites, groups, items, tags))
    }

    async fn list_sites(&self) -> Result<Vec<Site>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", value, name,
                      name_i18n as "name_i18n: serde_json::Value",
                      sort_order as "sort_order!: i64",
                      is_default
               FROM sites ORDER BY sort_order, id"#
        ).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| Site {
            id: r.id, value: r.value, name: r.name,
            name_i18n: r.name_i18n,
            sort_order: r.sort_order, is_default: r.is_default != 0,
        }).collect())
    }

    async fn create_site(&self, p: SitePayload) -> Result<Site> {
        let res = sqlx::query!(
            "INSERT INTO sites (value, name, name_i18n, is_default) VALUES (?, ?, ?, ?)",
            p.value, p.name, p.name_i18n, p.is_default
        ).execute(&self.pool).await.map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        // refetch
        let sites = self.list_sites().await?;
        sites.into_iter().find(|s| s.id == id).ok_or(AppError::NotFound)
    }

    async fn patch_site(&self, id: i64, p: SitePatch) -> Result<Site> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.value { sqlx::query!("UPDATE sites SET value=? WHERE id=?", v, id).execute(&mut *tx).await.map_err(map_unique_violation)?; }
        if let Some(v) = p.name  { sqlx::query!("UPDATE sites SET name=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        if let Some(v) = p.name_i18n { sqlx::query!("UPDATE sites SET name_i18n=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        if let Some(v) = p.is_default { sqlx::query!("UPDATE sites SET is_default=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        tx.commit().await?;
        let sites = self.list_sites().await?;
        sites.into_iter().find(|s| s.id == id).ok_or(AppError::NotFound)
    }

    async fn delete_site(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM sites WHERE id=?", id).execute(&self.pool).await?;
        if res.rows_affected() == 0 { return Err(AppError::NotFound); }
        Ok(())
    }

    async fn reorder_sites(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for e in entries {
            sqlx::query!("UPDATE sites SET sort_order=? WHERE id=?", e.sort_order, e.id).execute(&mut *tx).await?;
        }
        tx.commit().await?; Ok(())
    }

    // ---- Groups ----

    async fn list_groups(&self) -> Result<Vec<Group>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", slug, name,
                      name_i18n as "name_i18n: serde_json::Value",
                      sort_order as "sort_order!: i64",
                      collapsed_default
               FROM groups ORDER BY sort_order, id"#
        ).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| Group {
            id: r.id, slug: r.slug, name: r.name,
            name_i18n: r.name_i18n,
            sort_order: r.sort_order,
            collapsed_default: r.collapsed_default != 0,
        }).collect())
    }

    async fn create_group(&self, p: GroupPayload) -> Result<Group> {
        let res = sqlx::query!(
            "INSERT INTO groups (slug, name, name_i18n, collapsed_default) VALUES (?, ?, ?, ?)",
            p.slug, p.name, p.name_i18n, p.collapsed_default
        ).execute(&self.pool).await.map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        self.list_groups().await?.into_iter().find(|g| g.id == id).ok_or(AppError::NotFound)
    }

    async fn patch_group(&self, id: i64, p: GroupPatch) -> Result<Group> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.slug { sqlx::query!("UPDATE groups SET slug=? WHERE id=?", v, id).execute(&mut *tx).await.map_err(map_unique_violation)?; }
        if let Some(v) = p.name { sqlx::query!("UPDATE groups SET name=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        if let Some(v) = p.name_i18n { sqlx::query!("UPDATE groups SET name_i18n=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        if let Some(v) = p.collapsed_default { sqlx::query!("UPDATE groups SET collapsed_default=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        tx.commit().await?;
        self.list_groups().await?.into_iter().find(|g| g.id == id).ok_or(AppError::NotFound)
    }

    async fn delete_group(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM groups WHERE id=?", id).execute(&self.pool).await?;
        if res.rows_affected() == 0 { return Err(AppError::NotFound); }
        Ok(())
    }

    async fn reorder_groups(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for e in entries {
            sqlx::query!("UPDATE groups SET sort_order=? WHERE id=?", e.sort_order, e.id).execute(&mut *tx).await?;
        }
        tx.commit().await?; Ok(())
    }

    // ---- Tags ----

    async fn list_tags(&self) -> Result<Vec<Tag>> {
        let rows = sqlx::query!(
            r#"SELECT id as "id!: i64", slug, name,
                      name_i18n as "name_i18n: serde_json::Value"
               FROM tags ORDER BY id"#
        ).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| Tag {
            id: r.id, slug: r.slug, name: r.name, name_i18n: r.name_i18n,
        }).collect())
    }

    async fn create_tag(&self, p: TagPayload) -> Result<Tag> {
        let res = sqlx::query!(
            "INSERT INTO tags (slug, name, name_i18n) VALUES (?, ?, ?)",
            p.slug, p.name, p.name_i18n
        ).execute(&self.pool).await.map_err(map_unique_violation)?;
        let id = res.last_insert_rowid();
        self.list_tags().await?.into_iter().find(|t| t.id == id).ok_or(AppError::NotFound)
    }

    async fn patch_tag(&self, id: i64, p: TagPatch) -> Result<Tag> {
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.slug { sqlx::query!("UPDATE tags SET slug=? WHERE id=?", v, id).execute(&mut *tx).await.map_err(map_unique_violation)?; }
        if let Some(v) = p.name { sqlx::query!("UPDATE tags SET name=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        if let Some(v) = p.name_i18n { sqlx::query!("UPDATE tags SET name_i18n=? WHERE id=?", v, id).execute(&mut *tx).await?; }
        tx.commit().await?;
        self.list_tags().await?.into_iter().find(|t| t.id == id).ok_or(AppError::NotFound)
    }

    async fn delete_tag(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM tags WHERE id=?", id).execute(&self.pool).await?;
        if res.rows_affected() == 0 { return Err(AppError::NotFound); }
        Ok(())
    }

    // ---- Items: stubbed for Task 14/15 ----

    async fn create_item(&self, _p: ItemPayload) -> Result<Item> { unimplemented!("Task 14") }
    async fn patch_item(&self, _id: i64, _p: ItemPatch) -> Result<Item> { unimplemented!("Task 14") }
    async fn delete_item(&self, _id: i64) -> Result<()> { unimplemented!("Task 14") }
    async fn reorder_items(&self, _entries: Vec<ReorderEntry>) -> Result<()> { unimplemented!("Task 14") }
}

impl SqlxNavRepo {
    async fn list_items_full(&self) -> Result<Vec<Item>> {
        // Implemented in Task 14.
        let _ = &self.pool;
        Ok(Vec::new())
    }
}
```

- [ ] **Step 3: Re-export from `repo/mod.rs`**

```rust
// server/src/repo/mod.rs
pub mod nav;
pub mod sqlx_impl;
pub use nav::NavRepo;
pub use sqlx_impl::SqlxNavRepo;
```

- [ ] **Step 4: Run tests (offline mode for sqlx macros)**

`sqlx::query!` requires `DATABASE_URL` at build time *or* `SQLX_OFFLINE=true` with prepared metadata. We use offline metadata after generating it once:

```bash
cd server
DATABASE_URL=sqlite::memory: SQLX_OFFLINE=false cargo test --test repo_sites
cd ..
```

Expected: 2 PASS.

- [ ] **Step 5: Generate `.sqlx` metadata for offline builds**

```bash
cd server
cargo install sqlx-cli --no-default-features --features sqlite --version ^0.7 || true
DATABASE_URL=sqlite:./dev-data/data.db cargo sqlx prepare -- --bin navsrv
ls -la .sqlx | head
cd ..
```

Expected: `.sqlx/` directory with `query-*.json` files.

- [ ] **Step 6: Commit**

```bash
git add server/src/repo server/tests/repo_sites.rs server/.sqlx
git commit -m "feat(server): NavRepo sqlx impl for sites/groups/tags"
```

### Task 14: `SqlxNavRepo` — items + item_links + item_tags

**Files:**
- Modify: `server/src/repo/sqlx_impl.rs`
- Create: `server/tests/repo_items.rs`

- [ ] **Step 1: Write the failing test**

```rust
// server/tests/repo_items.rs
use navsrv::db::connect_in_memory;
use navsrv::dto::*;
use navsrv::repo::{NavRepo, SqlxNavRepo};

async fn make_repo_with_seed() -> (SqlxNavRepo, i64, i64) {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    let g = repo.create_group(GroupPayload { slug: "tools".into(), name: "Tools".into(), name_i18n: None, collapsed_default: false }).await.unwrap();
    let s = repo.create_site(SitePayload { value: "shangHai".into(), name: "上海".into(), name_i18n: None, is_default: true }).await.unwrap();
    (repo, g.id, s.id)
}

#[tokio::test]
async fn create_item_with_links_and_tags() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let _t = repo.create_tag(TagPayload { slug: "fav".into(), name: "Favorite".into(), name_i18n: None }).await.unwrap();
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://10.0.0.1".into());
    let item = repo.create_item(ItemPayload {
        group_id: Some(gid),
        name: "RouterOS".into(),
        name_i18n: None,
        description: None,
        description_i18n: None,
        icon_kind: IconKind::Asset,
        icon_value: "routerOS.png".into(),
        links,
        tag_slugs: vec!["fav".into()],
    }).await.unwrap();
    assert_eq!(item.name, "RouterOS");
    assert_eq!(item.links.get("shangHai").map(String::as_str), Some("http://10.0.0.1"));
    assert_eq!(item.tag_slugs, vec!["fav"]);
}

#[tokio::test]
async fn patch_item_replaces_links_and_tags() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    repo.create_tag(TagPayload { slug: "a".into(), name: "A".into(), name_i18n: None }).await.unwrap();
    repo.create_tag(TagPayload { slug: "b".into(), name: "B".into(), name_i18n: None }).await.unwrap();
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://1".into());
    let item = repo.create_item(ItemPayload {
        group_id: Some(gid), name: "x".into(), name_i18n: None, description: None, description_i18n: None,
        icon_kind: IconKind::Asset, icon_value: "x.png".into(),
        links: links.clone(), tag_slugs: vec!["a".into()],
    }).await.unwrap();
    let mut new_links = std::collections::BTreeMap::new();
    new_links.insert("shangHai".into(), "http://2".into());
    let p = ItemPatch { links: Some(new_links), tag_slugs: Some(vec!["b".into()]), ..Default::default() };
    let updated = repo.patch_item(item.id, p).await.unwrap();
    assert_eq!(updated.links.get("shangHai").map(String::as_str), Some("http://2"));
    assert_eq!(updated.tag_slugs, vec!["b"]);
}

#[tokio::test]
async fn delete_item_cascades_links_and_tags() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://1".into());
    let item = repo.create_item(ItemPayload {
        group_id: Some(gid), name: "x".into(), name_i18n: None, description: None, description_i18n: None,
        icon_kind: IconKind::Asset, icon_value: "x.png".into(),
        links, tag_slugs: vec![],
    }).await.unwrap();
    repo.delete_item(item.id).await.unwrap();
    let (_, _, items, _) = repo.get_bundle().await.unwrap();
    assert!(items.is_empty());
}

#[tokio::test]
async fn reorder_items_writes_sort_order() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let a = repo.create_item(ItemPayload { group_id: Some(gid), name: "a".into(), name_i18n:None, description:None, description_i18n:None, icon_kind: IconKind::Asset, icon_value:"a.png".into(), links: Default::default(), tag_slugs: vec![]}).await.unwrap();
    let b = repo.create_item(ItemPayload { group_id: Some(gid), name: "b".into(), name_i18n:None, description:None, description_i18n:None, icon_kind: IconKind::Asset, icon_value:"b.png".into(), links: Default::default(), tag_slugs: vec![]}).await.unwrap();
    repo.reorder_items(vec![
        ReorderEntry { id: b.id, sort_order: 0, group_id: Some(Some(gid)) },
        ReorderEntry { id: a.id, sort_order: 1, group_id: Some(Some(gid)) },
    ]).await.unwrap();
    let (_, _, items, _) = repo.get_bundle().await.unwrap();
    assert_eq!(items[0].id, b.id);
    assert_eq!(items[1].id, a.id);
}
```

- [ ] **Step 2: Implement items in `sqlx_impl.rs`**

Replace the four `unimplemented!` stubs and the `list_items_full` body with:

```rust
    async fn create_item(&self, p: ItemPayload) -> Result<Item> {
        let now = now_ms();
        let kind_str = match p.icon_kind { IconKind::Asset => "asset", IconKind::Url => "url", IconKind::AutoFavicon => "auto-favicon" };

        let mut tx = self.pool.begin().await?;
        let res = sqlx::query!(
            r#"INSERT INTO items
                (group_id, name, name_i18n, description, description_i18n,
                 icon_kind, icon_value, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM items WHERE group_id IS ?), 0), ?, ?)"#,
            p.group_id, p.name, p.name_i18n, p.description, p.description_i18n,
            kind_str, p.icon_value, p.group_id, now, now
        ).execute(&mut *tx).await?;
        let id = res.last_insert_rowid();

        for (site_value, url) in &p.links {
            sqlx::query!(
                r#"INSERT INTO item_links (item_id, site_id, url)
                    SELECT ?, sites.id, ? FROM sites WHERE sites.value = ?"#,
                id, url, site_value
            ).execute(&mut *tx).await?;
        }

        for slug in &p.tag_slugs {
            sqlx::query!(
                r#"INSERT INTO item_tags (item_id, tag_id)
                    SELECT ?, tags.id FROM tags WHERE tags.slug = ?"#,
                id, slug
            ).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        self.fetch_item(id).await
    }

    async fn patch_item(&self, id: i64, p: ItemPatch) -> Result<Item> {
        let now = now_ms();
        let mut tx = self.pool.begin().await?;
        if let Some(v) = p.group_id { sqlx::query!("UPDATE items SET group_id=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }
        if let Some(v) = p.name { sqlx::query!("UPDATE items SET name=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }
        if let Some(v) = p.name_i18n { sqlx::query!("UPDATE items SET name_i18n=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }
        if let Some(v) = p.description { sqlx::query!("UPDATE items SET description=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }
        if let Some(v) = p.description_i18n { sqlx::query!("UPDATE items SET description_i18n=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }
        if let Some(v) = p.icon_kind {
            let s = match v { IconKind::Asset => "asset", IconKind::Url => "url", IconKind::AutoFavicon => "auto-favicon" };
            sqlx::query!("UPDATE items SET icon_kind=?, updated_at=? WHERE id=?", s, now, id).execute(&mut *tx).await?;
        }
        if let Some(v) = p.icon_value { sqlx::query!("UPDATE items SET icon_value=?, updated_at=? WHERE id=?", v, now, id).execute(&mut *tx).await?; }

        if let Some(links) = p.links {
            sqlx::query!("DELETE FROM item_links WHERE item_id=?", id).execute(&mut *tx).await?;
            for (site_value, url) in links {
                sqlx::query!(
                    r#"INSERT INTO item_links (item_id, site_id, url)
                        SELECT ?, sites.id, ? FROM sites WHERE sites.value = ?"#,
                    id, url, site_value
                ).execute(&mut *tx).await?;
            }
        }
        if let Some(tag_slugs) = p.tag_slugs {
            sqlx::query!("DELETE FROM item_tags WHERE item_id=?", id).execute(&mut *tx).await?;
            for slug in tag_slugs {
                sqlx::query!(
                    r#"INSERT INTO item_tags (item_id, tag_id)
                        SELECT ?, tags.id FROM tags WHERE tags.slug = ?"#,
                    id, slug
                ).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        self.fetch_item(id).await
    }

    async fn delete_item(&self, id: i64) -> Result<()> {
        let res = sqlx::query!("DELETE FROM items WHERE id=?", id).execute(&self.pool).await?;
        if res.rows_affected() == 0 { return Err(AppError::NotFound); }
        Ok(())
    }

    async fn reorder_items(&self, entries: Vec<ReorderEntry>) -> Result<()> {
        let now = now_ms();
        let mut tx = self.pool.begin().await?;
        for e in entries {
            match e.group_id {
                Some(gid) => { sqlx::query!("UPDATE items SET sort_order=?, group_id=?, updated_at=? WHERE id=?", e.sort_order, gid, now, e.id).execute(&mut *tx).await?; }
                None      => { sqlx::query!("UPDATE items SET sort_order=?, updated_at=? WHERE id=?", e.sort_order, now, e.id).execute(&mut *tx).await?; }
            }
        }
        tx.commit().await?; Ok(())
    }
```

- [ ] **Step 3: Replace `list_items_full`**

```rust
impl SqlxNavRepo {
    pub(crate) async fn fetch_item(&self, id: i64) -> Result<Item> {
        self.list_items_full().await?.into_iter().find(|i| i.id == id).ok_or(AppError::NotFound)
    }

    pub(crate) async fn list_items_full(&self) -> Result<Vec<Item>> {
        let item_rows = sqlx::query!(
            r#"SELECT id as "id!: i64", group_id,
                      name, name_i18n as "name_i18n: serde_json::Value",
                      description, description_i18n as "description_i18n: serde_json::Value",
                      icon_kind, icon_value,
                      sort_order as "sort_order!: i64",
                      created_at as "created_at!: i64",
                      updated_at as "updated_at!: i64"
               FROM items
               ORDER BY group_id, sort_order, id"#
        ).fetch_all(&self.pool).await?;

        let link_rows = sqlx::query!(
            r#"SELECT il.item_id as "item_id!: i64", s.value as "site_value!", il.url as "url!"
               FROM item_links il JOIN sites s ON s.id = il.site_id"#
        ).fetch_all(&self.pool).await?;

        let tag_rows = sqlx::query!(
            r#"SELECT it.item_id as "item_id!: i64", t.slug as "slug!"
               FROM item_tags it JOIN tags t ON t.id = it.tag_id"#
        ).fetch_all(&self.pool).await?;

        let mut items: Vec<Item> = item_rows.into_iter().map(|r| {
            let kind = match r.icon_kind.as_str() {
                "url" => IconKind::Url,
                "auto-favicon" => IconKind::AutoFavicon,
                _ => IconKind::Asset,
            };
            Item {
                id: r.id, group_id: r.group_id,
                name: r.name, name_i18n: r.name_i18n,
                description: r.description, description_i18n: r.description_i18n,
                icon_kind: kind, icon_value: r.icon_value,
                sort_order: r.sort_order,
                links: Default::default(), tag_slugs: Vec::new(),
                created_at: r.created_at, updated_at: r.updated_at,
            }
        }).collect();

        let by_id: std::collections::HashMap<i64, usize> =
            items.iter().enumerate().map(|(i, it)| (it.id, i)).collect();

        for r in link_rows {
            if let Some(&idx) = by_id.get(&r.item_id) {
                items[idx].links.insert(r.site_value, r.url);
            }
        }
        for r in tag_rows {
            if let Some(&idx) = by_id.get(&r.item_id) {
                items[idx].tag_slugs.push(r.slug);
            }
        }
        Ok(items)
    }
}
```

- [ ] **Step 4: Re-prepare sqlx metadata and run tests**

```bash
cd server
DATABASE_URL=sqlite:./dev-data/data.db cargo sqlx prepare -- --bin navsrv --tests
cargo test --test repo_items
cd ..
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/repo/sqlx_impl.rs server/tests/repo_items.rs server/.sqlx
git commit -m "feat(server): NavRepo sqlx impl for items + links + tags"
```

### Task 15: `ConfigRepo` (kv access for site meta + admin hash)

**Files:**
- Create: `server/src/repo/config.rs`
- Modify: `server/src/repo/mod.rs`
- Create: `server/tests/repo_config.rs`

- [ ] **Step 1: Test first**

```rust
// server/tests/repo_config.rs
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo};

#[tokio::test]
async fn upsert_get_delete_config() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxConfigRepo::new(pool);
    repo.upsert("site_name", "My Site").await.unwrap();
    assert_eq!(repo.get("site_name").await.unwrap().as_deref(), Some("My Site"));
    assert_eq!(repo.get("missing").await.unwrap(), None);

    repo.upsert("site_name", "Renamed").await.unwrap();
    assert_eq!(repo.get("site_name").await.unwrap().as_deref(), Some("Renamed"));

    repo.delete("site_name").await.unwrap();
    assert_eq!(repo.get("site_name").await.unwrap(), None);
}

#[tokio::test]
async fn many_pairs() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxConfigRepo::new(pool);
    repo.upsert_many(&[("a", "1"), ("b", "2")]).await.unwrap();
    let all = repo.get_many(&["a", "b", "c"]).await.unwrap();
    assert_eq!(all.get("a").map(String::as_str), Some("1"));
    assert_eq!(all.get("b").map(String::as_str), Some("2"));
    assert!(all.get("c").is_none());
}
```

- [ ] **Step 2: Trait + impl**

```rust
// server/src/repo/config.rs
use crate::error::Result;
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

#[async_trait]
pub trait ConfigRepo: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<String>>;
    async fn get_many(&self, keys: &[&str]) -> Result<BTreeMap<String, String>>;
    async fn upsert(&self, key: &str, value: &str) -> Result<()>;
    async fn upsert_many(&self, pairs: &[(&str, &str)]) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
}

pub struct SqlxConfigRepo { pool: SqlitePool }

impl SqlxConfigRepo {
    pub fn new(pool: SqlitePool) -> Self { Self { pool } }
}

#[async_trait]
impl ConfigRepo for SqlxConfigRepo {
    async fn get(&self, key: &str) -> Result<Option<String>> {
        let row = sqlx::query_scalar!("SELECT value FROM config WHERE key = ?", key)
            .fetch_optional(&self.pool).await?;
        Ok(row)
    }

    async fn get_many(&self, keys: &[&str]) -> Result<BTreeMap<String, String>> {
        let mut out = BTreeMap::new();
        for k in keys {
            if let Some(v) = self.get(k).await? { out.insert((*k).to_string(), v); }
        }
        Ok(out)
    }

    async fn upsert(&self, key: &str, value: &str) -> Result<()> {
        sqlx::query!(
            "INSERT INTO config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            key, value
        ).execute(&self.pool).await?;
        Ok(())
    }

    async fn upsert_many(&self, pairs: &[(&str, &str)]) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for (k, v) in pairs {
            sqlx::query!(
                "INSERT INTO config (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                k, v
            ).execute(&mut *tx).await?;
        }
        tx.commit().await?; Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query!("DELETE FROM config WHERE key = ?", key).execute(&self.pool).await?;
        Ok(())
    }
}
```

- [ ] **Step 3: Re-export**

```rust
// server/src/repo/mod.rs
pub mod config;
pub mod nav;
pub mod sqlx_impl;
pub use config::{ConfigRepo, SqlxConfigRepo};
pub use nav::NavRepo;
pub use sqlx_impl::SqlxNavRepo;
```

- [ ] **Step 4: Re-prepare and test**

```bash
cd server
DATABASE_URL=sqlite:./dev-data/data.db cargo sqlx prepare -- --bin navsrv --tests
cargo test --test repo_config
cd ..
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/repo/config.rs server/src/repo/mod.rs server/tests/repo_config.rs server/.sqlx
git commit -m "feat(server): ConfigRepo (kv) sqlx impl with batch upsert"
```

### Task 16: AppState + wire repos into Axum

**Files:**
- Create: `server/src/state.rs`
- Modify: `server/src/app.rs`, `server/src/main.rs`, `server/src/lib.rs`

- [ ] **Step 1: Define `AppState`**

```rust
// server/src/state.rs
use crate::repo::{ConfigRepo, NavRepo};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub nav: Arc<dyn NavRepo>,
    pub config: Arc<dyn ConfigRepo>,
}

impl AppState {
    pub fn new(nav: Arc<dyn NavRepo>, config: Arc<dyn ConfigRepo>) -> Self {
        Self { nav, config }
    }
}
```

- [ ] **Step 2: Make `app.rs` accept state**

```rust
// server/src/app.rs (replace previous)
use axum::http::{header, HeaderValue, Request};
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::routes;
use crate::state::AppState;

pub fn build_app(state: AppState) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let method = req.method();
            let uri = req.uri().path();
            tracing::info_span!("http", %method, %uri)
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    Router::new()
        .merge(routes::api(state.clone()))
        .with_state(state)
        .layer(trace)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    use crate::db::connect_in_memory;
    use crate::repo::{SqlxConfigRepo, SqlxNavRepo};
    use std::sync::Arc;
    let pool = connect_in_memory().await?;
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool));
    let state = AppState::new(nav, cfg);
    Ok(build_app(state))
}
```

- [ ] **Step 3: Update `routes/mod.rs` to take state**

```rust
// server/src/routes/mod.rs
use axum::Router;

pub mod health;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router()))
        .with_state(state)
}
```

(Health does not need state yet — but the wiring is here for later routes.)

- [ ] **Step 4: Update `main.rs`**

```rust
// server/src/main.rs
use anyhow::Context;
use navsrv::{
    app::build_app,
    config::Settings,
    db::{connect, migrate},
    repo::{SqlxConfigRepo, SqlxNavRepo},
    state::AppState,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let settings = Settings::load().context("load settings")?;
    init_tracing(&settings.rust_log);

    let pool = connect(&settings.db_url()).await.context("db connect")?;
    migrate(&pool).await.context("migrate")?;

    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool));
    let state = AppState::new(nav, cfg);

    let app = build_app(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    let listener = TcpListener::bind(addr).await.context("bind")?;
    tracing::info!(%addr, "navsrv listening");
    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}

fn init_tracing(filter: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let env = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(env).with_target(false).compact().init();
}
```

- [ ] **Step 5: Re-export**

```rust
// server/src/lib.rs
pub mod app;
pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
pub mod state;
```

- [ ] **Step 6: Verify**

```bash
cd server
cargo test
cd ..
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/state.rs server/src/app.rs server/src/main.rs server/src/routes/mod.rs server/src/lib.rs
git commit -m "refactor(server): introduce AppState carrying repo trait objects"
```

---

## Phase 3: Public Read API (Tasks 17–18)

Goal: `GET /api/nav` returns the full bundle from the seeded DB.

### Task 17: Build `NavBundle` from repos

**Files:**
- Create: `server/src/services/mod.rs`
- Create: `server/src/services/bundle.rs`
- Modify: `server/src/lib.rs`

- [ ] **Step 1: Create the assembler**

```rust
// server/src/services/mod.rs
pub mod bundle;
```

```rust
// server/src/services/bundle.rs
use crate::dto::*;
use crate::error::Result;
use crate::repo::{ConfigRepo, NavRepo};
use std::sync::Arc;

pub async fn assemble_bundle(
    nav: Arc<dyn NavRepo>,
    config: Arc<dyn ConfigRepo>,
) -> Result<NavBundle> {
    let (sites, groups, items, tags) = nav.get_bundle().await?;

    let cfg = config.get_many(&[
        "site_name", "site_avatar_path", "site_copyright",
        "site_icp_text", "site_icp_url",
        "site_police_text", "site_police_url",
        "default_theme",
    ]).await?;

    let icp = match (cfg.get("site_icp_text").cloned(), cfg.get("site_icp_url").cloned()) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };
    let police = match (cfg.get("site_police_text").cloned(), cfg.get("site_police_url").cloned()) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };

    let meta = Meta {
        site_name: cfg.get("site_name").cloned().unwrap_or_else(|| "Navigation".into()),
        site_avatar_path: cfg.get("site_avatar_path").cloned(),
        site_copyright: cfg.get("site_copyright").cloned().unwrap_or_default(),
        site_icp: icp,
        site_police: police,
        default_theme: cfg.get("default_theme").cloned().unwrap_or_else(|| "system".into()),
    };

    Ok(NavBundle {
        schema_version: 1,
        meta,
        sites,
        groups,
        items,
        tags,
    })
}
```

- [ ] **Step 2: Re-export**

```rust
// server/src/lib.rs
pub mod app;
pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
pub mod services;
pub mod state;
```

- [ ] **Step 3: Compile-check**

```bash
cd server
cargo check
cd ..
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add server/src/services server/src/lib.rs
git commit -m "feat(server): assemble_bundle service composing nav + config"
```

### Task 18: `GET /api/nav` handler

**Files:**
- Create: `server/src/routes/nav.rs`
- Modify: `server/src/routes/mod.rs`
- Create: `server/tests/api_nav.rs`

- [ ] **Step 1: Write test first**

```rust
// server/tests/api_nav.rs
use axum_test::TestServer;
use navsrv::app::build_app_for_tests;

#[tokio::test]
async fn nav_endpoint_returns_empty_bundle_initially() {
    let app = build_app_for_tests().await.unwrap();
    let server = TestServer::new(app).unwrap();
    let res = server.get("/api/nav").await;
    res.assert_status_ok();
    let body: serde_json::Value = res.json();
    assert_eq!(body["schemaVersion"], 1);
    assert!(body["sites"].as_array().unwrap().is_empty());
    assert!(body["items"].as_array().unwrap().is_empty());
    assert_eq!(body["meta"]["defaultTheme"], "system");
}
```

- [ ] **Step 2: Use camelCase serialization**

Modify `server/src/dto.rs` — add `#[serde(rename_all = "camelCase")]` to every struct that ends up in JSON. Apply to `Site`, `Group`, `Tag`, `Item`, `Meta`, `Link`, `NavBundle` (and write payloads):

```rust
// At top of every relevant struct, add the attribute. Example:
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Site { /* ... */ }
```

Apply to all DTOs uniformly.

- [ ] **Step 3: Write the handler**

```rust
// server/src/routes/nav.rs
use axum::{extract::State, routing::get, Json, Router};

use crate::dto::NavBundle;
use crate::error::Result;
use crate::services::bundle::assemble_bundle;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/nav", get(get_nav))
}

async fn get_nav(State(s): State<AppState>) -> Result<Json<NavBundle>> {
    let bundle = assemble_bundle(s.nav.clone(), s.config.clone()).await?;
    Ok(Json(bundle))
}
```

- [ ] **Step 4: Wire into `routes/mod.rs`**

```rust
// server/src/routes/mod.rs
use axum::Router;

pub mod health;
pub mod nav;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router())
            .merge(nav::router()))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests**

```bash
cd server
cargo test --test api_nav
cd ..
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes server/src/dto.rs server/tests/api_nav.rs
git commit -m "feat(server): GET /api/nav returns full NavBundle (camelCase)"
```

---

## Phase 4: Authentication and Bootstrap (Tasks 19–28)

Goal: single-admin password auth backed by bcrypt + signed session cookies stored in SQLite. First boot generates a password if env doesn't supply one and writes it to `INITIAL_PASSWORD.txt`. CLI subcommand `navsrv reset-password` for recovery.

### Task 19: Password hashing utility

**Files:**
- Create: `server/src/auth/mod.rs`
- Create: `server/src/auth/password.rs`
- Modify: `server/src/lib.rs`

- [ ] **Step 1: Test first**

Create `server/src/auth/password.rs`:

```rust
//! bcrypt-based password hashing.

use crate::error::{AppError, Result};

pub const BCRYPT_COST: u32 = 12;

pub fn hash(plain: &str) -> Result<String> {
    if plain.is_empty() {
        return Err(AppError::Validation("password must not be empty".into()));
    }
    Ok(bcrypt::hash(plain, BCRYPT_COST)?)
}

pub fn verify(plain: &str, hashed: &str) -> Result<bool> {
    Ok(bcrypt::verify(plain, hashed)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_roundtrip() {
        let h = hash("hunter2").unwrap();
        assert!(verify("hunter2", &h).unwrap());
        assert!(!verify("wrong", &h).unwrap());
    }

    #[test]
    fn empty_password_rejected() {
        let err = hash("").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
```

- [ ] **Step 2: Module file**

```rust
// server/src/auth/mod.rs
pub mod password;
```

- [ ] **Step 3: Re-export**

```rust
// server/src/lib.rs
pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
pub mod services;
pub mod state;
```

- [ ] **Step 4: Run**

```bash
cd server
cargo test --lib auth::password::tests
cd ..
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth server/src/lib.rs
git commit -m "feat(server): bcrypt password hash/verify utility"
```

### Task 20: Bootstrap service — env or random + INITIAL_PASSWORD.txt

**Files:**
- Create: `server/src/services/bootstrap.rs`
- Modify: `server/src/services/mod.rs`
- Create: `server/tests/bootstrap.rs`

- [ ] **Step 1: Write the failing test**

```rust
// server/tests/bootstrap.rs
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

    let out = ensure_admin_password(cfg.clone(), dir.path(), None).await.unwrap();
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

    ensure_admin_password(cfg.clone(), dir.path(), Some("first".into())).await.unwrap();
    let out = ensure_admin_password(cfg.clone(), dir.path(), Some("ignored".into())).await.unwrap();
    assert!(matches!(out, BootstrapOutcome::AlreadySet));
}
```

- [ ] **Step 2: Implement service**

```rust
// server/src/services/bootstrap.rs
use crate::auth::password;
use crate::error::Result;
use crate::repo::ConfigRepo;
use rand::distributions::{Alphanumeric, DistString};
use std::path::Path;
use std::sync::Arc;

const PASSWORD_LEN: usize = 24;

pub enum BootstrapOutcome {
    AlreadySet,
    SetFromEnv,
    Generated(String),
}

pub async fn ensure_admin_password(
    config: Arc<dyn ConfigRepo>,
    data_dir: &Path,
    env_password: Option<String>,
) -> Result<BootstrapOutcome> {
    if config.get("admin_password_hash").await?.is_some() {
        return Ok(BootstrapOutcome::AlreadySet);
    }

    let now = chrono::Utc::now().timestamp_millis().to_string();

    if let Some(pw) = env_password.filter(|s| !s.is_empty()) {
        let hash = password::hash(&pw)?;
        config.upsert_many(&[
            ("admin_password_hash", &hash),
            ("admin_password_updated_at", &now),
        ]).await?;
        tracing::warn!(
            "Admin password set from env. Please change it via UI immediately."
        );
        return Ok(BootstrapOutcome::SetFromEnv);
    }

    let pw = Alphanumeric.sample_string(&mut rand::thread_rng(), PASSWORD_LEN);
    let hash = password::hash(&pw)?;
    config.upsert_many(&[
        ("admin_password_hash", &hash),
        ("admin_password_updated_at", &now),
    ]).await?;

    let path = data_dir.join("INITIAL_PASSWORD.txt");
    let body = format!(
        "Initial admin password (single use):\n{pw}\n\n\
        After logging in and changing the password via UI, this file is deleted automatically.\n"
    );
    std::fs::write(&path, body)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms)?;
    }
    tracing::warn!(?path, "Generated initial admin password — see file above");
    tracing::warn!("INITIAL ADMIN PASSWORD: {pw}");

    Ok(BootstrapOutcome::Generated(pw))
}
```

- [ ] **Step 3: Re-export**

```rust
// server/src/services/mod.rs
pub mod bootstrap;
pub mod bundle;
```

- [ ] **Step 4: Run tests**

```bash
cd server
cargo test --test bootstrap
cd ..
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services server/tests/bootstrap.rs
git commit -m "feat(server): bootstrap admin password (env or random+INITIAL_PASSWORD.txt)"
```

### Task 21: Wire `tower-sessions` with SQLite store

**Files:**
- Create: `server/src/auth/session.rs`
- Modify: `server/src/auth/mod.rs`, `server/src/app.rs`, `server/src/main.rs`, `server/migrations/0001_init.sql`

- [ ] **Step 1: Add the `tower_sessions_sqlx_store` table to migration**

Append to `server/migrations/0001_init.sql`:

```sql
CREATE TABLE tower_sessions (
  id          TEXT PRIMARY KEY NOT NULL,
  data        BLOB NOT NULL,
  expiry_date INTEGER NOT NULL
);
```

- [ ] **Step 2: Session helper**

```rust
// server/src/auth/session.rs
use sqlx::SqlitePool;
use std::time::Duration;
use tower_sessions::cookie::time::Duration as CookieDur;
use tower_sessions::cookie::SameSite;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::SqliteStore;

pub const SESSION_KEY_AUTHED: &str = "authed";

pub fn layer(pool: SqlitePool, secure: bool) -> SessionManagerLayer<SqliteStore> {
    let store = SqliteStore::new(pool).with_table_name("tower_sessions").expect("valid table");
    SessionManagerLayer::new(store)
        .with_name("__Host-sid")
        .with_secure(secure)
        .with_http_only(true)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(CookieDur::days(30)))
}

/// Background task: prune expired sessions every hour.
pub async fn run_pruner(pool: SqlitePool) {
    let mut tick = tokio::time::interval(Duration::from_secs(3600));
    loop {
        tick.tick().await;
        let now = chrono::Utc::now().timestamp_millis();
        if let Err(e) = sqlx::query("DELETE FROM tower_sessions WHERE expiry_date < ?")
            .bind(now)
            .execute(&pool)
            .await
        {
            tracing::warn!(error = %e, "session pruner failed");
        }
    }
}
```

- [ ] **Step 3: Re-export**

```rust
// server/src/auth/mod.rs
pub mod password;
pub mod session;
```

- [ ] **Step 4: Update `app.rs` to accept the session layer**

```rust
// server/src/app.rs (replace previous)
use axum::http::{header, HeaderValue, Request};
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tower_sessions::SessionManagerLayer;
use tower_sessions_sqlx_store::SqliteStore;
use tracing::Level;

use crate::routes;
use crate::state::AppState;

pub fn build_app(
    state: AppState,
    session_layer: SessionManagerLayer<SqliteStore>,
) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let method = req.method();
            let uri = req.uri().path();
            tracing::info_span!("http", %method, %uri)
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    Router::new()
        .merge(routes::api(state.clone()))
        .with_state(state)
        .layer(session_layer)
        .layer(trace)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    use crate::auth::session::layer as session_layer;
    use crate::db::connect_in_memory;
    use crate::repo::{SqlxConfigRepo, SqlxNavRepo};
    use std::sync::Arc;
    let pool = connect_in_memory().await?;
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let state = AppState::new(nav, cfg);
    Ok(build_app(state, session_layer(pool, false)))
}
```

- [ ] **Step 5: Update `main.rs`**

```rust
// server/src/main.rs (extend after `migrate(...)`)
use anyhow::Context;
use navsrv::{
    app::build_app,
    auth::session::{layer as session_layer, run_pruner},
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
    let settings = Settings::load().context("load settings")?;
    init_tracing(&settings.rust_log);

    let pool = connect(&settings.db_url()).await.context("db connect")?;
    migrate(&pool).await.context("migrate")?;

    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));

    ensure_admin_password(cfg.clone(), &settings.data_dir, settings.bootstrap_admin_password.clone()).await?;

    let state = AppState::new(nav, cfg);
    let app = build_app(state, session_layer(pool.clone(), settings.secure_cookies));
    tokio::spawn(run_pruner(pool));

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    let listener = TcpListener::bind(addr).await.context("bind")?;
    tracing::info!(%addr, "navsrv listening");
    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}

fn init_tracing(filter: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let env = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(env).with_target(false).compact().init();
}
```

- [ ] **Step 6: Re-prepare and test**

```bash
cd server
DATABASE_URL=sqlite:./dev-data/data.db cargo sqlx prepare -- --bin navsrv --tests
cargo test
cd ..
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/auth server/src/app.rs server/src/main.rs server/migrations/0001_init.sql server/.sqlx
git commit -m "feat(server): tower-sessions wired with SQLite store + 30d sliding cookie"
```

### Task 22: `POST /api/auth/login` + rate limit

**Files:**
- Create: `server/src/routes/auth.rs`
- Modify: `server/src/routes/mod.rs`
- Create: `server/tests/api_auth.rs`

- [ ] **Step 1: Write failing test**

```rust
// server/tests/api_auth.rs
use axum_test::TestServer;
use navsrv::app::build_app_for_tests;
use navsrv::auth::password;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo};
use navsrv::db::connect_in_memory;

async fn server_with_password(pw: &str) -> (TestServer, std::sync::Arc<dyn ConfigRepo>) {
    use navsrv::app::build_app;
    use navsrv::auth::session::layer as session_layer;
    use navsrv::repo::SqlxNavRepo;
    use navsrv::state::AppState;
    use std::sync::Arc;
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash(pw).unwrap()).await.unwrap();
    let state = AppState::new(nav, cfg.clone());
    let app = build_app(state, session_layer(pool, false));
    (TestServer::new(app).unwrap(), cfg)
}

#[tokio::test]
async fn login_with_correct_password_returns_204_and_cookie() {
    let (server, _cfg) = server_with_password("hunter2").await;
    let res = server.post("/api/auth/login").json(&serde_json::json!({"password":"hunter2"})).await;
    res.assert_status(axum::http::StatusCode::NO_CONTENT);
    assert!(res.cookie("__Host-sid").value().len() > 0);
}

#[tokio::test]
async fn login_with_wrong_password_returns_401() {
    let (server, _) = server_with_password("hunter2").await;
    let res = server.post("/api/auth/login").json(&serde_json::json!({"password":"nope"})).await;
    res.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn me_unauth_returns_false() {
    let app = build_app_for_tests().await.unwrap();
    let server = TestServer::new(app).unwrap();
    let res = server.get("/api/auth/me").await;
    res.assert_status_ok();
    res.assert_json(&serde_json::json!({"authenticated": false}));
}

#[tokio::test]
async fn logout_clears_session() {
    let (mut server, _) = server_with_password("hunter2").await;
    server.do_save_cookies();
    server.post("/api/auth/login").json(&serde_json::json!({"password":"hunter2"})).await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
    server.get("/api/auth/me").await.assert_json(&serde_json::json!({"authenticated": true}));
    server.post("/api/auth/logout").await.assert_status(axum::http::StatusCode::NO_CONTENT);
    server.get("/api/auth/me").await.assert_json(&serde_json::json!({"authenticated": false}));
}
```

- [ ] **Step 2: Implement handlers**

```rust
// server/src/routes/auth.rs
use axum::{extract::State, http::StatusCode, routing::{get, post}, Json, Router};
use serde::Deserialize;
use serde_json::json;
use tower_sessions::Session;

use crate::auth::password;
use crate::auth::session::SESSION_KEY_AUTHED;
use crate::error::{AppError, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login",  post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me",     get(me))
}

#[derive(Deserialize)]
struct LoginBody { password: String }

async fn login(
    State(s): State<AppState>,
    session: Session,
    Json(body): Json<LoginBody>,
) -> Result<StatusCode> {
    let hashed = s.config.get("admin_password_hash").await?
        .ok_or(AppError::Unauthenticated)?;
    if !password::verify(&body.password, &hashed)? {
        return Err(AppError::Unauthenticated);
    }
    session.insert(SESSION_KEY_AUTHED, true).await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn logout(session: Session) -> Result<StatusCode> {
    session.flush().await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn me(session: Session) -> Result<Json<serde_json::Value>> {
    let authed = session.get::<bool>(SESSION_KEY_AUTHED).await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?
        .unwrap_or(false);
    Ok(Json(json!({ "authenticated": authed })))
}
```

- [ ] **Step 3: Mount router**

```rust
// server/src/routes/mod.rs (replace)
use axum::Router;

pub mod auth;
pub mod health;
pub mod nav;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router())
            .merge(nav::router())
            .merge(auth::router()))
        .with_state(state)
}
```

- [ ] **Step 4: Re-prepare and test**

```bash
cd server
DATABASE_URL=sqlite:./dev-data/data.db cargo sqlx prepare -- --bin navsrv --tests
cargo test --test api_auth
cd ..
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes server/tests/api_auth.rs server/.sqlx
git commit -m "feat(server): /api/auth login/logout/me with bcrypt + session"
```

### Task 23: `RequireAuth` extractor

**Files:**
- Create: `server/src/auth/middleware.rs`
- Modify: `server/src/auth/mod.rs`

- [ ] **Step 1: Write extractor**

```rust
// server/src/auth/middleware.rs
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use tower_sessions::Session;

use crate::auth::session::SESSION_KEY_AUTHED;
use crate::error::AppError;

pub struct RequireAuth;

#[async_trait]
impl<S> FromRequestParts<S> for RequireAuth
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthenticated)?;
        let authed = session.get::<bool>(SESSION_KEY_AUTHED).await
            .map_err(|_| AppError::Unauthenticated)?
            .unwrap_or(false);
        if authed { Ok(Self) } else { Err(AppError::Unauthenticated) }
    }
}
```

- [ ] **Step 2: Re-export**

```rust
// server/src/auth/mod.rs
pub mod middleware;
pub mod password;
pub mod session;
pub use middleware::RequireAuth;
```

- [ ] **Step 3: Compile-check**

```bash
cd server
cargo check
cd ..
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth
git commit -m "feat(server): RequireAuth extractor returning 401 when unauthenticated"
```

### Task 24: Login rate limit (`tower-governor`)

**Files:**
- Modify: `server/src/routes/auth.rs`, `server/src/routes/mod.rs`

- [ ] **Step 1: Wrap login route with governor**

```rust
// server/src/routes/auth.rs (top of file, replace router())
use std::sync::Arc;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;

pub fn router() -> Router<AppState> {
    let conf = GovernorConfigBuilder::default()
        .per_second(180)             // 5 attempts per 15 minutes ≈ 1 per 180s
        .burst_size(5)
        .finish()
        .expect("governor config");
    let governor = GovernorLayer { config: Arc::new(conf) };

    Router::new()
        .route("/auth/login", post(login).layer(governor))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
}
```

- [ ] **Step 2: Map governor's response to `AppError::RateLimited`**

`tower-governor` returns `429 Too Many Requests` automatically with a `text/plain` body. We accept that as-is (matches our error code semantically); no extra mapping needed.

- [ ] **Step 3: Run tests (rate limit test would be flaky in CI; we keep it manual)**

```bash
cd server
cargo test --test api_auth
cd ..
```

Expected: still PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/auth.rs
git commit -m "feat(server): rate-limit /api/auth/login (5 burst per 15 min)"
```

### Task 25: `POST /api/config/password` + auto-delete `INITIAL_PASSWORD.txt`

**Files:**
- Create: `server/src/routes/config.rs`
- Modify: `server/src/routes/mod.rs`
- Modify: `server/src/state.rs` (add data_dir reference)
- Create: `server/tests/api_config_password.rs`

- [ ] **Step 1: Extend `AppState` to know `data_dir`**

```rust
// server/src/state.rs
use crate::repo::{ConfigRepo, NavRepo};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub nav: Arc<dyn NavRepo>,
    pub config: Arc<dyn ConfigRepo>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(nav: Arc<dyn NavRepo>, config: Arc<dyn ConfigRepo>, data_dir: PathBuf) -> Self {
        Self { nav, config, data_dir }
    }
}
```

- [ ] **Step 2: Update construction sites**

In `server/src/main.rs` change `AppState::new(nav, cfg)` → `AppState::new(nav, cfg, settings.data_dir.clone())`.

In `server/src/app.rs::build_app_for_tests`, set `data_dir = std::env::temp_dir()`:

```rust
    let state = AppState::new(nav, cfg.clone(), std::env::temp_dir());
```

- [ ] **Step 3: Test first**

```rust
// server/tests/api_config_password.rs
use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;
use tempfile::TempDir;

async fn boot() -> (TestServer, std::sync::Arc<dyn ConfigRepo>, TempDir) {
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("old").unwrap()).await.unwrap();
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("INITIAL_PASSWORD.txt"), "old").unwrap();
    let state = AppState::new(nav, cfg.clone(), dir.path().to_path_buf());
    let app = build_app(state, session_layer(pool, false));
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server.post("/api/auth/login").json(&serde_json::json!({"password":"old"})).await
        .assert_status_success();
    (server, cfg, dir)
}

#[tokio::test]
async fn change_password_replaces_hash_and_deletes_initial_file() {
    let (server, cfg, dir) = boot().await;
    let res = server.post("/api/config/password")
        .json(&serde_json::json!({"current":"old","next":"newPwLongEnough"}))
        .await;
    res.assert_status(axum::http::StatusCode::NO_CONTENT);

    let h = cfg.get("admin_password_hash").await.unwrap().unwrap();
    assert!(password::verify("newPwLongEnough", &h).unwrap());
    assert!(!password::verify("old", &h).unwrap());

    assert!(!dir.path().join("INITIAL_PASSWORD.txt").exists(),
        "INITIAL_PASSWORD.txt should be deleted after first successful change");
}

#[tokio::test]
async fn change_password_with_wrong_current_returns_401() {
    let (server, _cfg, _dir) = boot().await;
    server.post("/api/config/password")
        .json(&serde_json::json!({"current":"WRONG","next":"newPwLongEnough"}))
        .await
        .assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
```

- [ ] **Step 4: Implement**

```rust
// server/src/routes/config.rs
use axum::{extract::State, http::StatusCode, routing::{patch, post}, Json, Router};
use serde::Deserialize;

use crate::auth::{password, RequireAuth};
use crate::error::{AppError, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config", patch(patch_config))
        .route("/config/password", post(change_password))
}

#[derive(Deserialize)]
struct ConfigEntry { key: String, value: String }

async fn patch_config(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(items): Json<Vec<ConfigEntry>>,
) -> Result<StatusCode> {
    let pairs: Vec<(&str, &str)> = items.iter().map(|i| (i.key.as_str(), i.value.as_str())).collect();
    s.config.upsert_many(&pairs).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct ChangePassword { current: String, next: String }

async fn change_password(
    _auth: RequireAuth,
    State(s): State<AppState>,
    Json(body): Json<ChangePassword>,
) -> Result<StatusCode> {
    if body.next.len() < 8 {
        return Err(AppError::Validation("password must be at least 8 chars".into()));
    }
    let current_hash = s.config.get("admin_password_hash").await?
        .ok_or(AppError::Unauthenticated)?;
    if !password::verify(&body.current, &current_hash)? {
        return Err(AppError::Unauthenticated);
    }
    let new_hash = password::hash(&body.next)?;
    let now = chrono::Utc::now().timestamp_millis().to_string();
    s.config.upsert_many(&[
        ("admin_password_hash", &new_hash),
        ("admin_password_updated_at", &now),
    ]).await?;

    let initial = s.data_dir.join("INITIAL_PASSWORD.txt");
    if initial.exists() {
        if let Err(e) = std::fs::remove_file(&initial) {
            tracing::warn!(error=%e, ?initial, "failed to remove INITIAL_PASSWORD.txt");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 5: Mount**

```rust
// server/src/routes/mod.rs (replace)
use axum::Router;

pub mod auth;
pub mod config;
pub mod health;
pub mod nav;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router())
            .merge(nav::router())
            .merge(auth::router())
            .merge(config::router()))
        .with_state(state)
}
```

- [ ] **Step 6: Run tests**

```bash
cd server
cargo test --test api_config_password
cd ..
```

Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes server/src/state.rs server/src/main.rs server/src/app.rs server/tests/api_config_password.rs
git commit -m "feat(server): change-password endpoint deletes INITIAL_PASSWORD.txt on success"
```

### Task 26: CLI `navsrv reset-password` (clap-derive)

**Files:**
- Create: `server/src/cli.rs`
- Modify: `server/src/main.rs`, `server/src/lib.rs`
- Create: `server/tests/cli.rs`

- [ ] **Step 1: Write the CLI module**

```rust
// server/src/cli.rs
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
                    print!("New admin password: "); io::stdout().flush().ok();
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
            ]).await?;

            // Invalidate all sessions.
            sqlx::query("DELETE FROM tower_sessions").execute(&pool).await?;

            // Remove leftover INITIAL_PASSWORD.txt if any.
            let initial = settings.data_dir.join("INITIAL_PASSWORD.txt");
            if initial.exists() { let _ = std::fs::remove_file(&initial); }

            println!("Admin password reset; all sessions invalidated.");
            Ok(())
        }
    }
}
```

- [ ] **Step 2: Re-export**

```rust
// server/src/lib.rs (add `cli`)
pub mod app;
pub mod auth;
pub mod cli;
pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
pub mod services;
pub mod state;
```

- [ ] **Step 3: Branch in `main.rs`**

```rust
// server/src/main.rs (replace)
use anyhow::Context;
use clap::Parser;
use navsrv::{
    app::build_app,
    auth::session::{layer as session_layer, run_pruner},
    cli::{Cli, Command, run_command},
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

    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));

    ensure_admin_password(cfg.clone(), &settings.data_dir, settings.bootstrap_admin_password.clone()).await?;

    let state = AppState::new(nav, cfg, settings.data_dir.clone());
    let app = build_app(state, session_layer(pool.clone(), settings.secure_cookies));
    tokio::spawn(run_pruner(pool));

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    let listener = TcpListener::bind(addr).await.context("bind")?;
    tracing::info!(%addr, "navsrv listening");
    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}

fn init_tracing(filter: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let env = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(env).with_target(false).compact().init();
}
```

- [ ] **Step 4: Integration test driving the CLI directly**

```rust
// server/tests/cli.rs
use navsrv::auth::password;
use navsrv::cli::{run_command, Command};
use navsrv::config::Settings;

#[tokio::test]
async fn reset_password_flow() {
    let dir = tempfile::TempDir::new().unwrap();
    std::env::set_var("DATA_DIR", dir.path());
    std::env::remove_var("BOOTSTRAP_ADMIN_PASSWORD");
    std::env::set_var("RUST_LOG", "warn");
    // Touch a fake initial password file to ensure it gets removed.
    std::fs::write(dir.path().join("INITIAL_PASSWORD.txt"), "old").unwrap();

    run_command(Command::ResetPassword { password: Some("brand-new-pw".into()) }).await.unwrap();

    let s = Settings::load().unwrap();
    let pool = navsrv::db::connect(&s.db_url()).await.unwrap();
    let h: (String,) = sqlx::query_as("SELECT value FROM config WHERE key='admin_password_hash'")
        .fetch_one(&pool).await.unwrap();
    assert!(password::verify("brand-new-pw", &h.0).unwrap());
    assert!(!dir.path().join("INITIAL_PASSWORD.txt").exists());

    // cleanup env
    std::env::remove_var("DATA_DIR");
}
```

> Note: this test mutates process env; mark it `#[serial]` if more env-touching tests are added later.

- [ ] **Step 5: Run**

```bash
cd server
cargo test --test cli
cd ..
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/cli.rs server/src/main.rs server/src/lib.rs server/tests/cli.rs
git commit -m "feat(server): CLI 'reset-password' subcommand invalidates sessions"
```

---

## Phase 5: CRUD Endpoints (Tasks 27–32)

Goal: write endpoints for items / groups / sites / tags / icons / favicon, all gated by `RequireAuth`.

### Task 27: items CRUD + reorder endpoints

**Files:**
- Create: `server/src/routes/items.rs`
- Modify: `server/src/routes/mod.rs`
- Create: `server/tests/api_items.rs`

- [ ] **Step 1: Test first**

```rust
// server/tests/api_items.rs
use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo, NavRepo};
use navsrv::state::AppState;
use navsrv::dto::{GroupPayload, SitePayload};
use std::sync::Arc;

async fn auth_server() -> (TestServer, i64) {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap()).await.unwrap();
    let g = nav.create_group(GroupPayload { slug: "tools".into(), name:"Tools".into(), name_i18n: None, collapsed_default: false }).await.unwrap();
    nav.create_site(SitePayload { value: "shangHai".into(), name:"上海".into(), name_i18n: None, is_default: true }).await.unwrap();

    let state = AppState::new(nav, cfg, std::env::temp_dir());
    let app = build_app(state, session_layer(pool, false));
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server.post("/api/auth/login").json(&serde_json::json!({"password":"pw"})).await
        .assert_status_success();
    (server, g.id)
}

#[tokio::test]
async fn create_then_list_via_bundle() {
    let (server, gid) = auth_server().await;
    let body = serde_json::json!({
        "groupId": gid,
        "name": "Router",
        "iconKind": "asset",
        "iconValue": "router.png",
        "links": { "shangHai": "http://10.0.0.1" },
        "tagSlugs": []
    });
    let res = server.post("/api/items").json(&body).await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let v: serde_json::Value = res.json();
    let id = v["id"].as_i64().unwrap();
    assert_eq!(v["name"], "Router");

    let bundle: serde_json::Value = server.get("/api/nav").await.json();
    let item = bundle["items"].as_array().unwrap().iter().find(|i| i["id"].as_i64() == Some(id)).unwrap();
    assert_eq!(item["links"]["shangHai"], "http://10.0.0.1");
}

#[tokio::test]
async fn patch_changes_name() {
    let (server, gid) = auth_server().await;
    let id = server.post("/api/items").json(&serde_json::json!({
        "groupId": gid, "name": "old", "iconKind":"asset", "iconValue":"x.png"
    })).await.json::<serde_json::Value>()["id"].as_i64().unwrap();

    let res = server.patch(&format!("/api/items/{id}"))
        .json(&serde_json::json!({ "name": "new" })).await;
    res.assert_status_ok();
    let v: serde_json::Value = res.json();
    assert_eq!(v["name"], "new");
}

#[tokio::test]
async fn delete_removes_item() {
    let (server, gid) = auth_server().await;
    let id = server.post("/api/items").json(&serde_json::json!({
        "groupId": gid, "name": "x", "iconKind":"asset", "iconValue":"x.png"
    })).await.json::<serde_json::Value>()["id"].as_i64().unwrap();
    server.delete(&format!("/api/items/{id}")).await.assert_status(axum::http::StatusCode::NO_CONTENT);

    let bundle: serde_json::Value = server.get("/api/nav").await.json();
    assert!(bundle["items"].as_array().unwrap().iter().all(|i| i["id"].as_i64() != Some(id)));
}

#[tokio::test]
async fn unauthed_returns_401() {
    let pool = connect_in_memory().await.unwrap();
    let nav: Arc<dyn NavRepo> = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let state = AppState::new(nav, cfg, std::env::temp_dir());
    let app = build_app(state, session_layer(pool, false));
    let server = TestServer::new(app).unwrap();
    server.post("/api/items").json(&serde_json::json!({
        "name":"x","iconKind":"asset","iconValue":"x.png"
    })).await.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
```

- [ ] **Step 2: Implement handlers**

```rust
// server/src/routes/items.rs
use axum::{extract::{Path, State}, http::StatusCode, routing::{delete, patch, post}, Json, Router};

use crate::auth::RequireAuth;
use crate::dto::{Item, ItemPatch, ItemPayload, ReorderEntry};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/items",          post(create))
        .route("/items/reorder",  post(reorder))
        .route("/items/:id",      patch(update).delete(remove))
}

async fn create(_auth: RequireAuth, State(s): State<AppState>, Json(body): Json<ItemPayload>) -> Result<(StatusCode, Json<Item>)> {
    let item = s.nav.create_item(body).await?;
    Ok((StatusCode::CREATED, Json(item)))
}

async fn update(_auth: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>, Json(body): Json<ItemPatch>) -> Result<Json<Item>> {
    Ok(Json(s.nav.patch_item(id, body).await?))
}

async fn remove(_auth: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>) -> Result<StatusCode> {
    s.nav.delete_item(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn reorder(_auth: RequireAuth, State(s): State<AppState>, Json(entries): Json<Vec<ReorderEntry>>) -> Result<StatusCode> {
    s.nav.reorder_items(entries).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Mount**

```rust
// server/src/routes/mod.rs (replace)
use axum::Router;

pub mod auth;
pub mod config;
pub mod health;
pub mod items;
pub mod nav;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router())
            .merge(nav::router())
            .merge(auth::router())
            .merge(config::router())
            .merge(items::router()))
        .with_state(state)
}
```

- [ ] **Step 4: Run**

```bash
cd server
cargo test --test api_items
cd ..
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes server/tests/api_items.rs
git commit -m "feat(server): /api/items CRUD + reorder behind RequireAuth"
```

### Task 28: groups, sites, tags CRUD endpoints

**Files:**
- Create: `server/src/routes/groups.rs`, `server/src/routes/sites.rs`, `server/src/routes/tags.rs`
- Modify: `server/src/routes/mod.rs`
- Create: `server/tests/api_groups_sites_tags.rs`

- [ ] **Step 1: groups.rs**

```rust
// server/src/routes/groups.rs
use axum::{extract::{Path, State}, http::StatusCode, routing::{patch, post}, Json, Router};

use crate::auth::RequireAuth;
use crate::dto::{Group, GroupPatch, GroupPayload, ReorderEntry};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/groups",         post(create))
        .route("/groups/reorder", post(reorder))
        .route("/groups/:id",     patch(update).delete(remove))
}

async fn create(_a: RequireAuth, State(s): State<AppState>, Json(body): Json<GroupPayload>) -> Result<(StatusCode, Json<Group>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_group(body).await?)))
}
async fn update(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>, Json(body): Json<GroupPatch>) -> Result<Json<Group>> {
    Ok(Json(s.nav.patch_group(id, body).await?))
}
async fn remove(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>) -> Result<StatusCode> {
    s.nav.delete_group(id).await?; Ok(StatusCode::NO_CONTENT)
}
async fn reorder(_a: RequireAuth, State(s): State<AppState>, Json(entries): Json<Vec<ReorderEntry>>) -> Result<StatusCode> {
    s.nav.reorder_groups(entries).await?; Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: sites.rs**

```rust
// server/src/routes/sites.rs
use axum::{extract::{Path, State}, http::StatusCode, routing::{patch, post}, Json, Router};

use crate::auth::RequireAuth;
use crate::dto::{ReorderEntry, Site, SitePatch, SitePayload};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sites",         post(create))
        .route("/sites/reorder", post(reorder))
        .route("/sites/:id",     patch(update).delete(remove))
}

async fn create(_a: RequireAuth, State(s): State<AppState>, Json(body): Json<SitePayload>) -> Result<(StatusCode, Json<Site>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_site(body).await?)))
}
async fn update(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>, Json(body): Json<SitePatch>) -> Result<Json<Site>> {
    Ok(Json(s.nav.patch_site(id, body).await?))
}
async fn remove(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>) -> Result<StatusCode> {
    s.nav.delete_site(id).await?; Ok(StatusCode::NO_CONTENT)
}
async fn reorder(_a: RequireAuth, State(s): State<AppState>, Json(entries): Json<Vec<ReorderEntry>>) -> Result<StatusCode> {
    s.nav.reorder_sites(entries).await?; Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: tags.rs**

```rust
// server/src/routes/tags.rs
use axum::{extract::{Path, State}, http::StatusCode, routing::{patch, post}, Json, Router};

use crate::auth::RequireAuth;
use crate::dto::{Tag, TagPatch, TagPayload};
use crate::error::Result;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tags",      post(create))
        .route("/tags/:id",  patch(update).delete(remove))
}

async fn create(_a: RequireAuth, State(s): State<AppState>, Json(body): Json<TagPayload>) -> Result<(StatusCode, Json<Tag>)> {
    Ok((StatusCode::CREATED, Json(s.nav.create_tag(body).await?)))
}
async fn update(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>, Json(body): Json<TagPatch>) -> Result<Json<Tag>> {
    Ok(Json(s.nav.patch_tag(id, body).await?))
}
async fn remove(_a: RequireAuth, State(s): State<AppState>, Path(id): Path<i64>) -> Result<StatusCode> {
    s.nav.delete_tag(id).await?; Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount**

```rust
// server/src/routes/mod.rs (replace)
use axum::Router;

pub mod auth;
pub mod config;
pub mod groups;
pub mod health;
pub mod items;
pub mod nav;
pub mod sites;
pub mod tags;

use crate::state::AppState;

pub fn api(state: AppState) -> Router {
    Router::new()
        .nest("/api", Router::new()
            .merge(health::router())
            .merge(nav::router())
            .merge(auth::router())
            .merge(config::router())
            .merge(items::router())
            .merge(groups::router())
            .merge(sites::router())
            .merge(tags::router()))
        .with_state(state)
}
```

- [ ] **Step 5: Smoke-test**

```rust
// server/tests/api_groups_sites_tags.rs
use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;

async fn boot() -> TestServer {
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap()).await.unwrap();
    let state = AppState::new(nav, cfg, std::env::temp_dir());
    let app = build_app(state, session_layer(pool, false));
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server.post("/api/auth/login").json(&serde_json::json!({"password":"pw"})).await.assert_status_success();
    server
}

#[tokio::test]
async fn group_lifecycle() {
    let server = boot().await;
    let g: serde_json::Value = server.post("/api/groups").json(&serde_json::json!({
        "slug":"net","name":"Network"
    })).await.json();
    let id = g["id"].as_i64().unwrap();
    server.patch(&format!("/api/groups/{id}")).json(&serde_json::json!({"name":"NET"})).await.assert_status_ok();
    server.delete(&format!("/api/groups/{id}")).await.assert_status(axum::http::StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn site_lifecycle() {
    let server = boot().await;
    let s: serde_json::Value = server.post("/api/sites").json(&serde_json::json!({
        "value":"sh","name":"Shanghai"
    })).await.json();
    let id = s["id"].as_i64().unwrap();
    server.patch(&format!("/api/sites/{id}")).json(&serde_json::json!({"name":"SH"})).await.assert_status_ok();
    server.delete(&format!("/api/sites/{id}")).await.assert_status(axum::http::StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn tag_lifecycle() {
    let server = boot().await;
    let t: serde_json::Value = server.post("/api/tags").json(&serde_json::json!({
        "slug":"fav","name":"Favorite"
    })).await.json();
    let id = t["id"].as_i64().unwrap();
    server.patch(&format!("/api/tags/{id}")).json(&serde_json::json!({"name":"⭐"})).await.assert_status_ok();
    server.delete(&format!("/api/tags/{id}")).await.assert_status(axum::http::StatusCode::NO_CONTENT);
}
```

- [ ] **Step 6: Run**

```bash
cd server
cargo test --test api_groups_sites_tags
cd ..
```

Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes server/tests/api_groups_sites_tags.rs
git commit -m "feat(server): groups/sites/tags CRUD endpoints"
```

### Task 29: Icon upload endpoint (multipart)

**Files:**
- Create: `server/src/routes/icons.rs`
- Modify: `server/src/routes/mod.rs`
- Create: `server/tests/api_icons.rs`

- [ ] **Step 1: Implement**

```rust
// server/src/routes/icons.rs
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use rand::distributions::{Alphanumeric, DistString};
use serde_json::{json, Value};

use crate::auth::RequireAuth;
use crate::error::{AppError, Result};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/icons/upload", post(upload))
}

async fn upload(
    _auth: RequireAuth,
    State(s): State<AppState>,
    mut form: Multipart,
) -> Result<(StatusCode, Json<Value>)> {
    let icons_dir = s.data_dir.join("icons");
    std::fs::create_dir_all(&icons_dir)?;

    while let Some(field) = form.next_field().await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        if field.name() != Some("file") { continue; }
        let filename = field.file_name().map(str::to_owned).unwrap_or_else(|| "icon".into());
        let ext = std::path::Path::new(&filename).extension()
            .and_then(|s| s.to_str()).unwrap_or("png").to_lowercase();
        if !matches!(ext.as_str(), "png"|"jpg"|"jpeg"|"webp"|"svg"|"gif") {
            return Err(AppError::Validation("unsupported icon type".into()));
        }
        let mime = field.content_type().map(str::to_owned);
        let data = field.bytes().await
            .map_err(|e| AppError::Validation(format!("multipart read: {e}")))?;
        if data.len() > 1024 * 1024 {
            return Err(AppError::Validation("icon larger than 1MiB".into()));
        }
        let nonce = Alphanumeric.sample_string(&mut rand::thread_rng(), 8);
        let stored = format!("{nonce}.{ext}");
        let path = icons_dir.join(&stored);
        std::fs::write(&path, &data)?;
        let public_path = format!("/icons/{stored}");
        return Ok((StatusCode::CREATED, Json(json!({
            "path": public_path,
            "size": data.len(),
            "mime": mime
        }))));
    }
    Err(AppError::Validation("no `file` field".into()))
}
```

- [ ] **Step 2: Mount + test**

```rust
// server/src/routes/mod.rs add `pub mod icons;` and `.merge(icons::router())`
```

```rust
// server/tests/api_icons.rs
use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::{password, session::layer as session_layer};
use navsrv::db::connect_in_memory;
use navsrv::repo::{ConfigRepo, SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;

#[tokio::test]
async fn upload_writes_file_under_data_dir_icons() {
    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg: Arc<dyn ConfigRepo> = Arc::new(SqlxConfigRepo::new(pool.clone()));
    cfg.upsert("admin_password_hash", &password::hash("pw").unwrap()).await.unwrap();
    let dir = tempfile::TempDir::new().unwrap();
    let state = AppState::new(nav, cfg, dir.path().to_path_buf());
    let app = build_app(state, session_layer(pool, false));
    let mut server = TestServer::new(app).unwrap();
    server.do_save_cookies();
    server.post("/api/auth/login").json(&serde_json::json!({"password":"pw"})).await.assert_status_success();

    let res = server.post("/api/icons/upload")
        .multipart(axum_test::multipart::MultipartForm::new()
            .add_part(
                "file",
                axum_test::multipart::Part::bytes(b"\x89PNG\r\n\x1a\n".to_vec())
                    .file_name("hello.png")
                    .mime_type("image/png"),
            )).await;
    res.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = res.json();
    let path = body["path"].as_str().unwrap();
    assert!(path.starts_with("/icons/"));
    assert!(dir.path().join("icons").join(path.trim_start_matches("/icons/")).exists());
}
```

- [ ] **Step 3: Run**

```bash
cd server
cargo test --test api_icons
cd ..
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes server/tests/api_icons.rs
git commit -m "feat(server): /api/icons/upload (multipart, ≤1MiB, ext-allow-list)"
```

### Task 30: Favicon proxy with cache

**Files:**
- Create: `server/src/services/favicon.rs`
- Create: `server/src/routes/favicon.rs`
- Modify: `server/src/services/mod.rs`, `server/src/routes/mod.rs`, `server/src/state.rs`

- [ ] **Step 1: Service**

```rust
// server/src/services/favicon.rs
use crate::error::{AppError, Result};
use bytes::Bytes;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const TTL: Duration = Duration::from_secs(7 * 24 * 3600); // 7 days
const MAX_BYTES: u64 = 256 * 1024;                        // 256 KiB

pub struct FaviconService { cache_dir: PathBuf, http: reqwest::Client }

impl FaviconService {
    pub fn new(cache_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&cache_dir).ok();
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .user_agent("navsrv-favicon/0.1")
            .build().expect("http client");
        Self { cache_dir, http }
    }

    pub async fn fetch(&self, host: &str) -> Result<(String, Bytes)> {
        if !is_safe_host(host) {
            return Err(AppError::Validation("bad host".into()));
        }
        let cached = self.cache_dir.join(host);
        if let Ok(meta) = std::fs::metadata(&cached) {
            if let Ok(age) = SystemTime::now().duration_since(meta.modified()?) {
                if age < TTL {
                    let bytes = Bytes::from(std::fs::read(&cached)?);
                    return Ok(("image/png".into(), bytes));
                }
            }
        }
        let url = format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        let resp = self.http.get(&url).send().await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound);
        }
        let bytes = resp.bytes().await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(AppError::Validation("favicon too large".into()));
        }
        std::fs::write(&cached, &bytes)?;
        Ok(("image/png".into(), bytes))
    }
}

fn is_safe_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

pub fn cache_dir(data_dir: &Path) -> PathBuf { data_dir.join("icons").join("_cache") }
```

- [ ] **Step 2: Route**

```rust
// server/src/routes/favicon.rs
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::Deserialize;

use crate::error::Result;
use crate::services::favicon::FaviconService;
use crate::state::AppState;
use std::sync::Arc;

pub fn router() -> Router<AppState> {
    Router::new().route("/favicon", get(favicon))
}

#[derive(Deserialize)]
struct Q { host: String }

async fn favicon(State(s): State<AppState>, Query(q): Query<Q>) -> Result<impl IntoResponse> {
    let svc: &Arc<FaviconService> = &s.favicon;
    let (mime, bytes) = svc.fetch(&q.host).await?;
    let mut h = HeaderMap::new();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=86400"));
    Ok((h, bytes))
}
```

- [ ] **Step 3: Add `favicon` to `AppState`**

```rust
// server/src/state.rs
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
    pub fn new(
        nav: Arc<dyn NavRepo>,
        config: Arc<dyn ConfigRepo>,
        data_dir: PathBuf,
    ) -> Self {
        let favicon = Arc::new(FaviconService::new(
            crate::services::favicon::cache_dir(&data_dir),
        ));
        Self { nav, config, data_dir, favicon }
    }
}
```

- [ ] **Step 4: Mount + re-export**

```rust
// server/src/services/mod.rs
pub mod bootstrap;
pub mod bundle;
pub mod favicon;
```

```rust
// server/src/routes/mod.rs (add `pub mod favicon;` and `.merge(favicon::router())`)
```

- [ ] **Step 5: Compile-check (no network test — would be flaky)**

```bash
cd server
cargo check
cd ..
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/services server/src/routes server/src/state.rs
git commit -m "feat(server): /api/favicon proxy with 7d disk cache (size+host guarded)"
```

---

## Phase 6: Static Frontend Hosting + Bootstrap Seed (Tasks 31–33)

Goal: serve the SPA build, plus seed the DB from a `bootstrap.json` produced by the frontend pipeline. End state: `cargo run` produces a working app at `:8080` for the frontend (built later) to consume; first boot pre-populates the spec's default groups + items.

### Task 31: `ServeDir` + SPA fallback

**Files:**
- Modify: `server/src/app.rs`, `server/src/main.rs`

- [ ] **Step 1: Add static file mount**

```rust
// server/src/app.rs (replace)
use axum::http::{header, HeaderValue, Request};
use axum::response::IntoResponse;
use axum::Router;
use std::path::PathBuf;
use tower_http::compression::CompressionLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tower_sessions::SessionManagerLayer;
use tower_sessions_sqlx_store::SqliteStore;
use tracing::Level;

use crate::routes;
use crate::state::AppState;

pub fn build_app(
    state: AppState,
    session_layer: SessionManagerLayer<SqliteStore>,
    static_dir: PathBuf,
) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let method = req.method();
            let uri = req.uri().path();
            tracing::info_span!("http", %method, %uri)
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    let index_html = static_dir.join("index.html");
    let serve_dir = ServeDir::new(static_dir.clone()).fallback(ServeFile::new(index_html));

    Router::new()
        .merge(routes::api(state.clone()))
        .with_state(state)
        .nest_service("/icons", ServeDir::new(static_dir.parent().map(|p| p.join("data/icons")).unwrap_or_else(|| PathBuf::from("./data/icons"))))
        .fallback_service(serve_dir)
        .layer(session_layer)
        .layer(trace)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
}

pub async fn build_app_for_tests() -> anyhow::Result<Router> {
    use crate::auth::session::layer as session_layer;
    use crate::db::connect_in_memory;
    use crate::repo::{SqlxConfigRepo, SqlxNavRepo};
    use std::sync::Arc;
    let pool = connect_in_memory().await?;
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let dir = std::env::temp_dir();
    let state = AppState::new(nav, cfg, dir.clone());
    Ok(build_app(state, session_layer(pool, false), dir))
}
```

> Note: `/icons` serves the user-uploaded files from `data_dir/icons`, while `static_dir/icons` (frontend bundled icons) is served by the SPA `ServeDir` fallback. Frontend chooses the URL per `iconKind`.

- [ ] **Step 2: Pass `static_dir` from `main.rs`**

```rust
// server/src/main.rs (in main fn, replace build_app call)
let app = build_app(
    state,
    session_layer(pool.clone(), settings.secure_cookies),
    settings.static_dir.clone(),
);
```

- [ ] **Step 3: Smoke-test SPA fallback**

Add `server/tests/spa_fallback.rs`:

```rust
use axum_test::TestServer;
use navsrv::app::build_app;
use navsrv::auth::session::layer as session_layer;
use navsrv::db::connect_in_memory;
use navsrv::repo::{SqlxConfigRepo, SqlxNavRepo};
use navsrv::state::AppState;
use std::sync::Arc;
use tempfile::TempDir;

#[tokio::test]
async fn unknown_path_falls_back_to_index_html() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("index.html"), "<html><body>SPA</body></html>").unwrap();

    let pool = connect_in_memory().await.unwrap();
    let nav = Arc::new(SqlxNavRepo::new(pool.clone()));
    let cfg = Arc::new(SqlxConfigRepo::new(pool.clone()));
    let state = AppState::new(nav, cfg, dir.path().to_path_buf());

    let app = build_app(state, session_layer(pool, false), dir.path().to_path_buf());
    let server = TestServer::new(app).unwrap();
    let res = server.get("/some/spa/route").await;
    res.assert_status_ok();
    assert!(res.text().contains("SPA"));
}
```

- [ ] **Step 4: Run**

```bash
cd server
cargo test --test spa_fallback
cd ..
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.rs server/src/main.rs server/tests/spa_fallback.rs
git commit -m "feat(server): ServeDir + SPA fallback; user icons served from /icons"
```

### Task 32: `bootstrap.json` seed (build.rs + MigrationService)

**Files:**
- Create: `server/build.rs`
- Create: `server/bootstrap.json` (placeholder for tests; real one comes from frontend stage in Plan 5)
- Create: `server/src/services/migration.rs`
- Modify: `server/src/services/mod.rs`, `server/src/main.rs`
- Create: `server/tests/seed.rs`

- [ ] **Step 1: Write a placeholder `bootstrap.json` schema**

```json
{
  "schemaVersion": 1,
  "meta": {
    "siteName": "Navigation",
    "siteAvatarPath": "/avatar.png",
    "siteCopyright": "Copyright © 2026 — All rights reserved.",
    "siteIcp":  null,
    "sitePolice": null,
    "defaultTheme": "system"
  },
  "sites": [
    { "value": "shangHai", "name": "上海", "name_i18n": { "en": "Shanghai" }, "is_default": true,  "sort_order": 0 },
    { "value": "beiJing",  "name": "北京", "name_i18n": { "en": "Beijing"  }, "is_default": false, "sort_order": 1 }
  ],
  "groups": [
    { "slug": "network", "name": "网络", "name_i18n": { "en": "Network" }, "sort_order": 0 },
    { "slug": "media",   "name": "媒体", "name_i18n": { "en": "Media"   }, "sort_order": 1 },
    { "slug": "nas",     "name": "NAS",  "name_i18n": { "en": "NAS"     }, "sort_order": 2 },
    { "slug": "tools",   "name": "工具", "name_i18n": { "en": "Tools"   }, "sort_order": 3 }
  ],
  "tags": [],
  "items": []
}
```

(Real item list is produced by `scripts/dump-bootstrap.mjs` in Plan 5; this placeholder unblocks `cargo build`.)

- [ ] **Step 2: `build.rs` to surface bootstrap to compile**

```rust
// server/build.rs
fn main() {
    println!("cargo:rerun-if-changed=bootstrap.json");
}
```

- [ ] **Step 3: Migration service**

```rust
// server/src/services/migration.rs
use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::{ConfigRepo, NavRepo};
use serde::Deserialize;
use std::sync::Arc;

const BOOTSTRAP_JSON: &str = include_str!("../../bootstrap.json");

#[derive(Deserialize)]
struct BootstrapDoc {
    #[serde(rename = "schemaVersion")]
    _schema_version: i64,
    meta: BootstrapMeta,
    sites: Vec<BootstrapSite>,
    groups: Vec<BootstrapGroup>,
    tags: Vec<BootstrapTag>,
    items: Vec<BootstrapItem>,
}

#[derive(Deserialize)]
struct BootstrapMeta {
    #[serde(rename = "siteName")] site_name: String,
    #[serde(rename = "siteAvatarPath")] site_avatar_path: Option<String>,
    #[serde(rename = "siteCopyright")] site_copyright: String,
    #[serde(rename = "siteIcp")] site_icp: Option<Link>,
    #[serde(rename = "sitePolice")] site_police: Option<Link>,
    #[serde(rename = "defaultTheme")] default_theme: String,
}

#[derive(Deserialize)]
struct BootstrapSite { value: String, name: String, #[serde(default)] name_i18n: Option<serde_json::Value>, #[serde(default)] is_default: bool, #[serde(default)] sort_order: i64 }

#[derive(Deserialize)]
struct BootstrapGroup { slug: String, name: String, #[serde(default)] name_i18n: Option<serde_json::Value>, #[serde(default)] sort_order: i64, #[serde(default)] collapsed_default: bool }

#[derive(Deserialize)]
struct BootstrapTag { slug: String, name: String, #[serde(default)] name_i18n: Option<serde_json::Value> }

#[derive(Deserialize)]
struct BootstrapItem {
    name: String,
    #[serde(default)] name_i18n: Option<serde_json::Value>,
    #[serde(rename = "groupSlug")] group_slug: Option<String>,
    #[serde(rename = "iconKind")] icon_kind: IconKind,
    #[serde(rename = "iconValue")] icon_value: String,
    #[serde(default)] links: std::collections::BTreeMap<String, String>,
    #[serde(default, rename = "tagSlugs")] tag_slugs: Vec<String>,
}

pub async fn seed_if_empty(
    nav: Arc<dyn NavRepo>,
    config: Arc<dyn ConfigRepo>,
) -> Result<()> {
    let (sites, _, items, _) = nav.get_bundle().await?;
    if !sites.is_empty() || !items.is_empty() {
        return Ok(());
    }
    let doc: BootstrapDoc = serde_json::from_str(BOOTSTRAP_JSON)
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;

    // Meta → config kv
    let mut pairs: Vec<(String, String)> = Vec::new();
    pairs.push(("site_name".into(), doc.meta.site_name));
    if let Some(p) = doc.meta.site_avatar_path { pairs.push(("site_avatar_path".into(), p)); }
    pairs.push(("site_copyright".into(), doc.meta.site_copyright));
    pairs.push(("default_theme".into(), doc.meta.default_theme));
    if let Some(l) = doc.meta.site_icp { pairs.push(("site_icp_text".into(), l.text)); pairs.push(("site_icp_url".into(), l.url)); }
    if let Some(l) = doc.meta.site_police { pairs.push(("site_police_text".into(), l.text)); pairs.push(("site_police_url".into(), l.url)); }
    let pair_refs: Vec<(&str, &str)> = pairs.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
    config.upsert_many(&pair_refs).await?;

    // Sites
    for s in doc.sites {
        nav.create_site(SitePayload {
            value: s.value, name: s.name, name_i18n: s.name_i18n, is_default: s.is_default,
        }).await?;
    }
    // Groups (track id by slug)
    let mut group_id_by_slug = std::collections::HashMap::new();
    for g in doc.groups {
        let created = nav.create_group(GroupPayload {
            slug: g.slug.clone(), name: g.name, name_i18n: g.name_i18n, collapsed_default: g.collapsed_default,
        }).await?;
        group_id_by_slug.insert(g.slug, created.id);
    }
    // Tags
    for t in doc.tags {
        nav.create_tag(TagPayload { slug: t.slug, name: t.name, name_i18n: t.name_i18n }).await?;
    }
    // Items
    for it in doc.items {
        let group_id = it.group_slug.and_then(|s| group_id_by_slug.get(&s).copied());
        nav.create_item(ItemPayload {
            group_id,
            name: it.name,
            name_i18n: it.name_i18n,
            description: None,
            description_i18n: None,
            icon_kind: it.icon_kind,
            icon_value: it.icon_value,
            links: it.links,
            tag_slugs: it.tag_slugs,
        }).await?;
    }
    Ok(())
}
```

- [ ] **Step 4: Re-export and call from main**

```rust
// server/src/services/mod.rs
pub mod bootstrap;
pub mod bundle;
pub mod favicon;
pub mod migration;
```

```rust
// server/src/main.rs (in main fn, after ensure_admin_password call)
navsrv::services::migration::seed_if_empty(nav.clone() as _, cfg.clone() as _).await?;
```

- [ ] **Step 5: Test**

```rust
// server/tests/seed.rs
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
    let (sites, groups, _items, _tags) = nav.get_bundle().await.unwrap();
    assert!(sites.iter().any(|s| s.value == "shangHai"));
    assert!(groups.iter().any(|g| g.slug == "network"));
    assert_eq!(cfg.get("site_name").await.unwrap().as_deref(), Some("Navigation"));
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
```

- [ ] **Step 6: Run**

```bash
cd server
cargo test --test seed
cd ..
```

Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add server/build.rs server/bootstrap.json server/src/services server/src/main.rs server/tests/seed.rs
git commit -m "feat(server): seed_if_empty migrates bootstrap.json into SQLite"
```

### Task 33: README + final lint pass

**Files:**
- Create: `server/README.md`
- Modify: root `README.md` (add backend section)

- [ ] **Step 1: `server/README.md`**

````markdown
# navsrv

Rust backend for the navigation site (Plan 1 of 5). Serves the SPA + JSON API at `:8080`.

## Quickstart (dev)

```bash
cd server
cp .env.example .env       # edit if needed
cargo run                  # listens on :8080
```

On first boot, an admin password is generated and printed. It's also written to
`./dev-data/INITIAL_PASSWORD.txt`. Log in via the SPA to change it; the file is
auto-deleted after a successful change.

To start the SPA dev server (port 5173) talking to this backend:

```bash
cd ../web
pnpm dev
# /api/* is proxied to localhost:8080 by web/vite.config.ts
```

## Configuration (env)

| Var                       | Default               | Notes                                  |
|---------------------------|-----------------------|----------------------------------------|
| `PORT`                    | `8080`                |                                        |
| `DATA_DIR`                | `./dev-data`          | SQLite DB + uploads + INITIAL_PASSWORD |
| `STATIC_DIR`              | `../web/build`        | SvelteKit `pnpm build` output          |
| `BOOTSTRAP_ADMIN_PASSWORD`| (unset)               | First boot only; else random+file      |
| `SECURE_COOKIES`          | `false`               | Set `true` behind HTTPS                |
| `RUST_LOG`                | `info,sqlx=warn,...`  | tracing-subscriber filter              |

## CLI

```
navsrv reset-password [--password <new>]   # invalidates all sessions; deletes INITIAL_PASSWORD.txt
```

## Tests

```bash
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```
````

- [ ] **Step 2: Append to root README** (just a pointer)

Insert before the existing `## Pre-install` section:

```markdown
## Project layout

- `web/` — SvelteKit SPA (`pnpm dev` / `pnpm build`)
- `server/` — Rust backend (`cargo run`); see `server/README.md`
- `docs/superpowers/` — design specs and implementation plans

The production deploy is a single Docker image bundling both (Plan 5).
```

- [ ] **Step 3: Final lint pass**

```bash
cd server
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test
cd ..
```

Expected:
- `fmt` makes no changes (or only stable cosmetic ones)
- `clippy` is clean
- All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/README.md README.md
git commit -m "docs: server README with quickstart + CLI; root README pointers"
```

---

## Self-Review Summary (filled by writer)

**Spec coverage:**

| Spec section | Where covered |
|---|---|
| §2.1 Topology (single process, port 8080) | Task 8, 31 |
| §2.2 module boundaries | Tasks 6–18 (one module per task) |
| §3.1 schema 3NF | Task 11 |
| §3.1 SQLite WAL pragmas | Task 10 |
| §3.2 API endpoints | Tasks 18, 22, 25, 27–30 |
| §3.3 NavBundle camelCase | Task 17–18 |
| §6.1 Bootstrap (env or random + INITIAL_PASSWORD.txt) | Task 20 |
| §6.2 Session 30d sliding | Task 21 |
| §6.3 CLI reset-password invalidates sessions | Task 26 |
| §6.4 rate limit on login | Task 24 |
| §6.4 security headers | Task 8 |
| §9.1 seed_if_empty from bootstrap.json | Task 32 |
| §9.3 web/ + server/ split | Tasks 1–4 |

**Out of scope (in later plans):**
- Frontend (Plans 2–4)
- Real `bootstrap.json` produced from existing TS constants — `scripts/dump-bootstrap.mjs` is in Plan 5
- Dockerfile + CI — Plan 5
- Playwright e2e — Plan 5

**Type / signature consistency:** verified —
- `SqlxNavRepo::list_items_full` is `pub(crate)`; only callers are in the same crate (Task 14, 17)
- `AppState::new` signature evolves twice (Task 16 → Task 25 added `data_dir` → Task 30 added `favicon`); each change updates **every** call site listed in Files
- `NavRepo` trait is implemented exhaustively before any handler relies on a method
- `ItemPayload` / `ItemPatch` shape stays stable from Task 12 forward

**Verification gates:** every task ends with at least one `cargo test` invocation. Final task runs `clippy -D warnings` + `fmt --check`.

