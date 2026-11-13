# Dashboard and data recovery plan

## Current state

The production dashboard runs on Cloudflare Workers with OAuth state and encrypted sessions stored in Supabase. Migrations 020–022 are applied to the active project. Recovery should preserve the Supabase migration order and existing chat/session/report data. Bot runtime state, locks, rate limits, and worker heartbeats also live in Supabase PostgreSQL.

## Before introducing dashboard migrations

- Capture and verify a restorable Supabase backup in a disposable environment.
- Record the current internal migration ledger and Supabase migration history; do not rewrite either history. The active project history was inspected through the Supabase plugin and migrations 017–019 matched local history.
- Add only additive/backward-compatible schema changes. Do not touch rooms, messages, users, reports, or anonymous matchmaking data for dashboard setup.
- Test migration apply and rollback/recovery behavior against a disposable database snapshot. Migration 020's grant/revoke and transactional audit rollback behavior was checked on the isolated validation project; this does not replace a production backup/restore rehearsal.

## Service rollback

- Deploy dashboard services independently from the bot and workers.
- Keep a known-good dashboard build and environment configuration for each host.
- On dashboard failure, route the dashboard host back to the previous build or maintenance page while leaving the bot and worker service online.
- Revoke dashboard sessions/secrets if exposure is suspected; rotate credentials only through the approved secret-management process.

## Data restoration

- Restore only into a verified environment and validate migration/schema compatibility before replacing production state.
- Verify room, report, and user records after restoration; confirm matchmaking and worker recovery without exposing conversation contents.
- A backup job is not considered verified until a restore test succeeds.

## Current verification gap

No backup restore was performed in this dashboard task, because no disposable database snapshot or dashboard data schema is configured. Production recovery remains an external prerequisite.

