#!/usr/bin/env bash
# =====================================================================
# Destiny Admin Console — Cloudflare quick tunnel (Linux / GitHub Actions)
# =====================================================================
#
# Starts the admin API (loopback only), the Next.js dashboard, and a
# `cloudflared` quick tunnel that publishes ONLY the dashboard.
#
# The tunnel URL is ephemeral and changes on every run. It is written to
#   $TUNNEL_URL_FILE  (default: logs/tunnel.url)
# and echoed to stdout so the workflow can publish it as a job summary.
#
# Usage:
#   scripts/start-admin-tunnel.sh [--port 3000] [--api-port 4000]
#
# Requires DASHBOARD_ADMIN_PASSWORD, DASHBOARD_SESSION_SECRET and
# API_SECRET_KEY in the environment (or the project-root .env).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DASH_PORT=3000
API_PORT=4000
TUNNEL_URL_FILE="${TUNNEL_URL_FILE:-$ROOT/logs/tunnel.url}"
CLOUDFLARED_VERSION="${CLOUDFLARED_VERSION:-2026.10.7}"

while [ $# -gt 0 ]; do
  case "$1" in
    --port) DASH_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --url-file) TUNNEL_URL_FILE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$TUNNEL_URL_FILE")" "$ROOT/logs"

# ---------------------------------------------------------------------------
# Load the project-root .env (authoritative). Existing env vars win.
# ---------------------------------------------------------------------------
load_env() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS='=' read -r key value; do
    case "$key" in ''|'#'*) continue ;; esac
    # Strip surrounding quotes and trailing CR.
    value="${value%$'\r'}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    [ -z "$value" ] && continue
    [ -n "${!key:-}" ] && continue
    export "$key=$value"
  done < "$file"
}

load_env "$ROOT/.env"
load_env "$ROOT/dashboard/.env.local"

if [ -z "${DASHBOARD_ADMIN_PASSWORD:-}" ]; then
  echo "::error::DASHBOARD_ADMIN_PASSWORD is not set." >&2
  exit 1
fi
if [ -z "${DASHBOARD_SESSION_SECRET:-}" ]; then
  echo "::error::DASHBOARD_SESSION_SECRET is not set." >&2
  exit 1
fi
if [ -z "${API_SECRET_KEY:-}" ]; then
  echo "::error::API_SECRET_KEY is not set." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# cloudflared
# ---------------------------------------------------------------------------
CLOUDFLARED_BIN="$(command -v cloudflared || true)"
if [ -z "$CLOUDFLARED_BIN" ]; then
  echo "▸ installing cloudflared ${CLOUDFLARED_VERSION}"
  CLOUDFLARED_BIN="$ROOT/.tools/cloudflared"
  mkdir -p "$ROOT/.tools"
  URL="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64"
  curl -fsSL "$URL" -o "$CLOUDFLARED_BIN"
  chmod +x "$CLOUDFLARED_BIN"
fi
echo "▸ cloudflared: $("$CLOUDFLARED_BIN" --version 2>&1 | head -n1)"

# ---------------------------------------------------------------------------
# Dashboard build
# ---------------------------------------------------------------------------
if [ ! -d "$ROOT/dashboard/node_modules" ]; then
  echo "▸ installing dashboard dependencies"
  pnpm --dir dashboard install --frozen-lockfile --prod=false
fi

echo "▸ building dashboard"
pnpm --dir dashboard build

# ---------------------------------------------------------------------------
# Start the admin API (loopback only) and the dashboard
# ---------------------------------------------------------------------------
echo "▸ starting admin API on 127.0.0.1:${API_PORT}"
RUN_API=true PORT="$API_PORT" NODE_ENV=production \
  node_modules/.bin/tsx src/api/server.ts >"$ROOT/logs/api.log" 2>&1 &
API_PID=$!

echo "▸ starting dashboard on 127.0.0.1:${DASH_PORT}"
(
  cd "$ROOT/dashboard"
  BACKEND_API_URL="http://127.0.0.1:${API_PORT}" \
  API_SECRET_KEY="$API_SECRET_KEY" \
  DASHBOARD_ADMIN_PASSWORD="$DASHBOARD_ADMIN_PASSWORD" \
  DASHBOARD_SESSION_SECRET="$DASHBOARD_SESSION_SECRET" \
  NODE_ENV=production \
  node_modules/.bin/next start -p "$DASH_PORT" -H 127.0.0.1
) >"$ROOT/logs/dashboard.log" 2>&1 &
DASH_PID=$!

cleanup() {
  echo "▸ tearing down"
  kill "$API_PID" "$DASH_PID" 2>/dev/null || true
  pkill -f "cloudflared tunnel" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for both services to answer.
# NOTE: /api/health requires the x-api-key header, so we must send it —
# a bare `curl -f` would treat the 401 as "not ready".
wait_for_http() {
  local url="$1" name="$2" attempts="${3:-90}"
  for _ in $(seq 1 "$attempts"); do
    if curl -s -o /dev/null -H "x-api-key: ${API_SECRET_KEY}" "$url" 2>/dev/null; then
      echo "✓ $name is up"
      return 0
    fi
    sleep 1
  done
  echo "::error::$name did not become ready at $url" >&2
  return 1
}

wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "admin API" || {
  echo "--- logs/api.log ---" >&2
  tail -40 "$ROOT/logs/api.log" >&2 2>/dev/null || true
  exit 1
}
wait_for_http "http://127.0.0.1:${DASH_PORT}/login" "dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -40 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

# ---------------------------------------------------------------------------
# Open the quick tunnel
# ---------------------------------------------------------------------------
echo "▸ opening Cloudflare quick tunnel"
TUNNEL_LOG="$ROOT/logs/tunnel.log"
"$CLOUDFLARED_BIN" tunnel --url "http://127.0.0.1:${DASH_PORT}" --no-autoupdate \
  >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 60); do
  TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -n1 || true)"
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "::error::Cloudflare tunnel did not publish a URL" >&2
  tail -30 "$TUNNEL_LOG" >&2 || true
  exit 1
fi

printf '%s\n' "$TUNNEL_URL" > "$TUNNEL_URL_FILE"
echo "TUNNEL_URL=$TUNNEL_URL"

{
  echo "### 🌌 Destiny Admin Console"
  echo ""
  echo "- **URL:** \`${TUNNEL_URL}\`"
  echo "- **Password:** the value of \`DASHBOARD_ADMIN_PASSWORD\`"
  echo "- **Expires:** when this job ends"
  echo ""
  echo "> The tunnel is public. The console is protected by the admin password."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "▸ admin console is live at $TUNNEL_URL"

# Keep the tunnel alive until the job is cancelled.
wait "$TUNNEL_PID"
