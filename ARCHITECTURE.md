# Destiny Bot — System Architecture & Design Document

## 1. High-Level System Architecture

Destiny is a focused, distributed anonymous-chat system for matchmaking compatible users, relaying private conversations and enforcing safety across Discord servers.

```
                           +---------------------------+
                           |   Discord API Gateway     |
                           +-------------+-------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
         +-------------v-------------+       +-------------v-------------+
         |    Discord Shard #0       |  ...  |    Discord Shard #N       |
         |  (Events, Relays, DMs)    |       |  (Events, Relays, DMs)    |
         +-------------+-------------+       +-------------+-------------+
                       |                                   |
                       +-----------------+-----------------+
                                         |
      +----------------------------------+----------------------------------+
      |                                  |                                  |
+-----v---------------+        +---------v-----------+            +---------v-----------+
| Matchmaking Worker  |        | Notification Worker |            | Moderation & Desk   |
| (Multi-criteria,    |        | (7:30 PM IST Cron,  |            | (Triage, Verification, |
|  Queue Pairing)     |        |  Quiet Hours)       |            |  Global Blocks)     |
+---------+-----------+        +---------+-----------+            +---------+-----------+
          |                              |                                  |
          +------------------------------+----------------------------------+
                                         |
+----------------------------------+                   +-----------------------------------+
|    Redis Coordination & Cache    |                   |    Supabase PostgreSQL (Permanent)|
| • Redlock (Reveal, Match)        |                   | • Users & Profiles (Destiny ID)   |
| • Sliding-Window Rate Limiting   |                   | • Rooms & Message Audit Trails    |
| • Active Room State & Pub/Sub    |                   | • Reports, Blocks & Verifications |
| • BullMQ Durable Job Queues      |                   | • Audit & Server Settings         |
+----------------------------------+                   +-----------------------------------+
```

---

## 2. Core Subsystems

### A. Anonymity & Persona Generation
- Users are assigned unique Destiny IDs (e.g., `DESTINY-849201`).
- Inside active rooms, users are masked by randomized yet deterministic celestial personas (e.g. `Celestial Fox 🦊`, `Lunar Wolf 🐺`).
- Discord usernames, user snowflakes, avatars, and server memberships are **never** transmitted to partners.

### B. Message Relay & Sanitization Pipeline
- Direct DM messages pass through a multi-stage sanitizer:
  1. `INVITE_REGEX`: Discord invite links stripped (`discord.gg/*`).
  2. `USER_MENTION_REGEX`: User tags `<@...>` masked to `@User`.
  3. `ROLE_MENTION_REGEX`: Role tags `<@&...>` masked to `@Role`.
  4. `CHANNEL_MENTION_REGEX`: Channel tags `<#...>` masked to `#channel`.
  5. `DISCORD_TOKEN_REGEX`: Scrubbed to prevent credential leaks.
  6. `ATTACHMENT_FILTER`: Strips `.exe`, `.bat`, `.cmd`, `.scr`, `.vbs`, `.js`.
- If a partner has Discord DMs closed, the bot notifies the sender immediately and logs the status without crashing.

### C. Mutual-Consent Profile Reveal (Redlock Guarded)
- Reveal requires mutual explicit consent.
- Users choose specific fields to share: `age`, `gender`, `interests`, `destinyId`, `discordTag`.
- **Field Intersection Guarantee**: A field is only revealed if BOTH users independently select it.
- Guarded by distributed lock `lock:reveal:${roomId}` to prevent concurrent race conditions.

### D. Anonymous Session Lifecycle
- Matchmaking reserves two compatible users and creates one active room.
- Messages are sanitized, relayed between DMs and persisted with pseudonymous sender labels.
- Either participant can end the session; inactivity cleanup and moderation can also terminate rooms.

### E. Scheduled 7:30 PM IST Daily Reminders
- Daily social matchmaking event scheduled at 7:30 PM IST (19:30 Asia/Kolkata).
- Honors user timezone overrides, quiet hours, and opt-out preferences.
