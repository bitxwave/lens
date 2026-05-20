# Navigation Website

A self-hostable navigation/bookmark dashboard with a Rust backend (Axum + SQLite),
a SvelteKit SPA frontend, and an inline editor for the admin.

## Quickstart (Docker)

```bash
docker run -d \
  --name nav \
  -p 8080:8080 \
  -v ./data:/app/data \
  -e BOOTSTRAP_ADMIN_PASSWORD=changeme \
  navsrv:latest
```

Visit http://localhost:8080. Click **Log in** in the top-right, enter your password,
then click **Edit** to add/remove nav items inline.

For HTTPS with Let's Encrypt, use `docker compose up -d` with the bundled
`docker-compose.yml` (set `DOMAIN=nav.example.com`).

## Project layout

| Path | Purpose |
|---|---|
| `web/` | SvelteKit 2 + Svelte 5 SPA. `pnpm dev` for local dev (proxies `/api` to `:8080`). |
| `server/` | Rust binary (`navsrv`). `cargo run` for local dev (default port 8080). |
| `tests/` | Playwright e2e specs covering read + login + create. |
| `scripts/` | `docker-smoke.sh`, `e2e.sh`, `dump-bootstrap.mjs`. |
| `docs/superpowers/` | Design specs and implementation plans. |
| `Dockerfile` | Multi-stage build → distroless single image. |
| `docker-compose.yml` + `Caddyfile` | Optional TLS-fronted deploy. |

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

## Configuration (env)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8080` | TCP port |
| `DATA_DIR` | `/app/data` (Docker) / `./dev-data` (cargo) | SQLite + uploads + INITIAL_PASSWORD |
| `STATIC_DIR` | `/app/static` (Docker) / `../web/build` (cargo) | SvelteKit build output |
| `BOOTSTRAP_ADMIN_PASSWORD` | (unset) | First boot only; otherwise random + file |
| `SECURE_COOKIES` | `false` (dev) / `true` (compose) | `true` requires HTTPS |
| `RUST_LOG` | `info,sqlx=warn,tower_http=info` | tracing-subscriber filter |

## Resetting the admin password

```bash
docker exec -it nav navsrv reset-password --password=<new>
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
