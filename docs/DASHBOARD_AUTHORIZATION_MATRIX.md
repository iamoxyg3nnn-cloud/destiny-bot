# Dashboard authorization matrix

Updated: 2026-11-13 (Asia/Kolkata)

This matrix records current route access and capability boundaries. All API routes share the authentication/session guard in `src/dashboard/server.ts`; app-specific rows additionally apply the guards below.

## Current server dashboard routes

| Route | Current access check | Operation | Additional controls |
|---|---|---|---|
| `GET /api/session` | Valid server-dashboard session | Read own session identity and CSRF token | Does not return Discord tokens |
| `GET /api/guilds` | Fresh Discord OAuth guild list; only owner, Administrator, or Manage Server guilds returned | List manageable guilds | Bot connection status comes from Supabase-backed shard snapshots |
| `GET /api/guilds/:guildId` | Fresh Discord guild membership and manager permission; Destiny bot must be in guild | Read supported settings and current bot channel permissions | Guild ID must be a 17–20 digit Discord snowflake |
| `GET /api/guilds/:guildId/audit` | Same current guild authorization | Read guild-scoped audit history | Bounded pagination; stored IP omitted; sensitive change keys redacted |
| `GET /api/guilds/:guildId/export` | Same current guild authorization; bot snapshot must be fresh and guild connected | Export supported configuration | Export event must persist before response; no import endpoint |
| `POST /api/guilds/:guildId/audit/:auditId/rollback` | Same fresh guild authorization plus session CSRF | Restore one prior dashboard setting event | Only known dashboard setting actions; target must match guild; current value must still match event `next`; previous channel must still be accessible; optimistic concurrency; rollback event audit follows save |
| `PUT /api/guilds/:guildId/settings` | Fresh guild authorization | Change one supported setting | Exact Origin + session CSRF; live bot channel permission check; `updated_at` compare-and-set; audit failure returned as warning |
| `POST /auth/logout` | Valid server-dashboard session | Revoke OAuth token and session | Exact Origin + session CSRF |

Current guild access is read from Discord on every API request. The dashboard does not currently have a Destiny role assignment model, read-only manager, or per-setting manager capability.

Rollback is intentionally narrow: it supports portal channel, private moderation log channel, and cross-server participation dashboard events. It rejects stale values, removed/inaccessible channels, bot setup events, and unrelated audit events. Settings persistence and its audit write are not transactional; an audit failure is reported after the restored setting has already been saved.

## Current platform owner routes

| Route | Current access check | Operation | Audit/privacy behavior |
|---|---|---|---|
| `GET /api/owner/overview` | Root owner or `platform.health.read` | Read live service, worker, shard, queue, server/user/room counts | Capability re-read on every request; missing sources remain unavailable |
| `GET /api/owner/servers` | Root owner or `platform.servers.read` | Search/list bot-connected guild snapshots | Capability re-read on every request; does not expose user records |
| `GET /api/owner/servers/:guildId` | Root owner or `platform.servers.read` | Read connected server configuration and bot channel access | Requires current bot snapshot; no mutation |
| `GET /api/owner/audit` | Root owner or `platform.audit.read` | Read platform audit pages | IP omitted; sensitive fields redacted |
| `GET /api/owner/reports` | Root owner or `safety.reports.review`, plus configured database | Read report queue metadata | Evidence stays out of list rows |
| `GET /api/owner/reports/:reportId` | Root owner or `safety.reports.review`, plus configured database | Read one safety case | Case evidence is returned only for the selected report |
| `POST /api/owner/reports/:reportId` | Root owner or `safety.reports.review` | Resolve one pending case | Session CSRF; rationale required; existing atomic resolver; audit write follows resolution |
| `GET /api/owner/verification` | Root owner or `safety.verification.review`, plus configured database | Read pending verification metadata | Evidence stays out of list rows |
| `GET /api/owner/verification/:userId` | Root owner or `safety.verification.review`, plus configured database | Read one pending request | Case-scoped evidence; Discord ID omitted |
| `POST /api/owner/verification/:userId` | Root owner or `safety.verification.review` | Approve or reject one request | Session CSRF; rationale required; existing review service |
| `POST /api/owner/users/search` | Root owner or `users.status.lookup`, plus configured database | Exact Destiny ID/Discord ID lookup | Session CSRF; audit before response; minimal fields |
| `GET /api/owner/rooms` | Root owner or `conversations.metadata.read`, plus configured database | Read active conversation metadata | Audit before response; pseudonyms/timing only; no messages or terminate action |
| `GET /api/owner/operators` | `BOT_OWNER_IDS` only | List active delegated capabilities | Root-only; no operator can manage grants |
| `POST /api/owner/operators` | `BOT_OWNER_IDS` only | Grant one named capability | Session CSRF; root targets rejected; grant and audit are transactional |
| `POST /api/owner/operators/:discordUserId/revoke` | `BOT_OWNER_IDS` only | Revoke one named capability | Session CSRF; root targets rejected; revocation takes effect on the next request |
| `POST /auth/logout` | Valid owner-dashboard session | Revoke OAuth token and session | Exact Origin + session CSRF |

`BOT_OWNER_IDS` remains the non-editable bootstrap root set. Delegated operators receive only explicit named capabilities stored in `platform_operator_grants`; the database is re-read on every request, so OAuth session claims cannot preserve revoked access. Operator grant/revoke is root-only and is committed with its audit record in one database transaction. The capability table and RPC are defined in `supabase/migrations/020_platform_operator_grants.sql`; that migration was applied and transaction-tested only on the isolated Supabase validation project, not the active production project. Deployments without migration 020 fail closed for delegated access and return an unavailable response for grant administration.

## Active delegated global capabilities

| Capability | Candidate routes | Proposed limits |
|---|---|---|
| `platform.health.read` | `/api/owner/overview` | Operational telemetry only |
| `platform.servers.read` | `/api/owner/servers`, `/api/owner/servers/:guildId` | Read snapshots/config; no install, removal, restriction, or settings mutation |
| `platform.audit.read` | `/api/owner/audit` | Paged, sanitized audit output |
| `safety.reports.review` | Report queue/detail/resolve | Case-scoped evidence, required rationale, explicit action allowlist |
| `safety.verification.review` | Verification queue/detail/review | Case-scoped evidence, required rationale |
| `users.status.lookup` | Exact-match user search | Audit-on-read, minimal fields, no mutation |
| `conversations.metadata.read` | `/api/owner/rooms` | Audit-on-read, pseudonyms/timing, no contents or termination |

Operator administration, global configuration, bans outside a report case, emergency actions, and direct room termination stay root-only or unavailable until each receives its own threat model and domain operation. Grants must be checked from trusted storage on each request, outside OAuth session claims, and cannot modify `BOT_OWNER_IDS` roots.

## Guild role membership source

Discord provides an official current-user guild member endpoint, `GET /users/@me/guilds/{guild.id}/member`, under the `guilds.members.read` OAuth2 scope. The returned Guild Member object includes the current member's role IDs. The current dashboard requests `identify guilds` only, so this capability is not used yet. Before using it, add the scope with a clear consent reason, validate that the returned guild ID is the selected guild, fail closed on missing/revoked membership, and call the endpoint on each sensitive request rather than caching authorization.

Sources:

- [Discord OAuth2 scopes](https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes)
- [Discord User Resource: Current User Guild Member](https://docs.discord.com/developers/resources/user#current-user-guild-member)
- [Discord Guild Resource: Guild Member object](https://docs.discord.com/developers/resources/guild#guild-member-object)

The bot token can independently retrieve a member by ID from the guild API, but using that route as the delegated user's authorization source must be validated against the app's enabled intents, REST availability, and current failure behavior. The user OAuth endpoint is currently the clearest documented per-user source; it adds one explicit user-granted scope and must not be silently bundled into login.

## Implementation gates and status

1. Done: explicit route-to-capability checks use default deny and have positive/negative HTTP coverage.
2. Done: operator grants stay out of OAuth session data; grants are re-read on each request.
3. Done: grant/revoke and audit share one database transaction; disposable-project validation confirmed audit failure rolls back the grant.
4. Done: `BOT_OWNER_IDS` roots remain separate and cannot be changed through the operator API.
5. For guild role access, store guild-scoped role IDs and named capabilities; never overload `guild_settings.allowed_roles` without proven compatibility.
6. Revalidate selected role membership on every request; reject unknown roles, role deletion, member removal, and scope/API failures as unauthorized.
7. Done for migration 020: remote migration history was reconciled and schema/RLS/transaction behavior was validated on isolated project `destiny-dashboard-validation`. Production application remains a deployment step after review.
