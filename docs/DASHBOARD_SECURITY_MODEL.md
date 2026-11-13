# Dashboard security model

## Trust boundaries

1. Public browser and client-submitted values are untrusted.
2. Discord OAuth identity is accepted only after server-side code/state validation and a successful Discord API exchange.
3. Guild privileges are refreshed from Discord for the selected guild and checked again on sensitive mutations.
4. Platform-owner access is independent: configured `BOT_OWNER_IDS` bootstrap roots and later explicit delegated assignments only.
5. Supabase service-role and Discord bot credentials remain confined to trusted server processes.
6. Existing Supabase migration 018 denies `anon` and `authenticated` direct access to backend tables; dashboard data must pass through authorized API/domain operations.

## Server authorization

- Resolve identity from the server session, never from a request-supplied user ID.
- Verify the guild is currently accessible to the user, the bot remains installed, and required bot channel permissions are present.
- Authorize only the requested guild and revalidate owner/Administrator/Manage Server or a deliberately implemented Destiny manager assignment.
- Check resource guild ownership on read and write; do not accept an arbitrary guild ID as sufficient authority.
- Do not initially expose custom Destiny manager roles because no assignment model exists yet.
- Keep private moderation log channel separate from public matchmaking portal channel.

## Owner authorization

- Authenticate Discord OAuth separately and use a distinct host-only secure session cookie.
- Check `BOT_OWNER_IDS` server-side; a future operator record must carry explicit scoped permissions and revocation state.
- Do not bootstrap owners through guild permission bits or browser settings.
- Log successful and failed owner access attempts, operator changes, and privileged operations.
- Protect root bootstrap configuration and last-root recovery.
- Current owner APIs recheck the bootstrap allowlist per request. Server inventory details, audit history, reports, and verification are root-owner-only; delegated operators are not implemented.

### Delegated operator contract (not yet implemented)

- `BOT_OWNER_IDS` remains the sole root bootstrap source. A database assignment must never create, replace, or demote a root owner.
- An operator grant must enumerate specific capabilities (for example, report review, verification review, user status lookup, room metadata view, or audit read). It must not imply all owner routes.
- Check the assignment from trusted storage on every protected request; do not copy grants into OAuth session data or trust Discord guild roles for global privileges.
- Grant/revoke and audit outcome must be one transaction. If the audit cannot be committed, the privilege change must roll back. Sensitive read routes must remain fail-closed when access logging fails.
- Revocation must take effect on the next request. Prevent self-grant, self-escalation, and changes by delegated operators unless a separately specified capability permits them. Root owner configuration changes remain outside the operator API.
- Each route must explicitly map to a capability. Unknown routes and unknown capabilities deny access. A permission matrix and negative tests are prerequisites to a migration.

### Guild manager contract (not yet implemented)

- `guild_settings.allowed_roles` exists in the legacy table but has no active dashboard semantics in the inspected source. Do not treat it as manager assignment storage without a separate compatibility review.
- Current server access is based on the fresh Discord guild list and actual `owner`, `Administrator`, or `Manage Server` permissions. Custom Destiny roles require a clear product-owned assignment UI/API and a fresh role-membership check on each request.
- Discord's OAuth guild list does not provide the user's guild role IDs. The official `GET /users/@me/guilds/{guild.id}/member` endpoint under `guilds.members.read` returns the user's guild member object with role IDs. This is not currently requested; use only after adding explicit consent copy, selected-guild validation, and per-request fail-closed checks. Cached roles cannot authorize sensitive mutations. See [DASHBOARD_AUTHORIZATION_MATRIX.md](DASHBOARD_AUTHORIZATION_MATRIX.md).
- Keep guild capabilities separate from global capabilities. A guild manager grant can never confer platform-owner access.
- Configuration exports include only current supported guild settings, require current guild membership and bot presence, and fail closed if the export access audit cannot be persisted. They provide no import or restore operation.

## Privacy constraints

- Guild administrators cannot identify anonymous participants, access global user profiles or blocks, inspect report content, or read other servers' records.
- Reports and message excerpts are private safety data. The report queue lists metadata only; opening a case reveals the pseudonymized excerpt, and resolution uses the existing atomic report resolver with a rationale and audit event.
- Verification evidence is withheld from queue rows and revealed only in an individually opened case to a root owner or operator with `safety.verification.review`. The UI does not expose Discord account IDs.
- Global user search requires an exact Destiny ID or Discord ID and records an audit event before returning status. Discord IDs are returned only when the operator searched by Discord ID; profile content and restriction mutations are not exposed.
- Active-room inventory returns pseudonyms, room codes, and timing only, and logs each read. There is no conversation content endpoint or room-termination control.
- Audit views omit stored IP metadata and redact note/evidence/content-like fields from change JSON. Report/verification evidence is not included in the audit view.
- Do not implement unrestricted conversation browsing or message search.
- Return “unavailable” for missing telemetry rather than zeros or mock data.

## Session and request controls implemented

- Discord authorization-code OAuth uses state and PKCE. The server app requests `identify guilds`; the owner app requests `identify` only.
- Server and owner cookies use different names, runtime-state namespaces, and independently configured HMAC session-key secrets. Production cookies use `__Host-`, `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`.
- Session IDs are random opaque values; only an HMAC digest is used in Supabase keys. OAuth access/refresh tokens are encrypted and stored server-side, refreshed as needed, and the refresh token is revoked on logout.
- Mutations require exact configured Origin and a session-bound CSRF token. The server rejects unexpected Host values and returns restrictive CSP/frame/referrer headers.
- Sensitive channel writes verify current bot guild roles and channel overwrites directly through Discord REST, rather than relying on the cached guild snapshot.

## Additional controls required before production

- HTTPS, secure HTTP-only host-only cookies, SameSite policy, CSRF defense, OAuth state/PKCE as supported, short-lived sessions, revocation, expiration, and separate owner/server namespaces.
- Rate limits on OAuth and sensitive operations; schema validation; correlation IDs; generic auth errors; safe logs that exclude secrets and conversation content.
- Revalidate high-impact permissions on mutations and handle member removal, role revocation, bot removal, owner/operator revocation, and expired sessions.
- Record actor, scope, operation, target, time, outcome, and correlation ID for sensitive changes.

## Current gaps

Delegated global capabilities are implemented with root-only management and immediate per-request revocation. Migrations 020–022 are applied to the active Supabase project. Guild role managers, a standalone global ban/unban API, and room termination remain unavailable. Setting persistence and audit insertion are not transactional; dashboard rollback is limited to supported setting events and reports when audit persistence fails after the setting is saved. The configuration update invalidates only the local database cache; the five-second TTL remains the cross-process propagation bound, with no outbox or verified sync signal. Production OAuth callback configuration and live Discord role/channel response handling still need deployment-environment verification. HTTP tests cover host isolation, unauthenticated denial, current guild-membership revocation, cross-guild denial, root-owner allowlisting, owner/server cookie separation, delegated capability grants, scoped access, and immediate revocation.

## Database/RLS review for dashboard work

- Migrations 017–019 harden the existing control plane and temporary safety bans. Migration 018 enables RLS and denies direct `anon`/`authenticated` access on the listed user, room, message, report, block, guild settings, notification, and audit tables.
- The dashboard uses the trusted service-role Supabase client, so these policies block direct browser access but do not provide per-guild or per-operator scoping for dashboard queries. Route authorization and query predicates remain mandatory; the service-role key must stay server-side.
- Migration 020 adds `platform_operator_grants` with RLS enabled, denies direct `anon`/`authenticated` access, grants service-role read access, and exposes a `SECURITY DEFINER` grant/revoke RPC that atomically writes the audit event. The RPC validates user IDs and named capabilities and has a fixed `search_path`; execution is revoked from `PUBLIC`, `anon`, and `authenticated` and granted to `service_role`.
- Remote migration history was compared with the repository. Migration 020 was applied and exercised on the isolated `destiny-dashboard-validation` project, including grant, revoke, idempotency, and a simulated audit insert failure proving rollback. The active `destiny bot` project was not modified; its migration 020 remains a deployment prerequisite for delegated operators.

