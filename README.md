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
- **Sanitization Pipeline**: Automatically strips Discord invite links, pings (`<@...>`, `<@&...>`, `<#...>`), tokens, IP grabbers, and malicious executable attachments.
- **Mutual-Consent Profile Reveal**: Fine-grained field selection (`age`, `gender`, `interests`, `destinyId`, `discordTag`). A field is **only revealed if both partners agree**.
- **Global Cross-Server Safety**: Blocking and abuse restrictions apply globally across all joined Discord servers.

### 🪙 Step 3 — Destiny Coins (DC), Progression & 9 Games
- **Atomic DC Ledger**: Bank-grade SQL row-level locks (`FOR UPDATE`) with unique idempotency keys (`reference_id`) preventing double rewards, race conditions, or negative balances. Currency is non-redeemable for real money.
- **All 9 Built-in Games**:
  1. 🪙 **Coin Flip**: Provably fair heads/tails with 2x payout.
  2. 🃏 **Blackjack**: Classic casino blackjack with dealer soft-17 rules and 3:2 natural payouts.
  3. 🎲 **Dice**: 2d6 rolls with under 7 (2.3x), exact 7 (5.8x), and over 7 (2.3x) predictions.
  4. 🎰 **Slots**: 3-reel slot machine with cherries, bells, diamonds, and a 200x Lucky 7 Jackpot.
  5. 📈 **Higher / Lower**: Streak card comparison game.
  6. 🔍 **Truth or Dare**: 120+ curated anonymous-safe questions and dares across chill, fun, deep, and spicy levels.
  7. 🤔 **Would You Rather**: Engaging dilemmas with real-time global vote percentages.
  8. 🧠 **Trivia Duel**: Timed knowledge questions awarding 25 DC on correct answers.
  9. 🪐 **Compatibility Quiz**: 5-question partner vibe assessment calculating synergy score (50%-100%) and awarding Connection XP.
- **Connection Tiers**: `Strangers` ➔ `Acquaintances` ➔ `Familiar` ➔ `Connection` ➔ `Trusted Connection` ➔ `Destiny`.
- **Daily Streak System**: 24-hour claim window with consecutive streak multipliers.

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

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20+ or v24+
- **pnpm** (recommended) or **npm**
- **Redis Server** (optional; built-in high-speed in-memory fallback enabled automatically for testing)
- **Supabase Account** (or local PostgreSQL)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
PORT=4000
```

### 3. Database Schema Setup
Execute the SQL migrations located in `supabase/migrations/` in order:
1. `001_initial_schema.sql` — Tables, indexes, and Row Level Security.
2. `002_functions_triggers.sql` — Stored procedures (`execute_coin_transaction`, `calculate_connection_tier`).
3. `003_seed_data.sql` — Default cosmetic items, badges, and titles.

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
Open **http://localhost:3000** to access the Admin Dashboard.

---

## 🤖 Discord Slash Commands

| Command | Description |
| :--- | :--- |
| `/match [gender_pref] [interests]` | Join anonymous matchmaking queue with customizable filters |
| `/leave` | Exit current room session or queue |
| `/reveal` | Request mutual profile reveal with field selection |
| `/profile [age] [gender]` | View/edit your anonymous Destiny ID and profile stats |
| `/coins` | Check Destiny Coins balance and transaction history |
| `/daily` | Claim 24h daily streak reward |
| `/games <coinflip \| blackjack \| dice \| slots \| ...>` | Play casino or social games |
| `/shop [buy]` | Browse or purchase cosmetic titles, badges, and reveal cards |
| `/report <category> <description>` | Safely report user with automated chat excerpt |
| `/block [destiny_id]` | Globally block user across all servers |
| `/settings` | Configure 7:30 PM IST daily reminders, timezone, and quiet hours |

---

## 🧪 Benchmark Results

Tested with `pnpm test:load` at 100, 1,000, 5,000, and 10,000+ concurrent user tickets:
- **Ingestion Speed**: > 250,000 tickets/sec
- **Pairing Evaluation**: 500 pairs evaluated in **< 4.0 ms**
- **Memory Footprint**: Peak RSS stayed below **97 MB** across 10,000 queued tickets.
