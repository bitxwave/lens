# Docker + E2E + README Implementation Plan (Plan 5 of 5 — Final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a production-ready single-image deploy. After this plan: `docker run -d -p 8080:8080 -v ./data:/app/data -e BOOTSTRAP_ADMIN_PASSWORD=… navsrv:latest` boots the full stack (Rust backend + SvelteKit SPA bundled together) on port 8080. Optional `docker compose up` adds Caddy with auto-TLS in front. A small Playwright e2e suite verifies the read + login + create flow against a real container. README has the quickstart at the top.

**Out of scope (intentionally not in any of the 5 plans):** drag-drop reorder, full Group/Site/Tag management UI, SiteSettingsDialog, icon upload UI, full edit-mode polish. These are listed in the project README as future enhancements.

**Architecture:** A single multi-stage Dockerfile produces a small distroless image. Stage 1 builds the SvelteKit SPA. Stage 2 builds the Rust binary, embedding `bootstrap.json` via `include_str!`. Stage 3 copies the binary + the `web/build/` static files into a minimal runtime image. The Rust binary uses `tower-http::ServeDir` to serve the SPA and `axum` to serve `/api/*` (Plan 1 §2.1). Volume `/app/data` persists SQLite + uploads + INITIAL_PASSWORD.txt across container recreates.

The `dump-bootstrap.mjs` script is included to regenerate the seed bootstrap.json from a hand-curated source (a small TS file under `scripts/`), but in this plan we ship a pre-generated `server/bootstrap.json` directly — the regeneration script exists for future maintainers.

**Tech Stack (already provisioned):** Plans 1, 1.5, 2, 3, 4 + Docker (host).

**Spec reference:** `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md` § 9.2 (Docker), § 9.5 (deployment), § 10 (roadmap closure).

**Predecessors:** All previous plans merged into `feat/rust-platform`.
**Successors:** none — this is the final plan. After Plan 5 merges into `feat/rust-platform`, the integration branch is ready to PR into `master`.

---

## Conventions

- **Working directory:** root of the worktree for Docker; `web/` for pnpm; `server/` for cargo; root for `playwright`.
- **Sub-branch:** `plan-5/docker-e2e`, branched from `feat/rust-platform`.
- **Commits:** Conventional Commits, no `Co-Authored-By` trailer. One commit per task.
- **Verification gate:** every Docker task ends with a working `docker build` (or `docker run`); every code task ends with `pnpm check` / `cargo check` clean.

---

## Phase 0: Real bootstrap data (Tasks 1–2)

### Task 1: Real bootstrap.json with default 17 nav items

**Files:**
- Modify: `server/bootstrap.json`

The current `server/bootstrap.json` is a placeholder (Plan 1 Task 32) with empty `items`. Replace with the real default content per spec §10.3 (4 groups × ~17 items, plus the original sites/copyright).

- [ ] **Step 1: Replace `server/bootstrap.json` with the full content**

```json
{
  "schemaVersion": 1,
  "meta": {
    "siteName": "Pico 的小站导航",
    "siteAvatarPath": "/avatar.png",
    "siteCopyright": "Copyright © 2026 Pico. All rights reserved.",
    "siteIcp": null,
    "sitePolice": null,
    "defaultTheme": "system"
  },
  "sites": [
    { "value": "shangHai", "name": "上海", "name_i18n": { "en": "Shanghai" }, "is_default": true,  "sort_order": 0 },
    { "value": "beiJing",  "name": "北京", "name_i18n": { "en": "Beijing"  }, "is_default": false, "sort_order": 1 },
    { "value": "guangZhou","name": "广州", "name_i18n": { "en": "Guangzhou"}, "is_default": false, "sort_order": 2 },
    { "value": "shenZhen", "name": "深圳", "name_i18n": { "en": "Shenzhen" }, "is_default": false, "sort_order": 3 }
  ],
  "groups": [
    { "slug": "network", "name": "网络", "name_i18n": { "en": "Network" }, "sort_order": 0 },
    { "slug": "media",   "name": "媒体", "name_i18n": { "en": "Media"   }, "sort_order": 1 },
    { "slug": "nas",     "name": "NAS",  "name_i18n": { "en": "NAS"     }, "sort_order": 2 },
    { "slug": "tools",   "name": "工具", "name_i18n": { "en": "Tools"   }, "sort_order": 3 }
  ],
  "tags": [],
  "items": [
    { "name": "RouterOS",     "groupSlug": "network", "iconKind": "asset", "iconValue": "routerOS.png",         "links": { "shangHai": "http://10.0.0.1",  "beiJing": "http://10.1.0.1" }, "tagSlugs": [] },
    { "name": "OpenWRT",      "groupSlug": "network", "iconKind": "asset", "iconValue": "openWRT.png",          "links": { "shangHai": "http://10.0.0.2",  "beiJing": "http://10.1.0.2" }, "tagSlugs": [] },
    { "name": "K2P",          "groupSlug": "network", "iconKind": "asset", "iconValue": "phicomm.png",          "links": { "shangHai": "http://10.0.0.4",  "beiJing": "http://10.1.0.4", "shenZhen": "http://10.2.0.4" }, "tagSlugs": [] },
    { "name": "qBittorrent",  "groupSlug": "network", "iconKind": "asset", "iconValue": "qBittorrent.png",      "links": { "shangHai": "http://10.0.0.11:8085", "beiJing": "http://10.1.0.11:8085" }, "tagSlugs": [] },
    { "name": "Jackett",      "groupSlug": "network", "iconKind": "asset", "iconValue": "jackett.png",          "links": { "shangHai": "http://10.0.0.13",  "beiJing": "http://10.1.0.13" }, "tagSlugs": [] },

    { "name": "Jellyfin",     "groupSlug": "media",   "iconKind": "asset", "iconValue": "jellyfin.svg",         "links": { "shangHai": "http://10.0.0.12",  "beiJing": "http://10.1.0.12" }, "tagSlugs": [] },
    { "name": "Surveillance", "groupSlug": "media",   "iconKind": "asset", "iconValue": "surveillanceStation.png","links": { "shangHai": "http://10.0.0.5:9900", "beiJing": "http://10.1.0.5:9900" }, "tagSlugs": [] },
    { "name": "相册",         "name_i18n": { "en": "Album" }, "groupSlug": "media", "iconKind": "asset", "iconValue": "album.png", "links": { "shangHai": "http://10.0.0.5:5080", "beiJing": "http://10.1.0.5:5080" }, "tagSlugs": [] },

    { "name": "Synology",     "groupSlug": "nas",     "iconKind": "asset", "iconValue": "synology.png",         "links": { "shangHai": "http://10.0.0.5:5000", "beiJing": "http://10.1.0.5:5000" }, "tagSlugs": [] },
    { "name": "文件夹",       "name_i18n": { "en": "Files" }, "groupSlug": "nas", "iconKind": "asset", "iconValue": "file.png", "links": { "shangHai": "http://10.0.0.5:7000", "beiJing": "http://10.1.0.5:7000" }, "tagSlugs": [] },
    { "name": "Nas Tools",    "groupSlug": "nas",     "iconKind": "asset", "iconValue": "nasTools.png",         "links": { "shangHai": "http://10.0.0.14",  "beiJing": "http://10.1.0.14" }, "tagSlugs": [] },

    { "name": "Esxi",          "groupSlug": "tools",  "iconKind": "asset", "iconValue": "esxi.png",             "links": { "shangHai": "http://10.0.0.3",  "beiJing": "http://10.1.0.3", "guangZhou": "http://10.2.0.3" }, "tagSlugs": [] },
    { "name": "Home Assistant","groupSlug": "tools",  "iconKind": "asset", "iconValue": "homeAssistant.svg",    "links": { "shangHai": "http://10.0.0.5",  "beiJing": "http://10.1.0.5" }, "tagSlugs": [] },
    { "name": "思源笔记",      "name_i18n": { "en": "SiYuan Notes" }, "groupSlug": "tools", "iconKind": "asset", "iconValue": "siyuanNote.png", "links": { "shangHai": "http://10.0.0.16:6806/", "beiJing": "http://10.1.0.16:6806/" }, "tagSlugs": [] },
    { "name": "博客",          "name_i18n": { "en": "Blog" }, "groupSlug": "tools", "iconKind": "asset", "iconValue": "blog.png", "links": { "shangHai": "http://10.0.0.6",  "beiJing": "http://10.1.0.6" }, "tagSlugs": [] },
    { "name": "Portainer",     "groupSlug": "tools",  "iconKind": "asset", "iconValue": "portainer.svg",        "links": { "shangHai": "http://10.0.0.10:9443", "beiJing": "http://10.1.0.10:9443" }, "tagSlugs": [] },
    { "name": "青龙",          "name_i18n": { "en": "QingLong" }, "groupSlug": "tools", "iconKind": "asset", "iconValue": "qinglong.png", "links": { "shangHai": "http://10.0.0.15:5700", "beiJing": "http://10.1.0.15:5700" }, "tagSlugs": [] }
  ]
}
```

(17 items: 5 network + 3 media + 3 nas + 6 tools = 17.)

- [ ] **Step 2: Verify `cargo check` (the build.rs `rerun-if-changed=bootstrap.json` triggers a small recompile)**

```bash
cd server
DATABASE_URL=sqlite:./dev-data/data.db?mode=rwc cargo check 2>&1 | tail -3
cd ..
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/bootstrap.json
git commit -m "feat(server): real bootstrap.json with 17 default items + 4 sites + 4 groups"
```

### Task 2: dump-bootstrap.mjs maintenance script

**Files:**
- Create: `scripts/dump-bootstrap.mjs`
- Create: `scripts/bootstrap-source.ts`

This script generates `server/bootstrap.json` from a typed source so future edits stay in TypeScript instead of hand-editing JSON. It's run on demand by maintainers; the Docker build does NOT depend on it (the JSON is committed).

- [ ] **Step 1: Source file**

Create `scripts/bootstrap-source.ts`:

```ts
// Hand-curated source of truth for server/bootstrap.json.
// Maintainers edit this file then run `node scripts/dump-bootstrap.mjs`.

export interface BootstrapItem {
  name: string;
  name_i18n?: Record<string, string>;
  groupSlug: string | null;
  iconKind: 'asset' | 'url' | 'auto-favicon';
  iconValue: string;
  links: Record<string, string>;
  tagSlugs?: string[];
}

export interface BootstrapSite {
  value: string;
  name: string;
  name_i18n?: Record<string, string>;
  is_default: boolean;
  sort_order: number;
}

export interface BootstrapGroup {
  slug: string;
  name: string;
  name_i18n?: Record<string, string>;
  sort_order: number;
}

export interface BootstrapDoc {
  schemaVersion: 1;
  meta: {
    siteName: string;
    siteAvatarPath: string | null;
    siteCopyright: string;
    siteIcp: { text: string; url: string } | null;
    sitePolice: { text: string; url: string } | null;
    defaultTheme: 'system' | 'light' | 'dark';
  };
  sites: BootstrapSite[];
  groups: BootstrapGroup[];
  tags: { slug: string; name: string; name_i18n?: Record<string, string> }[];
  items: BootstrapItem[];
}

export const BOOTSTRAP: BootstrapDoc = {
  schemaVersion: 1,
  meta: {
    siteName: 'Pico 的小站导航',
    siteAvatarPath: '/avatar.png',
    siteCopyright: 'Copyright © 2026 Pico. All rights reserved.',
    siteIcp: null,
    sitePolice: null,
    defaultTheme: 'system'
  },
  sites: [
    { value: 'shangHai', name: '上海', name_i18n: { en: 'Shanghai' }, is_default: true, sort_order: 0 },
    { value: 'beiJing', name: '北京', name_i18n: { en: 'Beijing' }, is_default: false, sort_order: 1 },
    { value: 'guangZhou', name: '广州', name_i18n: { en: 'Guangzhou' }, is_default: false, sort_order: 2 },
    { value: 'shenZhen', name: '深圳', name_i18n: { en: 'Shenzhen' }, is_default: false, sort_order: 3 }
  ],
  groups: [
    { slug: 'network', name: '网络', name_i18n: { en: 'Network' }, sort_order: 0 },
    { slug: 'media', name: '媒体', name_i18n: { en: 'Media' }, sort_order: 1 },
    { slug: 'nas', name: 'NAS', name_i18n: { en: 'NAS' }, sort_order: 2 },
    { slug: 'tools', name: '工具', name_i18n: { en: 'Tools' }, sort_order: 3 }
  ],
  tags: [],
  items: [
    // (omitted here; same as bootstrap.json items section from Task 1)
  ]
};
```

The `items` array can be left empty in the source for this plan (the JSON is the canonical reference). Future maintainers will populate it before running the script.

- [ ] **Step 2: dump script**

Create `scripts/dump-bootstrap.mjs`:

```js
#!/usr/bin/env node
// Regenerate server/bootstrap.json from scripts/bootstrap-source.ts.
// Usage: from repo root: node scripts/dump-bootstrap.mjs
//
// Requires: pnpm/npx to invoke tsx.

import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const tsxOut = execSync(
  `npx -y tsx -e "import { BOOTSTRAP } from './scripts/bootstrap-source.ts'; process.stdout.write(JSON.stringify(BOOTSTRAP, null, 2))"`,
  { encoding: 'utf8' }
);

const target = 'server/bootstrap.json';
await writeFile(target, tsxOut + '\n', 'utf8');
console.log(`Wrote ${target} (${tsxOut.length} bytes).`);
```

- [ ] **Step 3: Don't run it now** (it would overwrite Task 1's authoritative JSON with the empty-items source). Just commit the script for future use.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-source.ts scripts/dump-bootstrap.mjs
git commit -m "chore: dump-bootstrap.mjs maintenance script (regenerates server/bootstrap.json from TS source)"
```

---

## Phase 1: Docker (Tasks 3–5)

### Task 3: Dockerfile (multi-stage)

**Files:**
- Modify: `Dockerfile` (replaces the existing nginx-based one from the legacy site)
- Create: `.dockerignore` already updated in Plan 1; verify it covers new dirs.

- [ ] **Step 1: Replace `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

# ──── Stage 1: build frontend ────
FROM node:20-alpine AS web-build
WORKDIR /web
RUN corepack enable
COPY web/pnpm-lock.yaml web/package.json ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ──── Stage 2: build server ────
FROM rust:1.79-slim AS server-build
WORKDIR /server
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
# Cache deps layer
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs && \
    cargo build --release --bin navsrv && \
    rm -rf src target/release/deps/navsrv* target/release/navsrv
# Real build
COPY server/ ./
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin navsrv

# ──── Stage 3: runtime ────
FROM gcr.io/distroless/cc-debian12 AS runtime
COPY --from=server-build /server/target/release/navsrv /usr/local/bin/navsrv
COPY --from=web-build    /web/build                   /app/static
ENV PORT=8080 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static \
    RUST_LOG=info,sqlx=warn,tower_http=info \
    SECURE_COOKIES=false
VOLUME /app/data
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/navsrv"]
```

Notes:
- Three stages: web (node:20-alpine, ~200MB), server (rust:1.79-slim, ~1GB), runtime (distroless/cc, ~70MB).
- Server stage uses `SQLX_OFFLINE=true` so cargo doesn't try to connect to a live DB during build — relies on the `.sqlx/` metadata committed in Plan 1.
- The runtime image is distroless: no shell, no package manager, only the binary + glibc + ca-certificates + nonroot user.

- [ ] **Step 2: Build the image**

```bash
docker build -t navsrv:plan5-test . 2>&1 | tail -30
```

Use `timeout: 1800000` (30 min) — cold build is heavy. Subsequent builds use cached layers.

Expected: build succeeds. If a stage fails, inspect the log; common issues:
- pnpm install fails with peer-dep conflict → check `web/package.json` packageManager field
- rust deps download timeout → retry
- `SQLX_OFFLINE=true` but `.sqlx/` missing → re-run `cargo sqlx prepare` in dev (Plan 1 Task 13/14/15 should have left `.sqlx/` committed; verify)

- [ ] **Step 3: Run the image**

```bash
mkdir -p /tmp/navdata
docker run -d \
  --name navsrv-test \
  -p 18080:8080 \
  -v /tmp/navdata:/app/data \
  -e BOOTSTRAP_ADMIN_PASSWORD=test1234 \
  navsrv:plan5-test
sleep 5
docker logs navsrv-test | tail -20
curl -sf http://127.0.0.1:18080/api/health
echo
curl -sf http://127.0.0.1:18080/api/nav | head -c 200
echo
curl -sf -o /tmp/spa.html http://127.0.0.1:18080/ && grep -oE '<title>[^<]+</title>' /tmp/spa.html
docker stop navsrv-test && docker rm navsrv-test
rm -rf /tmp/navdata
```

Expected: health JSON, nav bundle JSON, SPA HTML with title.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat(deploy): multi-stage Dockerfile (web + server → distroless single image)"
```

### Task 4: docker-compose.yml with Caddy TLS sample

**Files:**
- Create: `docker-compose.yml`
- Create: `Caddyfile`

```yaml
# docker-compose.yml — sample. Adjust DOMAIN / image tag for your deploy.
services:
  nav:
    build: .
    image: navsrv:latest
    container_name: nav
    restart: unless-stopped
    environment:
      BOOTSTRAP_ADMIN_PASSWORD: ${BOOTSTRAP_ADMIN_PASSWORD:-}
      RUST_LOG: ${RUST_LOG:-info,sqlx=warn,tower_http=info}
      SECURE_COOKIES: ${SECURE_COOKIES:-true}
    volumes:
      - ./data:/app/data
    expose:
      - "8080"

  caddy:
    image: caddy:2
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - nav

volumes:
  caddy-data:
  caddy-config:
```

```caddy
# Caddyfile — auto-TLS via Let's Encrypt.
# Set DOMAIN env var (e.g. nav.example.com) before `docker compose up`.
{$DOMAIN:localhost} {
    reverse_proxy nav:8080
    encode gzip
}
```

Smoke test (without TLS, on a temporary port):

```bash
DOMAIN=localhost docker compose up -d 2>&1 | tail -10
sleep 8
curl -sf -k http://localhost/api/health || echo "(caddy may take a moment to bind; check logs)"
docker compose logs caddy 2>&1 | tail -5
docker compose logs nav 2>&1 | tail -5
docker compose down
```

Expected: `nav` container started, `caddy` started, health endpoint reachable through caddy at port 80.

Commit:

```bash
git add docker-compose.yml Caddyfile
git commit -m "feat(deploy): docker-compose + Caddyfile (auto-TLS via Let's Encrypt)"
```

### Task 5: Docker smoke test in script form

**Files:**
- Create: `scripts/docker-smoke.sh`

```bash
#!/usr/bin/env bash
# scripts/docker-smoke.sh
# Manual smoke test: build, run, hit endpoints, tear down.
# Usage: bash scripts/docker-smoke.sh
set -euo pipefail

IMG=navsrv:smoke-$$
DATA=$(mktemp -d)
PORT=18080
PASSWORD=smoke-pw-1234

cleanup() {
  docker stop nav-smoke 2>/dev/null || true
  docker rm   nav-smoke 2>/dev/null || true
  docker image rm "$IMG" 2>/dev/null || true
  rm -rf "$DATA"
}
trap cleanup EXIT

echo "=== build ==="
docker build -t "$IMG" .

echo "=== run ==="
docker run -d --name nav-smoke -p "$PORT:8080" -v "$DATA:/app/data" \
  -e BOOTSTRAP_ADMIN_PASSWORD="$PASSWORD" "$IMG"
sleep 6

echo "=== health ==="
curl -sf "http://127.0.0.1:$PORT/api/health"
echo
echo "=== nav ==="
curl -sf "http://127.0.0.1:$PORT/api/nav" | python3 -c 'import sys,json; b=json.load(sys.stdin); print(f"sites={len(b[\"sites\"])} groups={len(b[\"groups\"])} items={len(b[\"items\"])}")'
echo "=== login ==="
curl -sf -c /tmp/c.txt -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$PASSWORD\"}" "http://127.0.0.1:$PORT/api/auth/login" -w 'login=%{http_code}\n'
echo "=== me with cookie ==="
curl -sf -b /tmp/c.txt "http://127.0.0.1:$PORT/api/auth/me"
echo

echo "=== SPA ==="
curl -sf -o /tmp/spa.html "http://127.0.0.1:$PORT/" && grep -oE '<title>[^<]+</title>' /tmp/spa.html

echo "=== smoke OK ==="
```

```bash
chmod +x scripts/docker-smoke.sh
bash scripts/docker-smoke.sh
```

Use `timeout: 1800000` for the build step.

Expected: smoke script prints `smoke OK`.

Commit:

```bash
git add scripts/docker-smoke.sh
git commit -m "chore(deploy): docker-smoke.sh script (build + run + verify all endpoints)"
```

---

## Phase 2: Playwright e2e (Tasks 6–8)

### Task 6: Playwright config refresh

**Files:**
- Delete: `web/playwright.config.js`
- Create: `tests/playwright.config.ts` (root-level)
- Modify: root `package.json` to host the e2e test scripts (or use `web/package.json` — root is cleaner).
- Move: `web/tests/test.ts` → `tests/legacy.spec.ts` (rename or delete; legacy default Kit-generated test).

The Plan 1.5 deferred Playwright fixes; this task does them now.

- [ ] **Step 1: Create root tests dir**

```bash
mkdir -p tests
```

- [ ] **Step 2: Move legacy test (or delete)**

```bash
git mv web/tests/test.ts tests/legacy.spec.ts 2>/dev/null || true
git rm web/tests/test.ts 2>/dev/null || true
git rm web/playwright.config.js
```

If the legacy file just contains `expect(1).toBe(1)`, replace `tests/legacy.spec.ts` with a minimal placeholder or delete entirely. Simpler: delete and start fresh.

- [ ] **Step 3: Root tests/playwright.config.ts**

```ts
// tests/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 18080);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
```

- [ ] **Step 4: Root package.json with e2e scripts**

Create `package.json` at the repo ROOT (no `pnpm-workspace.yaml` — this is just a thin shell for e2e test runner):

```json
{
  "name": "navigation_website-e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "e2e": "playwright test --config tests/playwright.config.ts",
    "e2e:headed": "playwright test --config tests/playwright.config.ts --headed",
    "e2e:ui": "playwright test --config tests/playwright.config.ts --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

Install:

```bash
npm install
npx playwright install chromium --with-deps
```

(Use `npm` here — root has no pnpm setup. Or `pnpm install` if user prefers.)

Use `timeout: 600000` for the playwright install.

- [ ] **Step 5: Verify config compiles**

```bash
npx playwright test --config tests/playwright.config.ts --list 2>&1 | tail -10
```

Should list 0 tests (no spec files yet) without erroring on the config.

- [ ] **Step 6: Commit**

```bash
git add tests/ package.json package-lock.json 2>/dev/null
git rm -f web/playwright.config.js 2>/dev/null
git commit -m "chore(e2e): root Playwright config (port 18080, chromium-only)"
```

### Task 7: e2e spec — read flow

**Files:**
- Create: `tests/read.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('read flow', () => {
  test('site loads with title and at least one nav item', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/, { timeout: 10_000 });

    // Wait for some NavItem button to render (nav items are <button>)
    const items = page.locator('button[aria-label]').filter({
      hasNot: page.locator('[aria-label="Toggle theme"]')
    });
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search filters', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('searchbox');
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill('Router');

    // After filtering, items containing "Router" should still be there.
    await expect(page.locator('button[aria-label*="Router"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
```

Commit:

```bash
git add tests/read.spec.ts
git commit -m "test(e2e): read flow (title + nav items + search filter)"
```

### Task 8: e2e spec — login + create item

**Files:**
- Create: `tests/edit.spec.ts`

```ts
import { test, expect } from '@playwright/test';

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test1234';

test.describe('edit flow', () => {
  test('login → toggle edit → create item via dialog', async ({ page }) => {
    await page.goto('/');

    // Open login dialog
    await page.getByRole('button', { name: /log in|登录/i }).click();
    await page.getByLabel(/admin password|管理员密码/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|登录/i }).click();

    // After login, EditToggle button appears
    const editBtn = page.getByRole('button', { name: /^edit$|^编辑$/i });
    await expect(editBtn).toBeVisible({ timeout: 5_000 });

    // Toggle edit mode
    await editBtn.click();
    // Visual indicator: body should have edit-mode class
    await expect(page.locator('body.edit-mode')).toBeVisible();

    // Click the first NewItemAffordance ('+' card)
    const newItem = page.getByRole('button', { name: /new nav item|新建导航项/i }).first();
    await newItem.click();

    // Fill ItemEditDialog form
    await page.getByLabel(/edit — name|name/i).first().fill('E2EItem');
    await page.getByLabel(/icon value/i).fill('e2e.png');
    await page.getByLabel(/links/i).fill('{"shangHai":"http://e2e.test"}');

    // Save
    await page.getByRole('button', { name: /^save$|^保存$/i }).click();

    // Verify the new item appears
    await expect(page.locator('button[aria-label="E2EItem"]')).toBeVisible({ timeout: 10_000 });
  });
});
```

Commit:

```bash
git add tests/edit.spec.ts
git commit -m "test(e2e): edit flow (login → toggle → create item via dialog)"
```

### Task 9: e2e harness script

**Files:**
- Create: `scripts/e2e.sh`

```bash
#!/usr/bin/env bash
# scripts/e2e.sh — boot a clean Docker container, run Playwright against it, tear down.
set -euo pipefail

IMG=navsrv:e2e-$$
DATA=$(mktemp -d)
PORT=18080
PASSWORD=test1234

cleanup() {
  docker stop nav-e2e 2>/dev/null || true
  docker rm   nav-e2e 2>/dev/null || true
  docker image rm "$IMG" 2>/dev/null || true
  rm -rf "$DATA"
}
trap cleanup EXIT

echo "=== build ==="
docker build -t "$IMG" .

echo "=== run ==="
docker run -d --name nav-e2e -p "$PORT:8080" -v "$DATA:/app/data" \
  -e BOOTSTRAP_ADMIN_PASSWORD="$PASSWORD" "$IMG"
sleep 6

echo "=== seeding (server seeds itself on first boot from bootstrap.json) ==="
curl -sf "http://127.0.0.1:$PORT/api/nav" | python3 -c 'import sys,json; b=json.load(sys.stdin); print(f"sites={len(b[\"sites\"])} items={len(b[\"items\"])}")'

echo "=== running playwright ==="
PORT="$PORT" E2E_ADMIN_PASSWORD="$PASSWORD" npx playwright test --config tests/playwright.config.ts

echo "=== e2e OK ==="
```

```bash
chmod +x scripts/e2e.sh
```

Run it:

```bash
bash scripts/e2e.sh
```

Use `timeout: 1800000` (30 min) — first run includes docker build.

Expected: all 3 e2e tests pass (1 from read.spec, 2 from edit.spec — actually 3 read flow tests planned but conservative).

If any test fails: inspect Playwright HTML report (auto-saved to `playwright-report/`), debug, fix the test or the underlying issue, commit the fix.

Commit:

```bash
git add scripts/e2e.sh
git commit -m "chore(e2e): scripts/e2e.sh harness (docker build + run + playwright)"
```

---

## Phase 3: README finalization (Task 10)

### Task 10: Top-level README rewrite

**Files:**
- Modify: `README.md`

Replace the legacy README with a quickstart-first version focused on Docker.

```markdown
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
```

(Adjust the license line if a different license applies.)

Run a quick markdown check:

```bash
grep -c '^#' README.md
```

Should be ≥ 5 (multiple sections).

Commit:

```bash
git add README.md
git commit -m "docs: README quickstart-first (Docker run, dev workflow, env, architecture, roadmap)"
```

---

## Phase 4: Final pipeline verification (Task 11)

### Task 11: Full green check

**Files:** none modified (unless fixes needed).

```bash
# Cargo
cd server
DATABASE_URL=sqlite:./dev-data/data.db?mode=rwc cargo test 2>&1 | tail -5
DATABASE_URL=sqlite:./dev-data/data.db?mode=rwc cargo clippy --all-targets -- -D warnings 2>&1 | tail -5
cargo fmt --check
cd ..

# Web
cd web
pnpm check 2>&1 | tail -5
pnpm test:unit 2>&1 | tail -5
pnpm build 2>&1 | tail -5
pnpm lint 2>&1 | tail -5
cd ..

# Docker
bash scripts/docker-smoke.sh 2>&1 | tail -10
```

(Skip the Docker step if `docker` is unavailable on the host; note as concern.)

Expected: every gate green.

If everything green, no commit (Task 11 is verification only).

If fixes were needed, commit:

```bash
git add -u
git commit -m "chore: final fixes after Plan 5 full pipeline verification"
```

---

## Self-Review

**Spec coverage**

| Spec section | Where covered |
|---|---|
| § 9.1 seed_if_empty migration | Plan 1 Task 32; bootstrap.json now real (Task 1 of this plan) |
| § 9.2 Dockerfile multi-stage | Task 3 |
| § 9.5 deployment | Tasks 3, 4, 10 |
| § 10 roadmap | Task 10 README |

**Out of scope** (explicit in this plan):

- Drag-drop, full group/site/tag UI, SiteSettingsDialog, icon upload UI — listed in README roadmap.
- Multi-user, audit log, OAuth — same.

**Type / signature consistency**

- bootstrap.json shape matches `BootstrapDoc` in `server/src/services/migration.rs` (Plan 1 Task 32).
- Playwright config typed via `defineConfig`.

**Verification gates**

- Task 3: docker build + run + curl
- Task 4: docker compose up + caddy probe
- Task 5: scripts/docker-smoke.sh
- Task 7-9: Playwright (3 tests across 2 specs)
- Task 11: full pipeline

**Final**: after Task 11, `feat/rust-platform` branch is shippable. Open a PR from `feat/rust-platform` → `master` for human review and merge.
