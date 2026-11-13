# Dashboard deployment preparation

> Current status: the dashboard is deployed on Cloudflare Workers at `destiny.chuglii.in`. Migration 022 is applied, runtime storage is Supabase-only, and no Redis bindings remain on the Worker. Older notes below describe initial setup and are superseded where they disagree with this status.

## Intended hosts

- Server dashboard: `admin.chuglii.in`
- Owner dashboard: `owner.chuglii.in`

These are requested defaults only. DNS, TLS, host ownership, current provider, reverse proxy configuration, and deployment target have not been verified or changed.

## Current readiness

- The repository contains bot/worker Docker files plus the dashboard image and isolated Compose configuration. The dashboard container is prepared but not deployed; the supplied Discord credentials need rotation, and a service deployment target is not configured.
- A separate GitHub Actions validation workflow builds TypeScript and runs the automated suite on pull requests or manual dispatch. It does not provision production credentials, apply migrations, or start a public service.
- Dashboard processes now start independently with `pnpm dashboard:server` and `pnpm dashboard:owner`; owner process selects its app boundary before configuration loads.
- Discord client ID/secret, bot token, and root-owner IDs were supplied through a handoff text file. The secret and token were copied to the ignored `.env` before the handoff file was deleted; both must be rotated before deployment because they were present in plaintext.
- The ignored `.env` targets the fresh `destiny project` Supabase project (`biqjoimzjljnxhliybcq`). Migrations 001–020 were applied through the Supabase plugin; final public tables are empty with RLS enabled, the operator grant RPC is service-role-only, and security advisors returned no lints. The older `destiny bot` project remains separate and no application rows were moved.
- Do not expose the bot's service-role or token environment to a frontend build.

## Cloudflare plugin review

Reviewed: 2026-11-13. Per the user instruction, use the connected Cloudflare plugin; do not use `CLOUDFLARE_API_TOKEN` from `.env`.

- The connected Cloudflare account has the active `chuglii.in` zone. The intended dashboard names `admin.chuglii.in` and `owner.chuglii.in` currently have no DNS records, Worker routes, or Worker custom-domain attachments.
- The zone's apex and `www` are already routed to the existing Vercel site. Preserve those records.
- An existing Cloudflare Tunnel is healthy and sends wildcard `*.apps.chuglii.in` traffic to an existing reverse proxy on port 80. Its configuration also contains a Coolify ingress for `coolify.chuglii.in`, but that hostname has no DNS record and failed to resolve from the browser.
- The requested hostname has been changed to `destiny.chuglii.in`. It has an explicit proxied CNAME to the existing tunnel; no bot HTTP service is deployed behind it. A Discord Gateway bot itself does not require inbound DNS.
- Cloudflare Access is not enabled for the account, so the Coolify console route cannot safely be exposed yet. Do not create public DNS for the management hostname until an access policy is enabled or another secured management path is confirmed.
- The dashboard Worker is deployed; bot/worker containers remain prepared separately. The production dashboard uses the Worker adapter and Supabase runtime state.
- DNS was updated on 2026-11-13: `destiny.chuglii.in` is a proxied CNAME to the existing tunnel, and `destiny-bot.apps.chuglii.in` was deleted. Tunnel ingress version 11 routes `destiny.chuglii.in` to the existing reverse proxy at `http://localhost:80`; there is still no bot HTTP service attached behind that proxy.

The ignored local `.env` contains Discord settings, root-owner IDs, dashboard origins, distinct session secrets, and the configured fresh Supabase project's URL, publishable key, and `service_role` key. Compose does not pass the management token to dashboard runtime containers, and the Docker build excludes `.env`. `text1.txt` was deleted after the supplied Discord credentials were transferred. The active Worker retains its existing Discord and Supabase secret bindings.

## Required before a deployment

1. Publish the bot/workflow changes to GitHub from an account with repository access. Coolify DNS is only needed to reach the Coolify management UI; the bot hostname is separate.
2. Discord OAuth callbacks are registered for the deployed Destiny dashboard and the existing admin/owner dashboard origins. Keep each dashboard's host-only session secrets distinct.
3. Configure HTTPS, DNS, health checks, trusted proxy behavior, rate limits, and origin allowlists.
4. Extend the dashboard validation workflow with browser end-to-end and visual checks after a safe OAuth test environment is available.
5. [x] Apply migrations 001–020 to the fresh runtime project through the Supabase plugin and verify the final schema, RLS, and grants.
6. Use backward-compatible migrations and a tested backup/restore plan.
7. Roll out without replacing or interrupting the existing bot and worker service.

## Prepared production container

`docker/Dockerfile.dashboard` builds the dashboard from the repository. `docker-compose.dashboard.yml` starts independent server and owner dashboard processes, maps only their required environment, and does not start or rebuild the bot/worker services. It reads Compose interpolation values from the root `.env`; production-required values use fail-fast interpolation instead of silently falling back to mock/local configuration. The image exposes port 3000 internally for the existing reverse-proxy path and has a host-aware `/health` check.

The dashboard's OAuth state, encrypted sessions, and rate limits use Supabase PostgreSQL, so they survive Worker restarts and scale across requests.

## Developer startup

For developer startup, set the Discord OAuth client secret, root-owner ID, dashboard origins, and separate session secrets in the environment, then run `pnpm dashboard:server` and `pnpm dashboard:owner` in separate processes. OAuth callbacks must be registered in Discord.

## Initial deployment status (before Cloudflare release)

At the initial Vercel check, `destiny.chuglii.in` returned HTTP 502 because no dashboard service was attached. The Cloudflare Worker route described below now serves the dashboard. The fresh `destiny project` Supabase database has migrations 001–020 and empty application tables. The older `destiny bot` project and isolated validation project remain separate.

## GitHub and Vercel handoff (2026-11-13)

- Created private repository [`someonebest007/destiny-bot`](https://github.com/someonebest007/destiny-bot) and pushed commit `36cebd6` to `main`. The local `.env` and deleted `text1.txt` are not tracked or pushed.
- Pushed handoff commit `63591f3`; GitHub Actions `Code Quality` and `Dashboard Checks` completed successfully.
- The connected GitHub plugin account is suspended, so its API returns HTTP 403. The `GITHUB_PAT` stored in ignored `.env` authenticated successfully as `someonebest007`; it was used only for repository creation and push, and was not printed or committed.
- The existing GitHub bot workflow is a six-hour runner session followed by automatic continuation. Its build succeeded, but its first run failed at database connection resolution because no database password is configured. The continuation run was canceled, and both `Destiny Bot Runner` and `Destiny Session Continuation` were disabled in GitHub until required production secrets are ready. The separate `Code Quality` and `Dashboard Checks` workflows remain enabled.
- The runner no longer applies migrations on every start: migrations 001–020 were already applied through the Supabase plugin. I removed the direct PostgreSQL password/Management API dependency and added a runtime secret preflight so future runs identify missing bot credentials before startup.
- The workflow fix was pushed in `bfa0e7b`. Its `Code Quality` run (TypeScript build, tests, migration smoke test, and Docker builds) and `Dashboard Checks` run both passed.
- The current workflow was pushed to `main`; all Redis/BullMQ Actions secrets were removed, and the non-empty runtime secrets were synchronized from ignored `.env`.
- Vercel was not used for the dashboard; the production dashboard runs on Cloudflare Workers.
- Plugin check: Supabase shows only the active `destiny project`; its project list does not reveal the PostgreSQL password or a hosted Redis endpoint. Vercel shows eight projects under `Personal` and none under `Primary`; neither account lists `chuglii.in` as a managed domain.
- Live check (2026-11-13): `https://destiny.chuglii.in/` and `/health` return HTTP 502 from Cloudflare. DNS is still a proxied CNAME to the existing tunnel; ingress sends the hostname to `http://localhost:80`, where no Destiny backend is attached. Vercel has no Destiny project/deployment; the latest listed deployments are for the unrelated `opendrive` project. Therefore, the dashboard is not deployed to Vercel and the 502 is expected from the current routing.

## Dashboard production deployment state (2026-11-13)

- Added a Vercel Node function adapter and routing config for the server dashboard. `pnpm run build:vercel` compiles the TypeScript and stages the server dashboard shell/static assets.
- Added Supabase migration 021 for shared dashboard runtime state and rate limits. Discord OAuth session data is encrypted with the per-dashboard session secret before storage. The migration was applied to the `destiny project`; both new tables have RLS enabled and the Supabase security advisor reported no lints.
- Updated ignored `.env` so `SERVER_DASHBOARD_ORIGIN` is `https://destiny.chuglii.in`.
- The Vercel adapter and migration were committed and pushed to `someonebest007/destiny-bot` in commit `23cd600` (`Adapt dashboard for Vercel serverless runtime`). The local Vercel build succeeded, but Vercel project creation was denied on both connected teams.
- Vercel project creation was attempted on both connected accounts: Personal (`team_ShZ1kmW4lZqaKMJzJ3Fx3nIE`) and Primary (`team_AfWgG9L4r0LQFRoeUcXUQpME`). Both returned HTTP 403, “You don't have permission to create the project.” No project or deployment exists. The Vercel CLI is not installed locally, so the connector's suggested CLI fallback is unavailable.
- The connected GitHub API now returns HTTP 403, “Sorry. Your account was suspended.” This prevents checking Actions results and Git-based Vercel deployment. No GitHub or Vercel secret values were exposed in this check.
- Cloudflare Workers is the production host. The dashboard Worker uses Supabase-backed encrypted OAuth/session state, runtime diagnostics, and database rate limits.
- Deployed Worker `destiny-dashboard` to Cloudflare account `fb944101733d9b14aa29e5be59073eb2` (deployment `728322fcf59d425d8bb5237bcb70754b`). Created Worker route `destiny.chuglii.in/*` (route ID `67c32554e5bd4de0919df88733a79450`). Cloudflare DNS remains proxied to the existing Tunnel CNAME; the Worker route now handles requests before origin routing, so no DNS record was replaced.
- Stored the current `.env` runtime values in Cloudflare Worker variables and encrypted secret bindings, as requested. The temporary `workers.dev` endpoint was disabled after verification.
- Live check (2026-11-13): `/`, `/health`, `/dashboard.css`, and `/dashboard.js` all return HTTP 200. `/auth/login` returns HTTP 302 to Discord with callback `https://destiny.chuglii.in/auth/callback`; this confirms the Worker can use the configured Discord credentials and Supabase state/rate-limit RPCs.
- Resolved `Invalid OAuth2 redirect_uri` on 2026-11-13: registered `https://destiny.chuglii.in/auth/callback` on the Discord application used by the bot. Confirmed the live authorization URL uses that exact callback and Discord no longer returns the redirect URI error.
- The dashboard uses the existing Cloudflare secret bindings. The GitHub bot workflow still needs publishing through an account with repository access before it can be re-enabled.

### Remaining inputs for production deployment

1. Publish the locally updated bot workflow through an authorized GitHub account and confirm its existing non-Redis runtime secrets.
2. Re-enable the bot runner only after its workflow is published and the Supabase-backed runtime state is verified in the runner.
3. Confirm that both OAuth callback URLs are registered. The project already has its Supabase migrations applied, so the bot runner no longer needs a direct database password.
4. Vercel still denies project creation on both connected teams, and GitHub's connected API reports the account suspended. The dashboard is live on Cloudflare Workers; keep the Worker route and Cloudflare DNS record in sync if the origin setup changes.

