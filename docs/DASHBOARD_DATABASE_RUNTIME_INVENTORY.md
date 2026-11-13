# Dashboard database and runtime inventory

Reviewed: 2026-11-13 (Asia/Kolkata)

## Scope and method

This began as a metadata-only review of the active Supabase project and its previous cache/worker setup. The current runtime uses Supabase PostgreSQL directly for dashboard state, matchmaking coordination, locks, rate limits, and worker heartbeats. Migration 022 has been applied and its service-role-only grants were verified; no application rows, message content, report evidence, or secret values were displayed.

## Runtime project handoff

The ignored `.env` now targets a fresh project named `destiny project` (`biqjoimzjljnxhliybcq`). Its public schema was empty before setup; local migrations 001–020 were applied through the Supabase plugin. Verification found nine final public tables, all with RLS enabled, zero application rows, the operator RPC restricted to `service_role`, and no security advisor lints. The older `destiny bot` project referenced by the historical inventory below is separate; no application data was moved between projects.

The remote migration history initially contained `admin_control_plane_security`, `deny_public_table_access`, and `temporary_safety_bans`, matching local migrations 017–019. Migration 020 was validated on the separate isolated project and subsequently applied to production. Economy/progression tables are absent from the live public schema.

## Active public tables

All eight listed tables have RLS enabled and RLS is not forced. Each has one `FOR ALL` policy, `deny_anon_authenticated_access`, for `anon` and `authenticated`, with both `USING (false)` and `WITH CHECK (false)`. The trusted server uses the Supabase service role, which bypasses RLS; its API routes must enforce scope and least privilege. The legacy `guild_settings.allowed_roles` array has no active dashboard authorization meaning.

| Table | Columns | Primary key | Foreign key relationships |
|---|---|---|---|
| `users` | `id`, `discord_user_id`, `destiny_id`, `age`, `gender`, `gender_verified`, `gender_verification_status`, `gender_verification_evidence`, `interests`, `languages`, `preferred_gender`, `min_age_pref`, `max_age_pref`, `active_room_id`, `is_banned`, `ban_reason`, `reputation_score`, `created_at`, `updated_at`, `bio`, `match_intent`, `last_active_at`, `ban_expires_at` | `id` | Referenced by room participants, message sender, notification settings, both block endpoints, and report reporter/reported user. |
| `guild_settings` | `guild_id`, `guild_name`, `command_prefix`, `match_channel_id`, `announcements_channel_id`, `mod_log_channel_id`, `cross_server_enabled`, `min_age_limit`, `allowed_roles`, `created_at`, `updated_at` | `guild_id` | None. |
| `rooms` | `id`, `room_code`, `user1_id`, `user2_id`, `user1_pseudonym`, `user2_pseudonym`, `status`, `started_at`, `ended_at`, `end_reason`, `pinned_message_id`, `reveal_status_user1`, `reveal_status_user2`, `created_at`, `updated_at` | `id` | `user1_id`, `user2_id` → `users.id`; referenced by `messages.room_id` and `reports.room_id`. |
| `messages` | `id`, `room_id`, `sender_user_id`, `sender_pseudonym`, `sanitized_content`, `attachments_meta`, `is_pinned`, `flagged_for_moderation`, `moderation_reason`, `created_at` | `id` | `room_id` → `rooms.id`; `sender_user_id` → `users.id`. |
| `reports` | `id`, `reporter_id`, `reported_id`, `room_id`, `category`, `description`, `chat_excerpt`, `status`, `action_taken`, `moderator_notes`, `resolved_by`, `created_at`, `updated_at` | `id` | `reporter_id`, `reported_id` → `users.id`; nullable `room_id` → `rooms.id`. |
| `user_blocks` | `id`, `blocker_id`, `blocked_id`, `reason`, `created_at` | `id` | `blocker_id`, `blocked_id` → `users.id`. |
| `notification_settings` | `user_id`, `daily_reminder_enabled`, `daily_reminder_time`, `time_zone`, `quiet_hours_start`, `quiet_hours_end`, `opt_out`, `updated_at` | `user_id` | `user_id` → `users.id`. |
| `admin_audit_logs` | `id`, `admin_id`, `action`, `target_type`, `target_id`, `changes`, `ip_address`, `created_at` | `id` | None. |

The eight direct-table policies deny the browser roles but do not create guild- or operator-specific policies for the service role. Every service-role query therefore still needs server-side authorization and query scoping. `FORCE ROW LEVEL SECURITY` is off on these tables.

## Active public functions

The live project exposes six `public` functions in its catalog. All six are `SECURITY DEFINER`; catalog ACLs list `postgres` and `service_role` as executable roles, not `PUBLIC`, `anon`, or `authenticated`.

| Function | Signature | Purpose in local code/schema | Search path |
|---|---|---|---|
| `create_room_with_users` | `(p_id uuid, p_room_code varchar, p_user1_id uuid, p_user2_id uuid, p_user1_pseudonym varchar, p_user2_pseudonym varchar, p_status varchar, p_started_at timestamptz, p_reveal_status_user1 jsonb, p_reveal_status_user2 jsonb)` | Creates a room and updates participant room state atomically; called by the database layer. | `public, pg_temp` |
| `end_room` | `(p_room_id uuid, p_end_reason varchar)` | Performs the shared room-ending domain operation. | `public, pg_temp` |
| `end_room_if_inactive` | `(p_room_id uuid, p_cutoff timestamptz)` | Closes a room only when it remains active and old enough; used by cleanup. | `public, pg_temp` |
| `get_hourly_activity` | `(p_hours integer)` | Returns bounded hourly activity aggregates; no dashboard route currently calls it. | `public, pg_temp` |
| `resolve_report_atomic` | `(p_report_id uuid, p_action varchar, p_notes text, p_admin_id varchar)` | Locks and resolves a pending report and applies the selected supported restriction atomically; called by existing report services. | `public, pg_temp` |
| `rls_auto_enable` | `()` | Platform helper function remains in the catalog. No non-internal public-table triggers are present, so this review found no attached runtime trigger. | `pg_catalog` |

Migration 020 created `set_platform_operator_capability` and `platform_operator_grants` in production. A verification query confirmed the table and function exist, RLS is enabled, `anon` and `authenticated` cannot execute the function, and `service_role` can. Supabase security advisors returned no lints after the change. Delegated operators can be enabled after the dashboard deployment and root-owner configuration are ready.

## Runtime and worker diagnostics

| Runtime surface | Source and freshness | Dashboard behavior | Observed limits |
|---|---|---|---|
| Discord shard guild snapshot | Each ready shard publishes immediately, on guild join/leave, and every 60 seconds to `bot:guilds:<shard>` with a 180-second TTL; shard IDs are tracked in `bot:guild-shards`. | Owner overview reports connected guild inventory and per-shard snapshot status. | The snapshot contains cached guild/channel names, member counts, and bot permission bitfields. The overview marks missing snapshots stale but does not prune stale set members. `/owner status` removes index members when their snapshots are missing. |
| Worker heartbeat | Heartbeat payload is refreshed every 30 seconds with a 90-second TTL; IDs are also stored in `worker:instances`. Background process reports role `workers`; shard matchmaking workers report `matchmaking`. | Owner overview reports heartbeat age/status and a count of extant heartbeat payloads. | Abrupt shutdown can leave set members after the TTL key disappears. The HTTP overview reports stale entries without pruning them; `/owner status` prunes missing heartbeat members. |
| Background jobs | Matchmaking and reminders run through existing polling/scheduler loops. There were no active BullMQ producers, so queue consumers and queue counts have been removed. | Keep the current worker health separate from future job-queue needs. | No durable job queue, retry UI, stalled-job controls, or per-job diagnostics are implemented. Supabase Queues can be added later if producers require it. |
| Worker lifecycle | Background worker starts notification and cleanup loops; matchmaking runs with the Discord client. Production startup requires Supabase connectivity. | Dashboard `/health` is a liveness response; the owner overview checks database and runtime-state health separately. | No queue-specific metrics are exposed. |

The most useful follow-up is to label or omit queue counters for queues without a producer/consumer and to align stale-index cleanup behavior between `/owner status` and the HTTP overview. Do not turn diagnostic reads into broader job inspection or expose job payloads without a privacy and authorization review.

## Dashboard data boundaries

- Owner health reads counts and cached guild metadata; it does not read message or report contents.
- Report queue rows are metadata-only; case evidence is fetched only for a selected case and requires `safety.reports.review` or root ownership.
- Verification evidence is case-scoped and requires `safety.verification.review` or root ownership.
- User lookup is exact-match and audit-on-access; it omits unrelated profile and conversation data.
- Active room inventory returns pseudonyms and timing only, with audit-on-read; there is no message browser or room-termination route.
- The trusted service-role secret must remain server-side; client authorization must not rely on RLS as a substitute for the route guards.
