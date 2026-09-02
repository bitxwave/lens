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
curl -sf "http://127.0.0.1:$PORT/api/nav" | python3 -c 'import sys,json; b=json.load(sys.stdin); print("sites={} groups={} items={}".format(len(b["sites"]), len(b["groups"]), len(b["items"])))'
echo "=== login ==="
curl -sf -c /tmp/c.txt -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$PASSWORD\"}" "http://127.0.0.1:$PORT/api/auth/login" -w 'login=%{http_code}\n'
echo "=== me with cookie ==="
curl -sf -b /tmp/c.txt "http://127.0.0.1:$PORT/api/auth/me"
echo

echo "=== SPA ==="
curl -sf -o /tmp/spa.html "http://127.0.0.1:$PORT/" && grep -oE '<title>[^<]+</title>' /tmp/spa.html

echo "=== smoke OK ==="
