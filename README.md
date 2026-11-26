# 🌌 Destiny — Anonymous Chat & Matchmaking Discord Bot

> A scalable anonymous social connection and matchmaking Discord bot powered by **TypeScript**, **Discord.js v14**, and **Supabase PostgreSQL**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.18-5865F2.svg)](https://discord.js.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)

---

## 🌟 Key Features

### 🔒 Step 1 & 2 — Privacy & Matchmaking Architecture
- **Complete Anonymity**: Discord usernames, user IDs, avatars, and server origins are completely masked. Each conversation generates a unique celestial persona (e.g. `Celestial Fox 🦊`, `Lunar Wolf 🐺`).
- **Multi-Criteria Matching Engine**: Enforces adult age ranges, shared-language compatibility, and mutual global block lists; shared interests rank compatible candidates. Legacy preferred-gender fields are retained for profile compatibility but are not currently used as match filters.
- **Race Condition Safeguards**: Atomic Supabase-backed distributed locks ensure simultaneous interactions cannot duplicate rooms or leak identities.
- **Sanitization Pipeline**: Masks Discord invites and mentions, scrubs Discord tokens, blocks known phishing/IP-logger domains, and allows only trusted Discord CDN image, video, audio, and PDF attachments up to 10 MB.
- **Mutual-Consent Profile Reveal**: Fine-grained field selection (`age`, `gender`, `interests`, `destinyId`, `discordTag`). A field is **only revealed if both partners agree**.
- **Global Cross-Server Safety**: Blocking and abuse restrictions apply globally across all joined Discord servers.

### 💬 Step 3 — Anonymous Conversation Experience
- **Private 1-on-1 Chat**: Messages are relayed through the bot's DMs using per-room pseudonyms.
- **Session Controls**: Either participant can leave at any time; the partner is notified without exposing Discord identities.
- **Safety Controls**: Global blocking, abuse reports, moderation restrictions and mutual-consent profile reveal.

### 🌌 Step 4 — Dynamic Rotating Presence
- **Rotating Twitch Streaming activity** (`ActivityType.Streaming`) with curated Destiny messages. The default Twitch destination is a third-party channel (`ninja`); configure `DESTINY_STREAM_URL` to use another supported Twitch or YouTube channel.
- **102 curated statuses** with live `{members}` and `{servers}` counts computed in real time.
- **Uninterrupted rotation**: matchmaking queue depth and active conversations
  never override or pause the curated status rotation.
- **Shard-aware**: presence rotation runs in the bot shard process, while queue processing uses a renewable Supabase-backed lock.
- **20-second rotation**, staggered per shard so gateway presence updates stay
  spread out; counts are cached for 30s so the rotation never hammers the database.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.18+ (Node 22 LTS recommended)
- **pnpm** (recommended) or **npm**
- **Supabase project** with the application migrations applied.

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials and generate unique secrets (never leave these blank in production):
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
BOT_OWNER_IDS=123456789012345678,234567890123456789
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret
DESTINY_STREAM_URL=https://www.twitch.tv/ninja
```

`BOT_OWNER_IDS` is a comma-separated allowlist of Discord IDs with global bot-owner authority; it supports multiple owners. See [Administration setup](docs/ADMINISTRATION.md) for bot-owner, server-admin and moderator boundaries.

The application stores durable profiles, rooms, messages, queue state, runtime locks,
rate limits and worker heartbeats in Supabase PostgreSQL. Profile
card image caching remains process-local and expires after 15 minutes.

### 3. Database Schema Setup
Execute the SQL migrations located in `supabase/migrations/` in order. Migrations `001`–`015` contain the original economy and progression schema for historical compatibility; migration `016` permanently removes those tables, records, columns, functions and triggers. The active application is anonymous chat and matchmaking only:
1. `001_initial_schema.sql` — Tables, indexes, and Row Level Security.
2. `002_functions_triggers.sql` — Core stored procedures and legacy schema helpers.
3. `003_seed_data.sql` — Initial reference data.
4. `004_profile_enhancements.sql` — Profile fields and preferences.
5. `005_remove_games_history.sql` — Retire legacy game-history schema.
6. `006_security_hardening.sql` — Lock down privileged stored procedures.
7. `007_atomic_wallet_and_idempotency.sql` — Legacy economy schema (unused by the chat application).
8. `008_atomic_rooms_and_inventory.sql` — Atomic room lifecycle and consumable inventory quantities.
9. `009_atomic_room_xp.sql` — Legacy progression schema (unused by the chat application).
10. `010_dashboard_aggregates.sql` — Legacy aggregate and activity schema retained in migration history.
11. `011_transfer_ledger_types.sql` — Legacy ledger types.
12. `012_welcome_bonus_ledger.sql` — Legacy welcome-bonus ledger.
13. `013_atomic_daily_claim.sql` — Legacy daily-claim procedure.
14. `014_atomic_report_resolution.sql` — Resolve moderation reports and apply permanent bans in one transaction.
15. `015_conditional_room_inactivity.sql` — Close rooms only when they remain inactive at the transactionally rechecked cutoff.
16. `016_remove_economy_and_progression.sql` — Drop all legacy economy/progression data and schema while preserving user profiles, rooms, chat, safety and moderation data.
17. `017_admin_control_plane_security.sql` — Restrict the internal RLS event-trigger helper and add missing moderation foreign-key indexes.
18. `018_deny_public_table_access.sql` — Explicitly deny direct `anon` and `authenticated` access to backend-only application tables.
19. `019_temporary_safety_bans.sql` — Add 24-hour report suspensions while preserving permanent bans.

20. `020_platform_operator_capabilities.sql` — Platform-operator grants from the retired web dashboard; retained in migration history.
21. `021_dashboard_runtime_state.sql` — Runtime state from the retired web dashboard; retained in migration history.
22. `022_runtime_state_and_limits.sql` — Store bot runtime state, distributed locks, and atomic rate-limit events.

**Deployment note:** Fresh databases must apply all migrations `001`–`022` in order. Existing deployments use `scripts/apply-migrations.sh`, which tracks completed files in the private `destiny_internal.schema_migrations` schema and skips them on subsequent restarts. Do not run `supabase db push` until the separate Supabase CLI migration history is reconciled.

### 4. Running Destiny
```bash
# Install dependencies
pnpm install

# Run unit & integration tests
pnpm test

# Run concurrent user load benchmarks (100 -> 10,000+ users)
pnpm test:load

# Start workers and Discord bot
pnpm start
```
For Docker, copy `.env.example` to `.env`, fill the bot and database credentials, then run `docker compose -f docker/docker-compose.yml up --build -d`.

---

## 🤖 Discord Slash Commands

| Command | Description |
| :--- | :--- |
| `/match [gender_pref] [interests]` | Join anonymous matchmaking queue with customizable filters |
| `/leave` | Exit current room session or queue |
| `/reveal` | Request mutual profile reveal with field selection |
| `/profile [age] [gender] [bio] [interests] [languages] [looking_for]` | Auto-setup or edit your anonymous profile and render your card |
| `/report <category> <description>` | Safely report user with automated chat excerpt |
| `/block [destiny_id]` | Globally block user across all servers |
| `/settings` | Configure timezone and privacy controls |
| `/setup portal`, `/setup cross_server`, `/setup view` | Configure only the current Discord server (Manage Server or Administrator) |
| `/setup modlog` | Configure the private moderation alert channel in a trusted staff guild |
| `/owner status` | Global bot, database and worker diagnostics for IDs in `BOT_OWNER_IDS` only |

---

## 🧪 Benchmark Results

Tested with `pnpm test:load` at 100, 1,000, 5,000, and 10,000+ concurrent user tickets:
- **Ingestion Speed**: > 250,000 tickets/sec
- **Pairing Evaluation**: 500 pairs evaluated in **< 4.0 ms**
- **Memory Footprint**: Peak RSS stayed below **97 MB** across 10,000 queued tickets.
