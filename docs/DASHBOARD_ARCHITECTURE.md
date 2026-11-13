# Dashboard architecture

## Current baseline

The dashboard control plane runs as a Cloudflare Worker with static accessible frontends, Discord OAuth authorization code with PKCE, encrypted Supabase-backed sessions, and existing database/domain methods. The bot, dashboard, and worker runtime coordination use Supabase PostgreSQL directly.

## Target deployment boundaries

```text
admin.chuglii.in  -> server-dashboard application -> authenticated Destiny API
owner.chuglii.in  -> owner-dashboard application  -> owner-only Destiny API
                                                  -> shared domain services
                                                  -> Supabase / Discord
```

- Separate application entry points and host allowlists.
- Separate OAuth callbacks, session cookie names/secrets, route guards, and navigation.
- Server dashboard endpoints derive the Discord identity and guild membership server-side, then scope every query/mutation to the authorized guild.
- Owner endpoints independently check `BOT_OWNER_IDS` or the delegated operator's named capability. Guild Administrator never implies platform ownership. Grants are loaded from trusted storage on each request; they are never copied into OAuth session claims.
- Shared domain services remain the only configuration source of truth. Existing bot commands and new API routes must call the same operations.
- Browser code never receives the service-role key or Discord bot token. Direct browser Supabase access stays denied by migration 018.

## First supported scope

Current persisted guild settings are portal channel, moderation log channel, and cross-server participation. The server dashboard exposes these through server-side OAuth/guild checks and live Discord bot permission checks. Onboarding is derived from those actual values and Discord state. No manager roles, extra safety controls, analytics, operator permissions, or global mutation controls exist yet.

## Data and consistency

- `guild_settings` remains authoritative for current settings.
- Current bot cache TTL is five seconds; dashboard/API mutations must either invalidate the shared cache or report only database persistence until effective bot state is confirmed.
- Existing guild audit is not a complete version history. Dashboard changes write an event; safe pagination is implemented, and rollback is limited to the three supported dashboard setting actions. Atomic setting+audit versioning still needs a schema/API design.
- Mutations need optimistic concurrency, authorization revalidation, validated channel ownership/permissions, and an audit result.
- Runtime state, coordination locks, rate limits, and worker heartbeats use service-role-only Supabase tables and functions.

## Application layout (proposed)

Keep the existing bot package root. Add independent `apps/server-dashboard` and `apps/owner-dashboard` packages and a small shared UI/API contract package only if the implementation demonstrates useful reuse. Avoid moving current bot files into a workspace solely for naming consistency.

## Open architecture decisions

- Select an HTTP framework/session store that is compatible with current deployment and OAuth callback hosting.
- Decide whether one private API service serves both hosts or each application has private route handlers over shared services. The auth and domain boundaries must remain explicit either way.
- Provision the Discord OAuth app secret, registered callback URLs, distinct session secrets, and production origins.
- Define owner operator permissions only after enumerating actual operations and audit requirements.
- Keep `BOT_OWNER_IDS` as immutable bootstrap roots and make database-backed grants capability-specific, checked per request, and transactionally coupled to their audit record. Migration 020 implements this for global platform operators. The existing `guild_settings.allowed_roles` field is not used by current source and is not an approved permission model.
- Discord documents `GET /users/@me/guilds/{guild.id}/member` with the additional `guilds.members.read` scope as a source for the current user's role IDs. It is not enabled yet. Add explicit consent, validate the selected guild, and re-read for each sensitive request before enabling role assignments; the detailed route and capability map is in `DASHBOARD_AUTHORIZATION_MATRIX.md`.

