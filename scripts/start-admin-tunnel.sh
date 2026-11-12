#!/usr/bin/env bash
# =====================================================================
# Destiny Admin Console — Cloudflare quick tunnel (Linux / GitHub Actions)
# =====================================================================
#
# Starts the admin API, the Next.js dashboard, and a Cloudflare quick
# tunnel. The URL is ephemeral and is written to logs/tunnel.url.
#
# Usage:
#   scripts/start-admin-tunnel.sh [--port 3000] [--api-port 4000]
#                                 [--reuse-api] [--url-file <file>]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DASH_PORT=3000
API_PORT=4000
TUNNEL_URL_FILE="${TUNNEL_URL_FILE:-$ROOT/logs/tunnel.url}"
CLOUDFLARED_VERSION="${CLOUDFLARED_VERSION:-2026.10.7}"
REUSE_API=0
CHECK_CONFIG=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) DASH_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --url-file) TUNNEL_URL_FILE="$2"; shift 2 ;;
    --reuse-api) REUSE_API=1; shift ;;
    --check-config) CHECK_CONFIG=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$TUNNEL_URL_FILE")" "$ROOT/logs"
rm -f "$TUNNEL_URL_FILE"

load_env() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS='=' read -r key value; do
    case "$key" in ''|'#'*) continue ;; esac
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

validate_secret() {
  local name="$1" minimum="$2" value="${!1:-}" normalized
  if [ -z "$value" ]; then
    echo "::error::$name is missing. Add it as a GitHub Actions repository secret." >&2
    return 1
  fi
  if [ "${#value}" -lt "$minimum" ]; then
    echo "::error::$name is too short. It must contain at least $minimum characters; update the GitHub Actions secret." >&2
    return 1
  fi

  normalized="${value,,}"
  case "$normalized" in
    admin|password|change_me|change-me|changeme|replace_with|replace-with|your_password|your_admin_password|your_secret|your_session_secret|destiny_dashboard_secret_key_32bytes!)
      echo "::error::$name is a known placeholder. Replace it with a unique secret." >&2
      return 1
      ;;
  esac
}

validate_secret DASHBOARD_SESSION_SECRET 32
validate_secret API_SECRET_KEY 32

OWNER_ID_COUNT="$(printf '%s' "${BOT_OWNER_IDS:-}" | tr ',' '\n' | grep -Ec '^[0-9]{17,20}

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

if [ ! -d "$ROOT/dashboard/node_modules" ]; then
  echo "▸ installing dashboard dependencies"
  pnpm --dir dashboard install --frozen-lockfile --prod=false
fi

echo "▸ building dashboard"
pnpm --dir dashboard build

API_PID=""
if [ "$REUSE_API" -eq 1 ]; then
  echo "▸ reusing the admin API already listening on 127.0.0.1:${API_PORT}"
else
  echo "▸ starting admin API on 127.0.0.1:${API_PORT}"
  RUN_API=true PORT="$API_PORT" NODE_ENV=production \
    node_modules/.bin/tsx src/api/server.ts >"$ROOT/logs/api.log" 2>&1 &
  API_PID=$!
fi

echo "▸ starting dashboard on 127.0.0.1:${DASH_PORT}"
(
  cd "$ROOT/dashboard"
  BACKEND_API_URL="http://127.0.0.1:${API_PORT}" \
  API_SECRET_KEY="$API_SECRET_KEY" \
  DASHBOARD_ADMIN_PASSWORD="${DASHBOARD_ADMIN_PASSWORD:-}" \
  DASHBOARD_SESSION_SECRET="$DASHBOARD_SESSION_SECRET" \
  NODE_ENV=production \
  node_modules/.bin/next start -p "$DASH_PORT" -H 127.0.0.1
) >"$ROOT/logs/dashboard.log" 2>&1 &
DASH_PID=$!

TUNNEL_PID=""
cleanup() {
  echo "▸ tearing down"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$DASH_PID" ] && kill "$DASH_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Check the actual HTTP status. curl without --fail treats HTTP 500 as a
# successful transfer, which previously allowed broken pages to pass readiness.
wait_for_http() {
  local url="$1" name="$2" attempts="${3:-90}" code=""
  for _ in $(seq 1 "$attempts"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' \
      -H "x-api-key: ${API_SECRET_KEY}" --connect-timeout 3 --max-time 8 \
      "$url" 2>/dev/null || true)"
    case "$code" in
      2??|3??)
        echo "✓ $name is up (HTTP $code)"
        return 0
        ;;
    esac
    sleep 1
  done
  echo "::error::$name did not become ready at $url (last HTTP: ${code:-no response})" >&2
  return 1
}

# The root page is protected and must redirect to /login. Next.js emits an
# absolute Location for middleware redirects; accept it only when it resolves
# to /login on this same origin. Localhost and 127.0.0.1 are equivalent for
# the local probe when their protocol and port match.
check_root_route() {
  local base="$1" name="$2" headers code location valid_location
  headers="$(mktemp)"
  code="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' \
    --connect-timeout 5 --max-time 12 "${base%/}/" 2>/dev/null || true)"
  location="$(awk 'tolower($1) == "location:" { sub(/^[^:]*:[[:space:]]*/, ""); gsub("\r", ""); print }' "$headers" | tail -n1)"
  rm -f "$headers"

  valid_location=""
  if [ -n "$location" ]; then
    valid_location="$(node -e '
      const [baseValue, location] = process.argv.slice(1);
      try {
        const base = new URL(baseValue);
        const target = new URL(location, base);
        const loopback = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";
        const sameOrigin = target.origin === base.origin ||
          (target.protocol === base.protocol && target.port === base.port &&
           loopback(base.hostname) && loopback(target.hostname));
        if (!sameOrigin || target.pathname !== "/login" || target.search || target.hash ||
            target.username || target.password) process.exit(1);
        process.stdout.write(target.href);
      } catch {
        process.exit(1);
      }
    ' "${base%/}/" "$location" 2>/dev/null || true)"
  fi

  if { [ "$code" = "307" ] || [ "$code" = "308" ]; } && [ -n "$valid_location" ]; then
    echo "✓ $name root route redirects to /login (HTTP $code)"
    return 0
  fi

  echo "::error::$name root route failed: expected HTTP 307/308 redirect to same-origin /login; got HTTP ${code:-no response}, Location: ${location:-<none>}" >&2
  return 1
}

if [ "$REUSE_API" -eq 1 ]; then
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "admin API" 180 || \
    echo "::warning::Reused admin API never became ready." >&2
else
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "admin API" || {
    echo "--- logs/api.log ---" >&2
    tail -80 "$ROOT/logs/api.log" >&2 2>/dev/null || true
    exit 1
  }
fi

wait_for_http "http://127.0.0.1:${DASH_PORT}/login" "dashboard login" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -100 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

check_root_route "http://127.0.0.1:${DASH_PORT}" "local dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -150 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

# Exercise the real authenticated root page too. This catches failures that
# an unauthenticated redirect check cannot see (for example, a rejected admin
# secret, a missing session-signing key, or a runtime exception on the page).
# The response's public error string is safe to log; never log the password or
# the request body.
check_authenticated_root() {
  local base="$1" name="$2" body_file login_headers login_body session_cookie login_code login_error root_code
  if [ "$OWNER_OAUTH_READY" -eq 1 ]; then
    echo "✓ $name uses individual Discord owner OAuth; skipping bootstrap-password probe."
    return 0
  fi
  body_file="$(mktemp)"
  login_headers="$(mktemp)"
  login_body="$(mktemp)"
  node -e 'process.stdout.write(JSON.stringify({password: process.env.DASHBOARD_ADMIN_PASSWORD}))' > "$body_file"
  chmod 600 "$body_file" "$login_headers" "$login_body"

  login_code="$(curl -sS -D "$login_headers" -o "$login_body" -w '%{http_code}' \
    -H 'Content-Type: application/json' --data-binary "@$body_file" \
    --connect-timeout 5 --max-time 12 "${base%/}/api/auth/login" 2>/dev/null || true)"
  session_cookie="$(awk 'tolower($1) == "set-cookie:" { split($2, parts, ";"); print parts[1] }' "$login_headers" | tail -n1)"
  login_error="$(node -e '
    const fs = require("node:fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const message = typeof value.error === "string" ? value.error : "";
      process.stdout.write(message.replace(/[\\r\\n]+/g, " ").slice(0, 240));
    } catch {
      process.stdout.write("");
    }
  ' "$login_body" 2>/dev/null || true)"
  rm -f "$body_file" "$login_headers" "$login_body"

  if [ "$login_code" != "200" ] || [ -z "$session_cookie" ]; then
    echo "::error::$name admin login handshake failed (HTTP ${login_code:-no response}; ${login_error:-server did not return a safe error message}; session cookie missing or invalid)" >&2
    return 1
  fi

  # Send the cookie explicitly so this local HTTP probe can exercise a cookie
  # configured Secure for the real HTTPS Cloudflare endpoint.
  root_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Cookie: $session_cookie" --connect-timeout 5 --max-time 20 \
    "${base%/}/" 2>/dev/null || true)"

  if [ "$root_code" = "200" ]; then
    echo "✓ $name authenticated root page renders (HTTP 200)"
    return 0
  fi

  echo "::error::$name authenticated root page failed (HTTP ${root_code:-no response})" >&2
  return 1
}

check_authenticated_root "http://127.0.0.1:${DASH_PORT}" "local dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -200 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

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
  tail -50 "$TUNNEL_LOG" >&2 || true
  exit 1
fi

echo "▸ verifying public tunnel DNS and dashboard routes"
PUBLIC_READY=0
for attempt in $(seq 1 120); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "::error::cloudflared exited before the public URL became ready" >&2
    tail -60 "$TUNNEL_LOG" >&2 || true
    exit 1
  fi
  HTTP_CODE="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 12 "$TUNNEL_URL/login" 2>/dev/null || true)"
  case "$HTTP_CODE" in
    2??|3??)
      PUBLIC_READY=1
      echo "✓ public login page is reachable (HTTP $HTTP_CODE)"
      break
      ;;
  esac
  if [ "$((attempt % 10))" -eq 0 ]; then
    echo "  waiting for public DNS/edge readiness (${attempt}/120)"
  fi
  sleep 2
done

if [ "$PUBLIC_READY" -ne 1 ]; then
  echo "::error::Cloudflare published $TUNNEL_URL but /login never became reachable" >&2
  tail -60 "$TUNNEL_LOG" >&2 || true
  tail -100 "$ROOT/logs/dashboard.log" >&2 || true
  exit 1
fi

check_root_route "$TUNNEL_URL" "public dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -150 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  echo "--- logs/tunnel.log ---" >&2
  tail -80 "$TUNNEL_LOG" >&2 2>/dev/null || true
  exit 1
}

check_authenticated_root "$TUNNEL_URL" "public dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -200 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  echo "--- logs/tunnel.log ---" >&2
  tail -80 "$TUNNEL_LOG" >&2 2>/dev/null || true
  exit 1
}

printf '%s\n' "$TUNNEL_URL" > "$TUNNEL_URL_FILE"
echo "TUNNEL_URL=$TUNNEL_URL"
{
  echo "### 🌌 Destiny Admin Console"
  echo ""
  echo "- **URL:** `${TUNNEL_URL}`"
  if [ "$OWNER_OAUTH_READY" -eq 1 ]; then
    echo "- **Access:** Discord OAuth; only BOT_OWNER_IDS are authorized"
  else
    echo "- **Access:** bootstrap password from DASHBOARD_ADMIN_PASSWORD"
  fi
  echo "- **Expires:** when this job ends"
  echo "- **Route checks:** /login reachable; / redirects to /login"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "▸ admin console is live at $TUNNEL_URL"
wait "$TUNNEL_PID"
 || true)"
OWNER_OAUTH_READY=0
if [ "${OWNER_ID_COUNT:-0}" -gt 0 ] &&
   [ -n "${DISCORD_CLIENT_ID:-}" ] &&
   [ -n "${DISCORD_CLIENT_SECRET:-}" ] &&
   [[ "${NEXTAUTH_URL:-}" =~ ^https:// ]]; then
  OWNER_OAUTH_READY=1
else
  validate_secret DASHBOARD_ADMIN_PASSWORD 12
fi

if [ "$CHECK_CONFIG" -eq 1 ]; then
  if [ "$OWNER_OAUTH_READY" -eq 1 ]; then
    echo "✓ Discord owner OAuth and dashboard secrets are configured (secret values hidden)."
  else
    echo "✓ Bootstrap password and dashboard secrets are valid (secret values hidden)."
  fi
  exit 0
fi

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

if [ ! -d "$ROOT/dashboard/node_modules" ]; then
  echo "▸ installing dashboard dependencies"
  pnpm --dir dashboard install --frozen-lockfile --prod=false
fi

echo "▸ building dashboard"
pnpm --dir dashboard build

API_PID=""
if [ "$REUSE_API" -eq 1 ]; then
  echo "▸ reusing the admin API already listening on 127.0.0.1:${API_PORT}"
else
  echo "▸ starting admin API on 127.0.0.1:${API_PORT}"
  RUN_API=true PORT="$API_PORT" NODE_ENV=production \
    node_modules/.bin/tsx src/api/server.ts >"$ROOT/logs/api.log" 2>&1 &
  API_PID=$!
fi

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

TUNNEL_PID=""
cleanup() {
  echo "▸ tearing down"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$DASH_PID" ] && kill "$DASH_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Check the actual HTTP status. curl without --fail treats HTTP 500 as a
# successful transfer, which previously allowed broken pages to pass readiness.
wait_for_http() {
  local url="$1" name="$2" attempts="${3:-90}" code=""
  for _ in $(seq 1 "$attempts"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' \
      -H "x-api-key: ${API_SECRET_KEY}" --connect-timeout 3 --max-time 8 \
      "$url" 2>/dev/null || true)"
    case "$code" in
      2??|3??)
        echo "✓ $name is up (HTTP $code)"
        return 0
        ;;
    esac
    sleep 1
  done
  echo "::error::$name did not become ready at $url (last HTTP: ${code:-no response})" >&2
  return 1
}

# The root page is protected and must redirect to /login. Next.js emits an
# absolute Location for middleware redirects; accept it only when it resolves
# to /login on this same origin. Localhost and 127.0.0.1 are equivalent for
# the local probe when their protocol and port match.
check_root_route() {
  local base="$1" name="$2" headers code location valid_location
  headers="$(mktemp)"
  code="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' \
    --connect-timeout 5 --max-time 12 "${base%/}/" 2>/dev/null || true)"
  location="$(awk 'tolower($1) == "location:" { sub(/^[^:]*:[[:space:]]*/, ""); gsub("\r", ""); print }' "$headers" | tail -n1)"
  rm -f "$headers"

  valid_location=""
  if [ -n "$location" ]; then
    valid_location="$(node -e '
      const [baseValue, location] = process.argv.slice(1);
      try {
        const base = new URL(baseValue);
        const target = new URL(location, base);
        const loopback = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";
        const sameOrigin = target.origin === base.origin ||
          (target.protocol === base.protocol && target.port === base.port &&
           loopback(base.hostname) && loopback(target.hostname));
        if (!sameOrigin || target.pathname !== "/login" || target.search || target.hash ||
            target.username || target.password) process.exit(1);
        process.stdout.write(target.href);
      } catch {
        process.exit(1);
      }
    ' "${base%/}/" "$location" 2>/dev/null || true)"
  fi

  if { [ "$code" = "307" ] || [ "$code" = "308" ]; } && [ -n "$valid_location" ]; then
    echo "✓ $name root route redirects to /login (HTTP $code)"
    return 0
  fi

  echo "::error::$name root route failed: expected HTTP 307/308 redirect to same-origin /login; got HTTP ${code:-no response}, Location: ${location:-<none>}" >&2
  return 1
}

if [ "$REUSE_API" -eq 1 ]; then
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "admin API" 180 || \
    echo "::warning::Reused admin API never became ready." >&2
else
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "admin API" || {
    echo "--- logs/api.log ---" >&2
    tail -80 "$ROOT/logs/api.log" >&2 2>/dev/null || true
    exit 1
  }
fi

wait_for_http "http://127.0.0.1:${DASH_PORT}/login" "dashboard login" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -100 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

check_root_route "http://127.0.0.1:${DASH_PORT}" "local dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -150 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

# Exercise the real authenticated root page too. This catches failures that
# an unauthenticated redirect check cannot see (for example, a rejected admin
# secret, a missing session-signing key, or a runtime exception on the page).
# The response's public error string is safe to log; never log the password or
# the request body.
check_authenticated_root() {
  local base="$1" name="$2" body_file login_headers login_body session_cookie login_code login_error root_code
  body_file="$(mktemp)"
  login_headers="$(mktemp)"
  login_body="$(mktemp)"
  node -e 'process.stdout.write(JSON.stringify({password: process.env.DASHBOARD_ADMIN_PASSWORD}))' > "$body_file"
  chmod 600 "$body_file" "$login_headers" "$login_body"

  login_code="$(curl -sS -D "$login_headers" -o "$login_body" -w '%{http_code}' \
    -H 'Content-Type: application/json' --data-binary "@$body_file" \
    --connect-timeout 5 --max-time 12 "${base%/}/api/auth/login" 2>/dev/null || true)"
  session_cookie="$(awk 'tolower($1) == "set-cookie:" { split($2, parts, ";"); print parts[1] }' "$login_headers" | tail -n1)"
  login_error="$(node -e '
    const fs = require("node:fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const message = typeof value.error === "string" ? value.error : "";
      process.stdout.write(message.replace(/[\\r\\n]+/g, " ").slice(0, 240));
    } catch {
      process.stdout.write("");
    }
  ' "$login_body" 2>/dev/null || true)"
  rm -f "$body_file" "$login_headers" "$login_body"

  if [ "$login_code" != "200" ] || [ -z "$session_cookie" ]; then
    echo "::error::$name admin login handshake failed (HTTP ${login_code:-no response}; ${login_error:-server did not return a safe error message}; session cookie missing or invalid)" >&2
    return 1
  fi

  # Send the cookie explicitly so this local HTTP probe can exercise a cookie
  # configured Secure for the real HTTPS Cloudflare endpoint.
  root_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Cookie: $session_cookie" --connect-timeout 5 --max-time 20 \
    "${base%/}/" 2>/dev/null || true)"

  if [ "$root_code" = "200" ]; then
    echo "✓ $name authenticated root page renders (HTTP 200)"
    return 0
  fi

  echo "::error::$name authenticated root page failed (HTTP ${root_code:-no response})" >&2
  return 1
}

check_authenticated_root "http://127.0.0.1:${DASH_PORT}" "local dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -200 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  exit 1
}

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
  tail -50 "$TUNNEL_LOG" >&2 || true
  exit 1
fi

echo "▸ verifying public tunnel DNS and dashboard routes"
PUBLIC_READY=0
for attempt in $(seq 1 120); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "::error::cloudflared exited before the public URL became ready" >&2
    tail -60 "$TUNNEL_LOG" >&2 || true
    exit 1
  fi
  HTTP_CODE="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 12 "$TUNNEL_URL/login" 2>/dev/null || true)"
  case "$HTTP_CODE" in
    2??|3??)
      PUBLIC_READY=1
      echo "✓ public login page is reachable (HTTP $HTTP_CODE)"
      break
      ;;
  esac
  if [ "$((attempt % 10))" -eq 0 ]; then
    echo "  waiting for public DNS/edge readiness (${attempt}/120)"
  fi
  sleep 2
done

if [ "$PUBLIC_READY" -ne 1 ]; then
  echo "::error::Cloudflare published $TUNNEL_URL but /login never became reachable" >&2
  tail -60 "$TUNNEL_LOG" >&2 || true
  tail -100 "$ROOT/logs/dashboard.log" >&2 || true
  exit 1
fi

check_root_route "$TUNNEL_URL" "public dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -150 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  echo "--- logs/tunnel.log ---" >&2
  tail -80 "$TUNNEL_LOG" >&2 2>/dev/null || true
  exit 1
}

check_authenticated_root "$TUNNEL_URL" "public dashboard" || {
  echo "--- logs/dashboard.log ---" >&2
  tail -200 "$ROOT/logs/dashboard.log" >&2 2>/dev/null || true
  echo "--- logs/tunnel.log ---" >&2
  tail -80 "$TUNNEL_LOG" >&2 2>/dev/null || true
  exit 1
}

printf '%s\n' "$TUNNEL_URL" > "$TUNNEL_URL_FILE"
echo "TUNNEL_URL=$TUNNEL_URL"
{
  echo "### 🌌 Destiny Admin Console"
  echo ""
  echo "- **URL:** `${TUNNEL_URL}`"
  echo "- **Password:** the value of `DASHBOARD_ADMIN_PASSWORD`"
  echo "- **Expires:** when this job ends"
  echo "- **Route checks:** /login reachable; / redirects to /login"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "▸ admin console is live at $TUNNEL_URL"
wait "$TUNNEL_PID"
