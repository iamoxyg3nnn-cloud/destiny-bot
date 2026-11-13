# Dashboard execution plan

Updated: 2026-11-13 (Asia/Kolkata)

## Current continuation checkpoint

- Active slice: ignored `.env` now targets the fresh Supabase project `destiny project` (`biqjoimzjljnxhliybcq`), with migrations 001–020 applied and verified. The older `destiny bot` project remains separate and no application data was moved. The requested public DNS name is now `destiny.chuglii.in`, proxied to the existing Cloudflare Tunnel; the previous `destiny-bot.apps.chuglii.in` record was deleted. Tunnel ingress now sends this hostname to the existing reverse proxy on port 80, but no bot HTTP service is attached yet. Redis is explicitly disabled for dashboard processes only; sessions are in-memory and each process must stay single-replica.
- External setup still needed: rotate and replace the exposed Discord secret and bot token, register both dashboard OAuth callbacks, and provide a reachable service deployment target. The Supabase API URL, publishable key, and server key are now in ignored `.env`. Do not use `CLOUDFLARE_API_TOKEN` from `.env`; use the connected Cloudflare plugin.
- Continue updating this checkpoint and the tests/build section as implementation advances.

## Completed

- [x] Audited local Git state before edits; verified clean `main` at `1a0204e`, the dashboard-removal commit.
- [x] Confirmed current stack and absence of web frontend/API/OAuth/deployment.
- [x] Inspected existing guild settings, bot setup authorization, owner allowlist diagnostics, current database tables/migrations, and privacy restrictions.
- [x] Recorded public Wabbit landing/server-picker patterns and documented that private settings were not inspected.
- [x] Created initial repository audit, feature matrix, reference research, architecture, and security model documents.
- [x] Added separate static server/owner dashboard shells and an HTTP process with Discord OAuth state + PKCE, independent session namespaces/secrets, owner allowlist, server guild authorization, CSRF checks, live bot channel-permission checks, guild settings APIs, owner health API, and audit writes.
- [x] Added permission computation unit tests; previewed the unauthenticated server login screen.
- [x] Added owner-only connected-server search/pagination and real aggregate counts for users and active conversations, returning unavailable when live data is not available.
- [x] Added paginated owner audit history and guild-scoped history that revalidates current Discord manager access; omitted stored IP metadata from dashboard responses.
- [x] Added live worker heartbeat freshness and shard snapshot diagnostics to owner monitoring.
- [x] Added real BullMQ waiting/active/completed/failed counts; failed queue reads are reported unavailable instead of as zero.
- [x] Added current bot access indicators for selected portal and moderation channels.
- [x] Added conditional dashboard saves using the existing `guild_settings.updated_at` value, with stale-write conflict responses and client refresh; no migration required.
- [x] Added an owner-only report queue with metadata-only list rows, case-specific pseudonymized evidence, rationale-required resolution, confirmation for restrictions, reuse of the existing atomic resolver, and audit recording.
- [x] Added owner-only server detail views with fresh Destiny bot channel permissions and stored guild configuration.
- [x] Added a server getting-started checklist based on connected status, current channel permissions, and supported settings; unsupported manager-role assignments are stated plainly.
- [x] Added HTTP handler integration checks for configured-host enforcement, static app response, and rejection of unauthenticated API reads/writes.
- [x] Added exact-match owner user lookup by Destiny ID or Discord ID; writes an audit event before returning data, reveals Discord ID only for Discord-ID searches, and exposes restriction/verification status without profile content or mutation controls.
- [x] Added paginated active-conversation inventory using room code, participant pseudonyms, and timestamps only; each inventory read is audited and excludes account IDs and message contents.
- [x] Expanded HTTP integration coverage to verify fresh Discord membership checks on repeated requests, cross-guild denial, owner root allowlist enforcement, and independent owner/server session cookies.
- [x] Added authenticated HTTP tests proving stale settings writes conflict, report mutations reuse the resolver, verification mutations reuse the reviewer, and user lookup fails closed when audit persistence is unavailable.
- [x] Added mocked OAuth tests for state+PKCE, callback exchange, token refresh, logout revocation, state replay denial, owner root gating, and login audit records.
- [x] Added an independent dashboard CI workflow for TypeScript build, automated tests, and shared dashboard JavaScript syntax; it does not run in the bot deployment workflow or apply database migrations.
- [x] Reviewed the current guild permission flow and Supabase migration 018 RLS boundary; documented that service-role dashboard queries still require route scoping, and that the legacy `allowed_roles` column is not an implemented role system.
- [x] Added a guild-scoped configuration JSON export containing only supported settings; export requires current membership/bot snapshot and is withheld when the audit write fails.
- [x] Extended authenticated HTTP coverage for export scope, attachment metadata, and guild audit recording; raised the owner integration setup timeout after full-suite contention caused an initial 10-second hook timeout.
- [x] Mapped every current server and owner API route to its active authorization check; verified Discord's documented current-user guild member endpoint as the fresh source for role IDs, gated behind the not-yet-requested `guilds.members.read` scope.
- [x] Added an explicit, confirmation-gated rollback for current dashboard setting events; only restores a value if it is still current, rechecks live bot channel permissions, uses optimistic concurrency, and records a rollback audit event.
- [x] Confirmed no local `docker`, Supabase CLI, or `psql` is installed and no local Supabase config exists; migration validation was performed later through the connected Supabase plugin on an isolated project.
- [x] Initially inspected the older production project metadata without application-row reads; later, initialized the fresh `.env`-selected runtime project separately as recorded below.
- [x] Compared remote migrations 017–019 with local history and validated migration 020 on isolated, zero-monthly-cost project `destiny-dashboard-validation` after the Pro-only development branch option was unavailable.
- [x] Added operator grant storage and an atomic grant/revoke RPC; exercised grant, revoke, idempotency, and audit-failure rollback on the isolated project. Active production project `destiny bot` remains unchanged.
- [x] Implemented default-deny capability guards across owner read/review routes, root-only operator management APIs, per-request revocation, and root-only grant management UI.
- [x] Added HTTP coverage for root-only management, capability-scoped access, audit-backed grant/revoke, invalid capabilities, root protection, and immediate revocation.
- [x] Completed metadata-only inventory of all active public tables, columns, key relationships, RLS policies, functions, and triggers through the Supabase plugin; no application rows or secrets were read.
- [x] Reviewed Discord shard snapshots, worker heartbeats, BullMQ producers/consumers, and owner diagnostics; documented stale Redis index and unused-queue visibility limits.
- [x] Used the connected Cloudflare plugin to inspect the `chuglii.in` zone, dashboard host records, existing Workers, and Tunnel routing without changing production resources.
- [x] Prepared isolated production dashboard containers in `docker/Dockerfile.dashboard` and `docker-compose.dashboard.yml`; Compose maps only dashboard-required variables from `.env`, keeps dashboard services separate from bot/worker services, and fails fast for missing required configuration.
- [x] Set dashboard-only process-local Redis fallback through `REDIS_DISABLED_FOR_DASHBOARD=true`; the bot/worker configuration remains unchanged.
- [x] Set the fresh runtime project's Supabase URL and publishable key in ignored `.env` from project information; retrieved its server `service_role` key through the access token already stored in `.env` and kept the value out of output.
- [x] Applied production migration 020 through the Supabase plugin and verified table/function existence, RLS, and service-role-only function execution; security advisors returned no lints.
- [x] Transferred the provided Discord credentials to ignored `.env`, then deleted `text1.txt`; treat the Discord bot token and OAuth client secret as exposed and rotate them before deployment.
- [x] Used the `SUPABASE_ACCESS_TOKEN` already in ignored `.env` with the official Supabase Management API to retrieve the configured project's `service_role` key without printing it; stored it and the project's publishable key in `.env`, then verified the key against the project's REST API.
- [x] Initialized fresh Supabase project `destiny project` from migrations 001–020 through the Supabase plugin; verified 20 migration records, nine final public tables with RLS, service-role-only operator RPC execution, and no security advisor lints. The new project has no application rows.
- [x] Created explicit proxied Cloudflare CNAME `destiny-bot.apps.chuglii.in` to the existing tunnel; later replaced it with `destiny.chuglii.in` and added matching tunnel ingress to the existing reverse proxy per the user's request. No bot HTTP service is attached to the proxy yet.

## Remaining

- [x] Complete metadata-only feature/domain/API inventory, including full active table/function/RLS and worker diagnostics review; see `docs/DASHBOARD_DATABASE_RUNTIME_INVENTORY.md`.
- [ ] Expand the HTTP service and independent server/owner OAuth policies with authenticated production integration tests; live OAuth credentials/callbacks are not present in this environment.
- [ ] Add guild role membership authorization only after explicit `guilds.members.read` consent and role-removal coverage; delegated global owner capability and revocation coverage is complete.
- [x] Add dashboard setting conflict detection using existing `updated_at`; atomic setting+audit writes and effective bot synchronization reporting remain.
- [x] Added root-owner verification queue and case detail using existing user records and the existing review service; queue omits Discord IDs and evidence until a case is opened.
- [x] Added exact-match user status lookup and privacy-scoped active conversation metadata after case/privacy review; restriction mutation and room termination remain unavailable.
- [x] Add and validate migration 020 on the isolated project, then apply and verify it on the active production project through the Supabase plugin.
- [x] Expanded dashboard UI to cover implemented settings, audit, monitoring, server inventory, report and verification review, user lookup, room metadata, and delegated operator workflows with loading/error/empty/denied states.
- [x] Implement the route-to-capability matrix with default-deny checks, transactional operator grant/audit storage, and negative tests. Guild roles remain gated on explicit OAuth scope consent and validated current-member responses.
- [x] Add focused authorization tests and run current build/test checks.
- [x] Capture local sign-in screen evidence and document inaccessible reference areas; authenticated viewports still require OAuth setup.
- [ ] Finish deployment and recovery documentation based on actual host configuration; production setup/deploy remains a separate safeguarded operation.
- [x] Added GitHub Actions dashboard build/test workflow for pull requests, manual runs, and pushes to `main`; production deployment remains blocked on runtime host and rotated credentials.

## Decisions and constraints

- Do not restore the removed dashboard or move the existing bot architecture unnecessarily.
- Keep anonymous chat/matchmaking intact; exclude economy, progression, and Icebreaker.
- No fake API operations, metrics, or toggles.
- No production database changes, DNS changes, public exposure, push, or deployment without the safeguards specified in the brief.
- The current repo has no dashboard OAuth configuration; implementation must remain honest about required Discord application/client settings.

## Tests and builds

- `pnpm build`: passed after platform operator wiring.
- `pnpm test`: 161 passed across 28 test files. Owner dashboard focused suite: 9 passed, including delegated OAuth login, grants, root-only management, scoped access, and immediate revocation.
- HTTP boundary tests cover the server and owner host/session boundaries, current guild authorization, settings conflict/export/rollback, report/verification actions, delegated capability access/revocation, and mocked OAuth lifecycle; `node --check apps/shared/dashboard.js` and `git diff --check` passed.
- Browser preview: local server login page loaded and rendered; OAuth could not be completed because no dashboard OAuth secret/callback is configured.

## Handoff notes

- Current server HTTP/OAuth/static implementation is in `src/dashboard/server.ts`; the owner entry point is `src/dashboard/owner.ts`. Shared dashboard rendering is in `apps/shared/dashboard.js` and styles in `apps/shared/dashboard.css`.
- Dashboard routes reuse `guild_settings`, `admin_audit_logs`, `reports`, existing user/room/verification fields, `verificationService`, and `resolve_report_atomic`. Migration 020 was added locally, validated on the isolated project, and applied/verified on production.
- Active Supabase schema, RLS, function grants, and runtime/queue observability details are documented in `docs/DASHBOARD_DATABASE_RUNTIME_INVENTORY.md`; migration 020 is now present in the production project.
- Owner report/verification routes return 503 when Supabase is in mock mode. Report and verification queue rows omit sensitive evidence; evidence is loaded only for a single case and requires the matching review capability.
- Owner user lookup is exact-match and audit-on-access. Active conversation inventory is audit-on-read and returns pseudonyms/timing only; there is no room termination endpoint.
- Conditional guild saves compare the caller's `expectedUpdatedAt` against the existing `guild_settings.updated_at`. Audit insertion remains a separate write, so failures are surfaced as saved-with-audit-warning.
- Guild configuration download is JSON, limited to the current portal/moderation channel IDs, cross-server setting, timestamps, and guild ID/name. Download access is written to guild audit before the response; there is no import endpoint.
- Rollback is limited to the latest still-effective value from a supported dashboard setting event. It validates that the current setting equals the audit event's `next` value and that any prior channel still has required bot permissions. Audit insertion still follows the database update, so the UI reports when the restore succeeded but its audit failed.
- Local `.env` setup: Discord credentials/owner IDs, dashboard origins/secrets, Supabase URL/publishable/service-role keys, and dashboard Redis-off flag are set. The Discord OAuth secret and bot token must be rotated because they were exposed in the handoff text. Fresh project `destiny project` has migrations 001–020 and empty application tables; older project `destiny bot` remains separate. The Cloudflare plugin reconfirmed `supabase-selfhosted` is healthy (four active connections); `destiny.chuglii.in` and the wildcard route point to the tunnel; ingress sends the new hostname to the existing reverse proxy, but no bot HTTP app is deployed. Dashboard and Coolify hostnames still have no records; Cloudflare Access is not enabled. No application service was deployed.
- `tests/unit/setup-env.test.ts` checks POSIX mode bits only off Windows because Windows reports file mode `0666`; the content-preservation checks still run everywhere.

## Next actionable task

Private repository `someonebest007/destiny-bot` contains commits through `44ac865`; `.env` and `text1.txt` were excluded. The Actions dashboard build/test workflow runs on pushes to `main`. `Code Quality` and `Dashboard Checks` passed on `44ac865`. The six-hour bot runner and its auto-continuation remain paused in GitHub; I removed migrations from bot startup because migrations 001–020 were applied already and added a runtime-secret preflight after the previous run failed with all repository secrets empty. The runner still needs a hosted Redis endpoint and rotated Discord credentials added as Actions secrets before re-enabling. For Vercel, a Node function adapter and Supabase-backed encrypted session/rate-limit store are implemented locally, and migration 021 is applied; deployment is in progress. `destiny.chuglii.in` still routes through Cloudflare Tunnel to the existing reverse proxy and returns HTTP 502 until the Vercel production deployment is ready. Register the new Discord OAuth callback before login can complete. Consider stale Redis index cleanup and queue-counter semantics when Redis is restored; see `docs/DASHBOARD_DATABASE_RUNTIME_INVENTORY.md`. Guild-role membership remains unimplemented and requires `guilds.members.read` consent and role-removal coverage.

