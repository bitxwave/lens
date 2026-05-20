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
