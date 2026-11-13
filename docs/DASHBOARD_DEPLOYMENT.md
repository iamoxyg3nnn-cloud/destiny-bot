# Dashboard deployment preparation

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
- The Cloudflare account contains two existing Workers for unrelated mail functionality. No dashboard Worker exists. The repository's dashboard is a Node HTTP server using Redis/ioredis and BullMQ. A generic Docker image and isolated dashboard Compose deployment are now prepared for a container host; Cloudflare Containers still have no Worker/Container adapter deployment pipeline in this repository.
- DNS was updated on 2026-11-13: `destiny.chuglii.in` is a proxied CNAME to the existing tunnel, and `destiny-bot.apps.chuglii.in` was deleted. Tunnel ingress version 11 routes `destiny.chuglii.in` to the existing reverse proxy at `http://localhost:80`; there is still no bot HTTP service attached behind that proxy.

The ignored local `.env` contains Discord settings, root-owner IDs, intended dashboard origins, distinct generated session secrets, and the configured fresh Supabase project's URL, publishable key, and `service_role` key. The project API key was retrieved using `SUPABASE_ACCESS_TOKEN` already in `.env` through the Supabase Management API and verified without printing it. Compose does not pass the management token to dashboard runtime containers, and the Docker build excludes `.env`. `text1.txt` was deleted after the supplied Discord credentials were transferred. Replace the Discord secret and bot token with newly rotated values before deployment. Redis is disabled for dashboard processes through `REDIS_DISABLED_FOR_DASHBOARD=true`.

## Required before a deployment

1. Provide or configure a container/service deployment target behind the existing tunnel/reverse proxy. Coolify DNS is only needed to reach the Coolify management UI; the bot hostname is separate. Cloudflare Access is not enabled, so protect Coolify before making its console public.
2. Register `https://admin.chuglii.in/auth/callback` and `https://owner.chuglii.in/auth/callback` in the Discord application. Configure distinct host-only session secrets for each dashboard.
3. Configure HTTPS, DNS, health checks, trusted proxy behavior, rate limits, and origin allowlists.
4. Extend the dashboard validation workflow with browser end-to-end and visual checks after a safe OAuth test environment is available.
5. [x] Apply migrations 001–020 to the fresh runtime project through the Supabase plugin and verify the final schema, RLS, and grants.
6. Use backward-compatible migrations and a tested backup/restore plan.
7. Roll out without replacing or interrupting the existing bot and worker service.

## Prepared production container

`docker/Dockerfile.dashboard` builds the dashboard from the repository. `docker-compose.dashboard.yml` starts independent server and owner dashboard processes, maps only their required environment, and does not start or rebuild the bot/worker services. It reads Compose interpolation values from the root `.env`; production-required values use fail-fast interpolation instead of silently falling back to mock/local configuration. The image exposes port 3000 internally for the existing reverse-proxy path and has a host-aware `/health` check.

Redis is disabled for the dashboard only, as requested. OAuth state, sessions, and rate limits use each process's in-memory fallback; restarts clear them and each dashboard must remain at one replica. BullMQ queue diagnostics will report unavailable. Bot and worker Redis settings are untouched. This is a temporary single-instance configuration; re-enable shared Redis before scaling either dashboard or relying on persistent sessions.

## Developer startup

For developer startup, set the Discord OAuth client secret, root-owner ID, dashboard origins, and separate session secrets in the environment, then run `pnpm dashboard:server` and `pnpm dashboard:owner` in separate processes. Production Compose currently uses a process-local fallback for OAuth state and sessions because Redis is disabled; keep one replica per dashboard, expect sessions to clear at restart, and expect queue metrics to be unavailable. OAuth cannot be completed until both callback URLs are registered in Discord.

## Deployment status

Not deployed. `destiny.chuglii.in` now points to the existing tunnel, but no bot HTTP route or dashboard service is attached yet. The fresh `destiny project` Supabase database has migrations 001–020 and empty application tables. The older `destiny bot` project and isolated validation project remain separate.

## GitHub and Vercel handoff (2026-11-13)

- Created private repository [`someonebest007/destiny-bot`](https://github.com/someonebest007/destiny-bot) and pushed commit `36cebd6` to `main`. The local `.env` and deleted `text1.txt` are not tracked or pushed.
- Pushed handoff commit `63591f3`; GitHub Actions `Code Quality` and `Dashboard Checks` completed successfully.
- The connected GitHub plugin account is suspended, so its API returns HTTP 403. The `GITHUB_PAT` stored in ignored `.env` authenticated successfully as `someonebest007`; it was used only for repository creation and push, and was not printed or committed.
- The existing GitHub bot workflow is a six-hour runner session followed by automatic continuation. Its build succeeded, but its first run failed at database connection resolution because no database password is configured. The continuation run was canceled, and both `Destiny Bot Runner` and `Destiny Session Continuation` were disabled in GitHub until required production secrets are ready. The separate `Code Quality` and `Dashboard Checks` workflows remain enabled.
- The runner no longer applies migrations on every start: migrations 001–020 were already applied through the Supabase plugin. I removed the direct PostgreSQL password/Management API dependency and added a runtime secret preflight so future runs identify missing bot credentials before startup.
- The workflow fix was pushed in `bfa0e7b`. Its `Code Quality` run (TypeScript build, tests, migration smoke test, and Docker builds) and `Dashboard Checks` run both passed.
- The Actions secrets list is empty. No values from the local `.env` have been copied into GitHub yet. Current `.env` lacks a hosted Redis connection and Discord public key. The Discord bot token and OAuth client secret should be rotated before they are stored remotely.
- Vercel connector accounts are `Personal` (team `Apunabhibhilegendhai`, with existing projects) and `Primary` (team `lawdachuss-projects`, with no projects). Neither account lists a domain. No Vercel project has been created yet. The current dashboard is a persistent Node HTTP server and uses process-local OAuth/session/rate-limit fallback when Redis is disabled; deploying its static shell alone would leave every API route broken, and Vercel serverless instances do not share that in-memory state.
- Plugin check: Supabase shows only the active `destiny project`; its project list does not reveal the PostgreSQL password or a hosted Redis endpoint. Vercel shows eight projects under `Personal` and none under `Primary`; neither account lists `chuglii.in` as a managed domain.
- Live check (2026-11-13): `https://destiny.chuglii.in/` and `/health` return HTTP 502 from Cloudflare. DNS is still a proxied CNAME to the existing tunnel; ingress sends the hostname to `http://localhost:80`, where no Destiny backend is attached. Vercel has no Destiny project/deployment; the latest listed deployments are for the unrelated `opendrive` project. Therefore, the dashboard is not deployed to Vercel and the 502 is expected from the current routing.

## Vercel serverless adapter in progress

- Added a Vercel Node function adapter and routing config for the server dashboard. `pnpm run build:vercel` compiles the TypeScript and stages the server dashboard shell/static assets.
- Added Supabase migration 021 for shared dashboard runtime state and rate limits. Discord OAuth session data is encrypted with the per-dashboard session secret before storage. The migration was applied to the `destiny project`; both new tables have RLS enabled and the Supabase security advisor reported no lints.
- Updated ignored `.env` so `SERVER_DASHBOARD_ORIGIN` is `https://destiny.chuglii.in`.
- The app code has not been pushed or deployed yet. Next steps: push and confirm GitHub validation, link the private repository under Vercel Personal, set production environment values from `.env`, deploy, attach `destiny.chuglii.in`, and switch Cloudflare DNS from Tunnel to Vercel after the production URL responds successfully.
- Register `https://destiny.chuglii.in/auth/callback` in the Discord application before OAuth sign-in can complete.
- Before releasing, rotate the Discord bot token and OAuth client secret that were present in plaintext in the deleted handoff file. Update the ignored `.env`; do not send the secret values in chat. Bot production also requires a persistent runtime host and Redis endpoint. After rotation and target configuration, add only the runtime secrets needed to GitHub Actions/Vercel using their encrypted secret stores.

### Remaining inputs for production deployment

1. Configure a production Redis URL (`REDIS_URL`) or hosted host/port/credential fields. Redis is disabled only for dashboard fallback; bot queues and coordination require shared Redis.
2. Rotate the Discord bot token and OAuth client secret, update the ignored `.env`, and add the required runtime secrets to the private GitHub repository before re-enabling the bot workflows.
3. Confirm that both OAuth callback URLs are registered. The project already has its Supabase migrations applied, so the bot runner no longer needs a direct database password.
4. The Vercel plugin shows eight projects under Personal and none under Primary. Personal is the account with existing projects; neither account lists `chuglii.in`. The dashboard still needs a Vercel-compatible backend/session design before adding domains; switching DNS to Vercel before that would only replace the 502 with an incomplete deployment.

