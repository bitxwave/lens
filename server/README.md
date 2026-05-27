# lens

Rust backend for the navigation site. Single Axum process that serves both the
SvelteKit SPA static assets and the JSON API. Default port `8080`, override with
`PORT=<n>`.

## Quickstart (dev)

```bash
cd server
cp .env.example .env       # edit if needed
cargo run                  # listens on :8080 (override with PORT=9090 cargo run)
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
| `PORT`                    | `8080`                | TCP listen port; bind addr is `0.0.0.0`|
| `DATA_DIR`                | `./dev-data`          | SQLite DB + uploads + INITIAL_PASSWORD |
| `STATIC_DIR`              | `../web/build`        | SvelteKit `pnpm build` output          |
| `BOOTSTRAP_ADMIN_PASSWORD`| (unset)               | First boot only; else random+file      |
| `SECURE_COOKIES`          | `false`               | Set `true` behind HTTPS                |
| `RUST_LOG`                | `info,sqlx=warn,...`  | tracing-subscriber filter              |

## Build

```bash
SQLX_OFFLINE=true cargo build --release --bin lens
# binary at target/release/lens; runs against the committed .sqlx/ query cache
```

To regenerate the query cache after schema/query changes:

```bash
DATABASE_URL=sqlite://./dev-data/data.db cargo sqlx prepare
```

## CLI

```
lens reset-password [--password <new>]   # invalidates all sessions; deletes INITIAL_PASSWORD.txt
```

## Tests

```bash
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```
