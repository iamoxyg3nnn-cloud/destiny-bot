# Destiny Bot — Existing GitHub Project Research & Architecture Integration

## 1. Executive Summary

Before building the production **Destiny** bot, four reference repositories were inspected to evaluate reusable functionality, code quality, security posture, dependencies, and licensing:

1. **`D3rise/anonymous-chats-discord`** (Apache-2.0)
2. **`DMONINK/Spark-Discord-Bot`** (No explicit license / All Rights Reserved)
3. **`Finite-Loop-Club-NMAMIT/stealth-bot`** (Apache-2.0)
4. **`warrensteph/discord-economy-bot`** (Repository unavailable / not found on GitHub)

In compliance with open-source licensing rules, **zero proprietary code was blindly copied**. Where permissible under Apache-2.0, concepts were completely modernized to **TypeScript**, **Discord.js v14 (with Slash Commands, Buttons, Select Menus, Modals)**, **Supabase PostgreSQL (Source of Truth)**, **Redis (Locking & Caching)**, and **BullMQ (Distributed Workers)**.

---

## 2. In-Depth Repository Evaluation

| Metric | `anonymous-chats-discord` | `Spark-Discord-Bot` | `stealth-bot` | `discord-economy-bot` |
| :--- | :--- | :--- | :--- | :--- |
| **Language & Framework** | TypeScript, Discord.js v12 | Python, discord.py | JavaScript (ESM), Discord.js v14 | Not Found (N/A) |
| **Database & Cache** | TypeORM, PostgreSQL, nohm | SQLite (`spark.db`) | In-memory only (None) | N/A |
| **License** | Apache License 2.0 | None specified (Proprietary) | Apache License 2.0 | N/A |
| **Matchmaking Model** | Basic 1-on-1 text queue | Interest overlap, Daily 9 AM | Single channel public relay | N/A |
| **Anonymity Guarantee** | Partial (leaks user tags on deanon) | **None** (publicly tags `@user1 <-> @user2`) | **Broken** (posts usernames to mod log) | N/A |
| **Scalability** | Single server / basic sharding | Single node / SQLite bottleneck | Single server / in-memory | N/A |
| **Economy & Rewards** | None | None | None | N/A |

---

## 3. Findings & Vulnerabilities Discovered in References

### A. `anonymous-chats-discord` (D3rise)
- **Vulnerabilities**:
  1. *Race Condition in Reveal (`deanon.ts`)*: Relies on in-memory array checks (`chat.deanonApprovalUsers.length === 2`) followed by a standard repository save. Concurrent reveal clicks result in double emits or state corruption.
  2. *Identity Leaks*: Reveals raw Discord user tags (`user2.tag`) immediately with zero user choice over which profile fields (bio, age, gender, social handles) are shared.
  3. *Unsanitized Relays*: Relays raw attachments without scrubbing EXIF/location metadata, and lacks link/mention masking.
  4. *Outdated Stack*: Discord.js v12 is obsolete and incompatible with modern Discord API v10 and interactions.
- **Adopted Concept**: Room-based 1-on-1 relay architecture, modernized with Redlock atomic locking and Supabase transactional safety.

### B. `Spark-Discord-Bot` (DMONINK)
- **Vulnerabilities & Limitations**:
  1. *Not Anonymous*: Explicitly pings users publicly in server announcement channels.
  2. *Privacy Intrusion*: Uses aggressive scraping (`fetch_members(limit=None)`) and scans server roles and user bios with a 600-word heuristic without explicit consent.
  3. *Licensing*: No open source license provided.
- **Adopted Concept (Clean-Room Implementation)**:
  - Interest overlap scoring formula:
    $$\text{Score} = \frac{|\text{Interests}_A \cap \text{Interests}_B|}{\max(|\text{Interests}_A|, |\text{Interests}_B|)} \times 100$$

### C. `stealth-bot` (Finite-Loop-Club-NMAMIT)
- **Vulnerabilities**:
  1. *Direct Mod Log Identity Leak*: Relays the actual Discord username in plaintext to the moderator channel (`modChannel.send({ content: message.author.username ... })`), completely breaking user privacy.
  2. *Lack of Isolation*: Relays to a single guild channel rather than private, end-to-end 1-to-1 virtual rooms.
- **Adopted Concept**:
  - Deterministic persona and avatar generation per session (e.g., Celestial Fox 🦊, Mystic Phoenix 🦅, Starlight Owl 🦉) with consistent styling across the chat session.


## 4. Summary of Destiny's Anonymous-Chat Architecture

1. **Supabase PostgreSQL as Source of Truth**:
   - Strict schemas, foreign keys, row-level security, and audit logging.
2. **Redis Coordination & Distributed Locks**:
   - Distributed tickets for cross-server matchmaking with multi-criteria filtering (age, gender preference, language, interests).
   - Distributed Redlock for profile reveals, room termination and matchmaking reservations.
   - Sliding-window rate limiters preventing spam and abuse.
3. **Privacy by Design**:
   - Strict regex & token content sanitizers that strip invites, user pings `<@...>`, channel links, and personal tokens.
   - Mutual-consent profile reveals with fine-grained field selection (Age, Gender, Interests, Bio, Discord Tag) where fields are only shared if both parties agree.
   - Global cross-server block lists preventing matched encounters.
4. **BullMQ Background Workers**:
   - Separate worker processes for matchmaking, moderation triage, and session cleanup.
