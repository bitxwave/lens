# Lens

A self-hostable navigation/bookmark dashboard with a Rust backend (Axum + SQLite),
a SvelteKit SPA frontend, and an inline editor for the admin. Each nav item can
expose multiple URLs grouped under user-defined "sites" (think work / home,
or shanghai / beijing) — switch the active site from the header and every card
re-points to its matching URL without changing the layout.

The Rust binary serves both the JSON API (`/api/*`) and the SvelteKit SPA static
assets in a single process — no separate web server or reverse proxy required.
Designed for intranet self-hosting; expose via your network's existing TLS
terminator if needed.

## Quickstart (Docker)

```bash
docker run -d \
  --name lens \
  -p 8080:8080 \
  -v ./data:/app/data \
  -e BOOTSTRAP_ADMIN_PASSWORD=changeme \
  lens:latest
```

Visit http://localhost:8080. Click **Log in** in the top-right, enter your password,
then click **Edit** to add/remove nav items inline.

See [Deployment](#deployment) for compose, custom port, and data persistence options.

## Project layout

| Path | Purpose |
|---|---|
| `web/` | SvelteKit 2 + Svelte 5 SPA. `pnpm dev` for local dev (proxies `/api` to `:8080`). |
| `server/` | Rust binary (`lens`). `cargo run` for local dev (default port 8080). |
| `tests/` | Playwright e2e specs covering read + login + create. |
| `scripts/` | `docker-smoke.sh`, `e2e.sh`, `dump-bootstrap.mjs`. |
| `docs/superpowers/` | Design specs and implementation plans. |
| `Dockerfile` | Multi-stage build → distroless single image. |
| `docker-compose.yml` | Sample single-service compose for intranet self-host. |

## Local development

Backend (terminal A):

```bash
cd server
cargo run            # listens on :8080
```

On first boot, an admin password is generated and printed; it's also written to
`server/dev-data/INITIAL_PASSWORD.txt` (auto-deleted after the first password
change via the UI).

Frontend (terminal B):

```bash
cd web
pnpm install         # uses pinned pnpm 10 via packageManager
pnpm dev             # listens on :5173, proxies /api to :8080
```

Run unit tests:

```bash
cd web && pnpm test:unit
cd server && SQLX_OFFLINE=true cargo test
```

Run e2e (requires Docker):

```bash
bash scripts/e2e.sh
```

## Build

### Frontend (SvelteKit SPA)

```bash
cd web
pnpm install
pnpm build           # outputs to web/build (static assets)
```

### Backend (Rust release binary)

```bash
cd server
SQLX_OFFLINE=true cargo build --release --bin lens
# binary at server/target/release/lens
```

Run it with the SPA build directly (no Docker):

```bash
cd server
STATIC_DIR=../web/build DATA_DIR=./prod-data \
  ./target/release/lens
```

### Docker image

```bash
docker build -t lens:latest .
```

The multi-stage `Dockerfile`:
1. builds the SPA with `node:20-alpine` + pnpm,
2. builds the Rust binary with `rust:1.88-slim` (uses `SQLX_OFFLINE=true` against
   the committed `server/.sqlx/` cache),
3. assembles a distroless `gcr.io/distroless/cc-debian12` runtime (~70 MB) with
   the binary at `/usr/local/bin/lens` and SPA assets at `/app/static`.

Smoke-test the freshly built image:

```bash
bash scripts/docker-smoke.sh
```

## Deployment

Single-process, single-port. Mount one volume for the SQLite DB + uploaded icons.

### docker compose (recommended)

```bash
PORT=8080 BOOTSTRAP_ADMIN_PASSWORD=changeme docker compose up -d
```

`docker-compose.yml` publishes `${PORT}:${PORT}` and bind-mounts `./data` to
`/app/data`. To switch ports later, change `PORT` and `up -d` again — both the
host mapping and the container's listening port follow the same variable.

### docker run

```bash
docker run -d --name lens \
  -e PORT=9090 -p 9090:9090 \
  -v ./data:/app/data \
  -e BOOTSTRAP_ADMIN_PASSWORD=changeme \
  lens:latest
```

If you keep the default `PORT=8080` baked into the image, just publish
`-p <host>:8080`.

### Data persistence

Everything stateful lives under `DATA_DIR` (defaults to `/app/data` in Docker):

- `data.db` — SQLite (WAL); contains nav items, sites, groups, admin password hash
- `icons/` — proxied/uploaded favicon cache (7-day TTL refresh)
- `INITIAL_PASSWORD.txt` — generated on first boot if `BOOTSTRAP_ADMIN_PASSWORD`
  is unset; auto-deleted after the first password change via the UI

Back up the volume to back up the whole instance.

### Behind a reverse proxy (optional)

For HTTPS or path prefixing, front `lens` with any reverse proxy (Caddy,
nginx, Traefik, Cloudflare Tunnel, Tailscale Funnel...). When TLS is terminated
upstream, set `SECURE_COOKIES=true` so session cookies are marked `Secure`.

## Configuration (env)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8080` | TCP port |
| `DATA_DIR` | `/app/data` (Docker) / `./dev-data` (cargo) | SQLite + uploads + INITIAL_PASSWORD |
| `STATIC_DIR` | `/app/static` (Docker) / `../web/build` (cargo) | SvelteKit build output |
| `BOOTSTRAP_ADMIN_PASSWORD` | (unset) | First boot only; otherwise random + file |
| `SECURE_COOKIES` | `false` | Set `true` only when serving over HTTPS |
| `RUST_LOG` | `info,sqlx=warn,tower_http=info` | tracing-subscriber filter |

## Resetting the admin password

```bash
docker exec -it lens lens reset-password --password=<new>
# or interactively (the binary prompts)
```

This invalidates all sessions and removes any leftover `INITIAL_PASSWORD.txt`.

## Architecture

See `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md` for the
full design. Briefly:

- **Frontend**: Svelte 5 (runes) + SvelteKit 2, no UI library — design tokens and
  10 hand-built primitives under `web/src/lib/components/ui/`. `apiClient` validates
  every response against zod schemas mirroring the backend types. Self-implemented
  i18n (~80 lines), no library.
- **Backend**: Axum 0.7 + SQLx (SQLite WAL). 3NF schema. Single-admin auth
  (bcrypt + signed cookie session via `tower-sessions`). CRUD endpoints behind a
  `RequireAuth` extractor. Favicon proxy with 7-day disk cache. CLI subcommand
  for password reset.
- **Deploy**: Multi-stage Dockerfile produces a distroless image (~70 MB). The
  Rust binary serves both the SPA (`tower-http::ServeDir` with SPA fallback) and
  `/api/*`.

## Roadmap

Future enhancements (not in current shipped Plans 1–5):

- Drag-and-drop reorder of nav items
- Full management UI for groups, sites, tags (currently editable via API only)
- Site settings dialog (site name, avatar upload, ICP filings, default theme)
- Multi-user / OAuth / audit log
- Real-time multi-device sync (SSE)
- PWA / offline

## License

MIT.
