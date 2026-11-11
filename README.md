# 🌌 Destiny — Production-Ready Anonymous Social & Matchmaking Discord Bot

> A scalable, production-grade anonymous social connection and matchmaking Discord bot powered by **TypeScript**, **Discord.js v14**, **Supabase PostgreSQL**, **Redis**, **BullMQ**, and a **Next.js Web Admin Dashboard**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.18-5865F2.svg)](https://discord.js.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![Redis](https://img.shields.io/badge/Redis-Redlock-DC382D.svg)](https://redis.io/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)

---

## 🌟 Key Features

### 🔒 Step 1 & 2 — Privacy & Matchmaking Architecture
- **Complete Anonymity**: Discord usernames, user IDs, avatars, and server origins are completely masked. Each conversation generates a unique celestial persona (e.g. `Celestial Fox 🦊`, `Lunar Wolf 🐺`).
- **Multi-Criteria Matching Engine**: Filters by age (18+), mutual gender preferences, shared languages, and Jaccard interest overlap.
- **Race Condition Safeguards**: Distributed Redlock (`lock:reveal:${roomId}`) ensures simultaneous interactions cannot duplicate rooms or leak identities.
- **Sanitization Pipeline**: Masks Discord invites and mentions, scrubs Discord tokens, blocks known phishing/IP-logger domains, and allows only trusted Discord CDN image, video, audio, and PDF attachments up to 10 MB.
- **Mutual-Consent Profile Reveal**: Fine-grained field selection (`age`, `gender`, `interests`, `destinyId`, `discordTag`). A field is **only revealed if both partners agree**.
- **Global Cross-Server Safety**: Blocking and abuse restrictions apply globally across all joined Discord servers.

### 🪙 Step 3 — Destiny Coins (DC), Progression & Conversation Rewards
- **Atomic DC Ledger**: Bank-grade SQL row-level locks (`FOR UPDATE`) with unique idempotency keys (`reference_id`) preventing double rewards, race conditions, or negative balances. Currency is non-redeemable for real money.
- **Conversation-First Rewards**:
  1. 💬 **Icebreakers**: Curated conversation prompts delivered in DMs or to both partners in an active room.
  2. 🔥 **Daily Streaks**: 24-hour claim window with consecutive streak multipliers.
  3. 🏆 **Connection Tiers**: `Strangers` ➔ `Acquaintances` ➔ `Familiar` ➔ `Connection` ➔ `Trusted Connection` ➔ `Destiny`.
  4. 🎁 **Room Milestones**: Earn DC and Connection XP for meaningful conversations.
- **Identity Wardrobe**: Unlock and equip card themes, titles, badges, and a 5-slot insignia rack.
- **Cosmetics Shop**: Spend DC on profile themes, badges, titles, and reveal tokens.

### 📊 Step 4 — Modern Web Admin Dashboard
- **Built with Next.js 14, Tailwind CSS, and Recharts**.
- **Live System Telemetry**: CPU, Memory, Shard health, Redis, and Supabase status.
- **User Registry**: Search by Destiny ID or Discord ID, view verification badges, adjust coins, ban/unban.
- **Live Room Inspector**: View active rooms, inspect sanitized message feeds, and force-terminate malicious sessions.
- **Safety Desk**: Moderate reports with automated chat excerpts attached.
- **Gender Verification Desk**: Review submitted verification claims and award verified badges.
- **Economy Analytics**: Faucet vs Sink distribution charts, coin velocity, and cosmetics shop manager.
- **7:30 PM IST Reminders**: Configure automated daily notifications with timezone support, quiet hours, and user opt-out.
- **Admin Audit Trail**: Immutable logging of all moderator actions.

### 🌌 Step 5 — Dynamic Rotating Presence
- **Rotating Twitch Streaming activity** (`ActivityType.Streaming`) with curated Destiny messages. The default Twitch destination is a third-party channel (`ninja`); configure `DESTINY_STREAM_URL` to use another supported Twitch or YouTube channel.
- **102 curated statuses** with live `{members}` and `{servers}` counts computed in real time.
- **Uninterrupted rotation**: matchmaking queue depth and active conversations
  never override or pause the curated status rotation.
- **Shard-aware**: presence rotation runs in the bot shard process, while queue processing uses a renewable distributed Redis lock.
- **20-second rotation**, staggered per shard so gateway presence updates stay
  spread out; counts are cached for 30s so the rotation never hammers the database.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.18+ (Node 22 LTS recommended)
- **pnpm** (recommended) or **npm**
- **Redis Server** (required in production for shared queues, rate limits, and distributed locks; in-memory fallback is development/test only)
- **Supabase Account** (or local PostgreSQL)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials and generate unique secrets (never leave these blank in production):
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
PORT=4000
API_HOST=127.0.0.1
API_SECRET_KEY=<at least 32 random characters>
DESTINY_STREAM_URL=https://www.twitch.tv/ninja
DASHBOARD_ADMIN_PASSWORD=<at least 12 characters>
DASHBOARD_SESSION_SECRET=<at least 32 random characters>
NEXTAUTH_SECRET=<a separate random secret>
```

Generate secrets with `openssl rand -hex 32`. The dashboard password must be at least 12 characters. The API binds to loopback by default; Docker Compose exposes it only on the private container network.

#### Connecting Redis

Redis is required in production. Development and tests can use the in-memory fallback, but it is not safe for multi-process deployments. Three ways to point the bot at an instance, checked in this order:

| Variable | Use |
|---|---|
| `REDIS_URL` | Full URL for hosted providers, e.g. `rediss://default:<token>@my-db.upstash.io:6379`. Overrides host/port/password. |
| `REDIS_USERNAME` | Optional Redis ACL username. Also read from `REDIS_URL` when present. |
| `REDIS_TOKEN` | Access token used as the password (Upstash-style). Takes precedence over `REDIS_PASSWORD`. |
| `REDIS_PASSWORD` | Plain password, when the provider uses one. |

Also supported: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_TLS=true`,
`REDIS_KEY_PREFIX`. The same resolved connection is shared by the ioredis client and
the BullMQ queues, so both always talk to the same instance. Credentials are never
logged — the startup line only reports the target host, port and whether auth is on.
The GitHub Actions runner reads `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`,
`REDIS_PASSWORD` or `REDIS_TOKEN`, and optional `REDIS_URL`/`REDIS_TLS` from
repository Actions secrets. It verifies connectivity before starting the bot.

### 3. Database Schema Setup
Execute the SQL migrations located in `supabase/migrations/` in order:
1. `001_initial_schema.sql` — Tables, indexes, and Row Level Security.
2. `002_functions_triggers.sql` — Stored procedures (`execute_coin_transaction`, `calculate_connection_tier`).
3. `003_seed_data.sql` — Default cosmetic items, badges, and titles.
4. `004_profile_enhancements.sql` — Profile fields and preferences.
5. `005_remove_games_history.sql` — Retire legacy game-history schema.
6. `006_security_hardening.sql` — Lock down privileged stored procedures.
7. `007_atomic_wallet_and_idempotency.sql` — Strict ledger idempotency and atomic coin transfers.
8. `008_atomic_rooms_and_inventory.sql` — Atomic room lifecycle and consumable inventory quantities.
9. `009_atomic_room_xp.sql` — Atomic XP increments for concurrent chat messages.
10. `010_dashboard_aggregates.sql` — Accurate economy totals and hourly activity buckets.
11. `011_transfer_ledger_types.sql` — Separate peer transfers from shop and mission rewards.
12. `012_welcome_bonus_ledger.sql` — Record signup welcome balances atomically in the coin ledger.

### 4. Running Destiny
```bash
# Install dependencies
pnpm install
pnpm --prefix dashboard install

# Run unit & integration tests
pnpm test

# Run concurrent user load benchmarks (100 -> 10,000+ users)
pnpm test:load

# Start backend (API + Workers + Discord Bot)
pnpm start

# Start Admin Dashboard
pnpm dashboard:dev
```
Open **http://localhost:3000** to access the Admin Dashboard. For Docker, copy `.env.example` to `.env`, fill all production credentials, then run `docker compose -f docker/docker-compose.yml up --build -d`. Redis and the internal API are not published on host ports.

---

## 🤖 Discord Slash Commands

| Command | Description |
| :--- | :--- |
| `/match [gender_pref] [interests]` | Join anonymous matchmaking queue with customizable filters |
| `/leave` | Exit current room session or queue |
| `/reveal` | Request mutual profile reveal with field selection |
| `/profile [age] [gender] [bio] [interests] [languages] [looking_for]` | Auto-setup or edit your anonymous profile and render your card |
| `/coins` | Check Destiny Coins balance and transaction history |
| `/daily` | Claim 24h daily streak reward |
| `/icebreaker` | Get a curated conversation starter for your room or DMs |
| `/wardrobe` | Equip card themes and up to 5 insignia badges |
| `/shop [buy]` | Browse or purchase cosmetic titles, badges, themes, and reveal cards |
| `/report <category> <description>` | Safely report user with automated chat excerpt |
| `/block [destiny_id]` | Globally block user across all servers |
| `/settings` | Configure 7:30 PM IST daily reminders, timezone, and quiet hours |

---

## 🧪 Benchmark Results

Tested with `pnpm test:load` at 100, 1,000, 5,000, and 10,000+ concurrent user tickets:
- **Ingestion Speed**: > 250,000 tickets/sec
- **Pairing Evaluation**: 500 pairs evaluated in **< 4.0 ms**
- **Memory Footprint**: Peak RSS stayed below **97 MB** across 10,000 queued tickets.
