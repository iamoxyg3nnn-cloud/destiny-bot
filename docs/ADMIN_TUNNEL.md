# Admin Console via Cloudflare Tunnel

Exposes the Destiny admin dashboard through a temporary Cloudflare quick tunnel
(`*.trycloudflare.com`) so it can be reached from anywhere without opening a
firewall port or owning a domain.

---

## In GitHub Actions (recommended)

The admin console is published by the **same job** that runs the bot —
`.github/workflows/destiny.yml`, job `run-bot`. There is no second workflow and
no second runner.

```
job: run-bot
 ├─ build + prepare env
 ├─ pnpm start (bot + workers + admin API)   ── background
 ├─ cloudflared tunnel → dashboard           ── background
 └─ wait for the bot session to finish
```

The bot session already serves the admin API on `127.0.0.1:4000`, so the tunnel
script runs with `--reuse-api` and starts only the dashboard — there is no second
API instance and no extra runner, which halves the runner minutes per cycle.

Trigger it and read the URL from the run's job summary:

```bash
gh workflow run destiny.yml --repo apunabhibhilegendhai/destiny-bot \
  -f session_minutes=345 -f admin_tunnel=true

# Then read the published URL:
gh run view --repo apunabhibhilegendhai/destiny-bot --log | grep trycloudflare
```

The URL is also written to the **Publish Admin Console** section of the run's
job summary and exported as the `ADMIN_TUNNEL_URL` job output.

The tunnel is **ephemeral**: the URL changes on every run and dies when the job
ends. Because the bot workflow chains itself every ~6 hours, the URL rotates
roughly that often — always check the latest run.

To disable it for a run: `-f admin_tunnel=false`.

---

## Locally

All secrets live in the **project-root `.env`** — that is the single source of
truth for the bot, the API and the dashboard:

```bash
# .env
DASHBOARD_ADMIN_PASSWORD=Admin
DASHBOARD_SESSION_SECRET=<32 random bytes>
API_SECRET_KEY=<32 random bytes>
```

Then build and launch:

```bash
npm run dashboard:build
npm run tunnel:admin
```

The tunnel prints a public URL:

```
  ▸▸  ADMIN CONSOLE IS LIVE
https://example-abc-123.trycloudflare.com
```

Log in with `DASHBOARD_ADMIN_PASSWORD` from `.env`.

Press `Ctrl+C` to tear everything down.

### Detached launch (Windows)

Foreground launches die with their shell. To keep the console running
independently:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-tunnel.ps1
```

This starts the stack as a detached background process and writes:

| File | Contents |
|---|---|
| `logs/tunnel.log` | full console output |
| `logs/tunnel.url` | the published `https://*.trycloudflare.com` URL |
| `logs/tunnel.out.log` / `logs/tunnel.err.log` | raw stdout / stderr |

To stop it, terminate the `node scripts/tunnel-admin.mjs` and `cloudflared`
processes (the script kills any previous instance on start).

---

## Topology

Only the dashboard is published. The backend API stays on loopback.

```
Internet ──► cloudflared ──► 127.0.0.1:3000  (Next.js dashboard)
                                        │
                                        │ server-side proxy, injects x-api-key
                                        ▼
                                127.0.0.1:4000  (Express admin API)
                                        │
                                        ▼
                              Supabase + Redis
```

| Port | Bound to | Reachable from internet? |
|------|----------|--------------------------|
| 3000 | `127.0.0.1` | No — only via the tunnel |
| 4000 | `127.0.0.1` | No — never published |

Verified: `http://<public-ip>:4000` and `http://<public-ip>:3000` both refuse
connections; only the tunnel origin works.

---

## CI notes

The `admin-tunnel` job in `.github/workflows/destiny.yml`:

- Installs `cloudflared` from the pinned GitHub release
  (`CLOUDFLARED_VERSION`, default `2026.10.7`).
- The tunnel script is invoked via `bash ./scripts/start-admin-tunnel.sh`
  rather than `./scripts/...` so it works regardless of the file's exec bit
  (Windows does not preserve the mode when staging).
- The readiness probe sends `x-api-key` — `/api/health` is protected by the
  shared-secret check, so a bare request returns 401 and the API would look
  like it never started.
- Secrets resolve at **runtime**, not build time, so the values can be passed
  as ordinary environment variables.

Required repository secrets:

| Secret | Used by |
|---|---|
| `API_SECRET_KEY` | both jobs — shared by the API and the dashboard proxy |
| `DASHBOARD_ADMIN_PASSWORD` | `admin-tunnel` — console login password |
| `DASHBOARD_SESSION_SECRET` | `admin-tunnel` — HMAC key for session cookies |

---

## Security model

The admin console can ban users, adjust the coin economy, terminate rooms and
read anonymous chat messages. It is therefore authenticated end to end.

### 1. Console session (`dashboard/middleware.ts`)

Every route — including `/api/*` — requires a valid session cookie.

- `HttpOnly`, `SameSite=Lax`, `Secure` (in production), 12-hour expiry.
- Sessions are HMAC-SHA256 signed (`DASHBOARD_SESSION_SECRET`).
- Unauthenticated page requests → `307` redirect to `/login`.
- Unauthenticated API requests → `401`.
- The redirect target is built from the forwarded host so it points at the
  public tunnel origin, not `localhost:3000`.

### 2. Login (`dashboard/app/api/auth/login/route.ts`)

POST `{ "password": "..." }` → compares against `DASHBOARD_ADMIN_PASSWORD`
using a constant-time comparison → issues the signed cookie.

Wrong password → `401`. Missing configuration → `503` (never fails open).

### 3. Backend API (`src/api/server.ts`)

All `/api` routes require an `x-api-key` header matching `API_SECRET_KEY`,
compared in constant time. The key is attached **server-side** by the
dashboard proxy (`dashboard/app/api/[...path]/route.ts`), so it never reaches
the browser bundle.

### Verified behaviour

| Request | Result |
|---|---|
| `GET /` (no session) | `307` → public `/login` |
| `GET /api/overview` (no session) | `401` |
| `POST /api/auth/login` wrong password | `401` |
| `POST /api/auth/login` correct password | `200` + signed `HttpOnly` cookie |
| `GET /` with valid session | `200` |
| `GET /api/overview` with valid session | `200` + JSON |
| Request with forged/tampered cookie | `401` |
| `GET /api/health` on backend without key | `401` |
| `GET /api/health` on backend with wrong key | `401` |
| `GET /api/health` on backend with correct key | `200` |

---

## Configuration

The **project-root `.env`** is authoritative:

| Variable | Purpose |
|---|---|
| `DASHBOARD_ADMIN_PASSWORD` | Password required to unlock the console |
| `DASHBOARD_SESSION_SECRET` | HMAC key for signing session cookies |
| `API_SECRET_KEY` | Shared secret between the dashboard proxy and the backend API |

Precedence, highest first:

1. Real environment variables
2. Project-root `.env`
3. `dashboard/.env.local` (optional per-machine override — only for keys the
   root `.env` does not define)

`dashboard/next.config.js` and `scripts/tunnel-admin.mjs` both implement this
order, so the dashboard and the API always agree on the shared secret whether
the dashboard is launched by the tunnel script or standalone via
`npm run dashboard:start`.

> `scripts/setup-env.js` (used by CI) now also emits `DASHBOARD_ADMIN_PASSWORD`
> and `DASHBOARD_SESSION_SECRET`, so the workflow's `.env` keeps them.
> Add them as repository secrets so CI runs the console with the same values.

---

## Troubleshooting

**`✖ Port 3000/4000 is already in use`** — a previous session is still
running. Stop it, or pass different ports:

```bash
npm run tunnel:admin -- --port 3100 --api-port 4100
```

**`✖ DASHBOARD_ADMIN_PASSWORD is not set`** — create
`dashboard/.env.local` as shown above.

**Tunnel returns 502** — the dashboard or API failed to start. The launcher
waits for both to answer HTTP before opening the tunnel and prints the child
process output, so check the console for the real error.

**Data shows as empty** — the API is in mock mode because `SUPABASE_URL` and
`REDIS_HOST` are unset. Fill in real credentials in the root `.env` to see
live data.

---

## Operational notes

- Quick tunnels are **ephemeral**: the URL changes every run and dies with the
  process. They are also unauthenticated at the Cloudflare layer — our
  application-level auth is the only protection, so keep the password strong.
- For a permanent, non-public hostname, use a named tunnel with Cloudflare
  Access and a real domain instead of this script.
- The tunnel origin is discoverable if the URL leaks, so treat it like a
  password and rotate `DASHBOARD_ADMIN_PASSWORD` if it does.
