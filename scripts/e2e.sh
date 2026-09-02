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
