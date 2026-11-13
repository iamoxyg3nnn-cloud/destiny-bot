# Dashboard initial repository audit

Audit date: 2026-11-12 (Asia/Kolkata)

## Repository state

- Branch: `main`, tracking `origin/main`.
- Working tree: clean at audit start; no staged, unstaged, deleted, or untracked project changes were present.
- HEAD: `1a0204e Remove standalone dashboard system`.
- Remote: `origin` points to the Destiny Bot GitHub repository.
- Recent history includes server-scoped setup authorization, owner-only diagnostics, and matchmaking context-preservation work. Local `main` is the implementation baseline; do not restore an earlier dashboard from remote history.
- Runtime: TypeScript, NodeNext, pnpm lockfile, Discord.js 14, Supabase JS, ioredis, BullMQ, Zod, and Vitest. No frontend framework, HTTP server, OAuth flow, or dashboard application exists in the current tree.
- Deployment files currently describe the bot and worker containers; no dashboard deployment or OAuth callback setup is present.

## Existing product capabilities observed

- Anonymous one-to-one matchmaking and DM relay, including persisted room/session records, pseudonyms, mutual-consent reveal, report submission, global blocks, and safety restrictions.
- Guild settings persist a matchmaking portal channel, private moderation log channel, and `cross_server_enabled` flag. Database access is through the trusted bot service; the application cache expires after five seconds.
- `/setup portal`, `/setup modlog`, `/setup cross_server`, and `/setup view` are the current server controls. The interaction handler checks the actual guild owner, Manage Server, or Administrator for the applicable setup actions; this is not a dashboard auth flow.
- `/owner status` checks `BOT_OWNER_IDS` and reports live Redis, Supabase, shard, and worker diagnostics. It does not implement a global owner dashboard or delegated operator system.
- Reports, verification state, user restrictions, and rooms exist in the database/domain services. There is no HTTP API to expose them to a dashboard. Their data is sensitive and must not be surfaced until an owner-only case-scoped API is designed and audited.
- `admin_audit_logs` is used for setup operations. Existing audit writes are not a general configuration history API and are not transactionally coupled to all settings writes.
- Migrations 016–019 remove retired economy/progression behavior, harden control-plane helpers, deny direct browser roles access to application tables, and add temporary safety bans. Preserve this current product boundary.

## Important implementation constraints

- No production database, live Discord app settings, DNS, or deployment was modified during this audit.
- `.env` exists and is intentionally excluded from inspection and documentation; secrets must remain server-side.
- Current control-plane access uses the Supabase service role in the bot process. Adding a browser-facing client must not expose that key or grant browser roles direct table access.
- Guild server IDs are stored on `guild_settings`, but the current data model has no dashboard-manager assignments, OAuth identity/session records, dashboard audit schema, or server list API.
- The Discord client is the source for bot presence and guild/channel permission state. Supabase alone cannot prove the bot is still installed or has permission to send messages in a selected channel.

## Decisions

1. Build new applications in new directories; leave the dashboard-removal commit intact.
2. Keep the existing Discord bot, domain behavior, database, and workers as the source of truth.
3. Expose only controls backed by current persisted behavior until a justified API and migration are implemented.
4. Separate server and owner origins, OAuth callbacks, session namespaces, and authorization checks.
5. Do not add guessed guild settings, fabricated operations telemetry, or server-visible global/private safety data.
6. Do not deploy or alter production database state as part of local implementation.

## Verification commands recorded

- `git status --short --branch`
- `git branch --show-current`
- `git log --oneline -20`
- `git remote -v`
- Source/migration inventory via `rg --files` and focused `rg` searches.

