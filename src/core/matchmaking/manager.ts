import { MatchTicket, RoomSession, UserProfile } from '../types.js';
import { matchmakingEngine } from './engine.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { config } from '../../config/index.js';
import { lockManager } from '../../redis/locks.js';
import { anonymizer } from '../anonymizer.js';
import { MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { embedService, COLORS } from '../../bot/embeds/index.js';
import { getDiscordClient } from '../../bot/client-registry.js';
import { refreshBotPresence } from '../../bot/presence-manager.js';
import fs from 'fs';
import path from 'path';

const QUEUE_STORAGE_PATH = path.resolve(process.cwd(), 'data', 'matchmaking_queue.json');
const TICKET_TTL_MS = 900_000; // 15 minutes TTL

export const ICE_BREAKERS = [
  "✨ If you could travel to any era in human history for 24 hours, where and when would you go?",
  "🎮 What's a movie or show that completely changed your perspective on life?",
  "☕ Are you a morning coffee person or a late-night midnight owl?",
  "🚀 If humanity colonized Mars tomorrow, would you take a one-way ticket?",
  "🎵 What's one song that you can listen to on repeat without ever getting tired of it?",
  "🎨 What is a creative passion or weird hobby you secretly enjoy?",
  "🏝️ If stranded on an island with only 3 items, what are you bringing?",
  "🍕 What's your most controversial food opinion (e.g. pineapple on pizza)?",
  "🌌 If you could have one superpower that nobody else has, what would you choose?"
];

function isValidMatchTicket(value: unknown): value is MatchTicket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ticket = value as Partial<MatchTicket>;
  const now = Date.now();
  const stringArray = (items: unknown, maxItems: number, maxLength: number) =>
    Array.isArray(items) && items.length <= maxItems &&
    items.every((item) => typeof item === 'string' && item.length > 0 && item.length <= maxLength);

  return typeof ticket.userId === 'string' && ticket.userId.length > 0 && ticket.userId.length <= 128 &&
    typeof ticket.destinyId === 'string' && ticket.destinyId.length > 0 && ticket.destinyId.length <= 32 &&
    typeof ticket.discordUserId === 'string' && /^[0-9]{15,22}$/.test(ticket.discordUserId) &&
    Number.isInteger(ticket.age) && (ticket.age as number) >= 18 && (ticket.age as number) <= 99 &&
    typeof ticket.gender === 'string' && ['male', 'female', 'non_binary', 'nonbinary', 'other', 'prefer_not_to_say'].includes(ticket.gender.toLowerCase()) &&
    stringArray(ticket.preferredGender, 8, 32) &&
    Number.isInteger(ticket.minAgePref) && (ticket.minAgePref as number) >= 18 &&
    Number.isInteger(ticket.maxAgePref) && (ticket.maxAgePref as number) <= 99 &&
    (ticket.minAgePref as number) <= (ticket.maxAgePref as number) &&
    stringArray(ticket.languages, 20, 16) &&
    stringArray(ticket.interests, 100, 64) &&
    (ticket.guildId === undefined || (typeof ticket.guildId === 'string' && ticket.guildId.length <= 32)) &&
    Number.isFinite(ticket.queuedAt) && (ticket.queuedAt as number) > 0 &&
    (ticket.queuedAt as number) <= now + 60_000 &&
    now - (ticket.queuedAt as number) <= TICKET_TTL_MS;
}

export class MatchmakingManager {
  private inMemoryQueue: Map<string, MatchTicket> = new Map();
  private legacyQueueMigrationAttempted = false;

  constructor() {
    this.loadPersistentQueue();
  }

  private loadPersistentQueue(): void {
    try {
      if (fs.existsSync(QUEUE_STORAGE_PATH)) {
        const raw = fs.readFileSync(QUEUE_STORAGE_PATH, 'utf-8');
        const list: MatchTicket[] = JSON.parse(raw);
        const now = Date.now();
        for (const t of list) {
          if (now - t.queuedAt <= TICKET_TTL_MS) {
            this.inMemoryQueue.set(t.userId, t);
          }
        }
        if (this.inMemoryQueue.size > 0) {
          console.log(`[Matchmaking] Restored ${this.inMemoryQueue.size} active queue tickets from disk.`);
        }
      }
    } catch (err: any) {
      console.warn('[Matchmaking] Could not load persistent queue from disk:', err?.message);
    }
  }

  private savePersistentQueue(): void {
    try {
      const dir = path.dirname(QUEUE_STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.inMemoryQueue.values());
      fs.writeFileSync(QUEUE_STORAGE_PATH, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[Matchmaking] Could not persist queue to disk:', err?.message);
    }
  }

  /**
   * Enqueue a user into the matchmaking queue
   */
  async joinQueue(user: UserProfile, guildId?: string): Promise<{ success: boolean; message: string; ticket?: MatchTicket }> {
    // 1. Safety checks
    if (user.isBanned) {
      return { success: false, message: 'Your account is currently restricted from matchmaking.' };
    }
    if (!user.discordUserId || !/^[0-9]{15,22}$/.test(user.discordUserId) || !user.destinyId || user.destinyId.length > 32 || !['male', 'female', 'non_binary', 'nonbinary', 'other', 'prefer_not_to_say'].includes(String(user.gender).toLowerCase()) || !Number.isInteger(user.age) || user.age < 18 || user.age > 99) {
      return { success: false, message: 'Complete your 18+ profile before joining matchmaking.' };
    }
    const minAgePref = user.minAgePref || 18;
    const maxAgePref = user.maxAgePref || 99;
    if (!Number.isInteger(minAgePref) || !Number.isInteger(maxAgePref) || minAgePref < 18 || maxAgePref > 99 || minAgePref > maxAgePref) {
      return { success: false, message: 'Your age preferences are invalid. Please update your profile and try again.' };
    }

    if (user.activeRoomId) {
      const activeRoom = await db.getRoomById(user.activeRoomId);
      if (activeRoom && activeRoom.status === 'active') {
        return { success: false, message: 'You are already in an active room. Use `leave` to exit first.' };
      } else {
        // Clean up stale reference
        const cleared = await db.clearActiveRoom(user.id, user.activeRoomId);
        if (!cleared) return { success: false, message: 'Your room status changed. Please try joining the queue again.' };
        user.activeRoomId = null;
      }
    }

    // 2. Sliding rate limit check (max 1 join per 2 seconds, relaxed for mood switching)
    const alreadyQueued = await this.isQueued(user.id);
    if (!alreadyQueued) {
      const rateLimit = await redis.checkRateLimit(`queue:${user.id}`, 1, 2);
      if (!rateLimit.allowed) {
        return { success: false, message: 'You are queuing too quickly. Please wait a moment.' };
      }
    }

    const languages = (Array.isArray(user.languages) ? user.languages : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().slice(0, 16))
      .slice(0, 20);
    if (languages.length === 0) languages.push('en');

    const interests = (Array.isArray(user.interests) ? user.interests : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().slice(0, 64))
      .slice(0, 100);

    const ticket: MatchTicket = {
      userId: user.id,
      destinyId: user.destinyId,
      discordUserId: user.discordUserId,
      age: user.age,
      gender: user.gender,
      preferredGender: ['any'],
      minAgePref,
      maxAgePref,
      languages,
      interests,
      guildId,
      queuedAt: Date.now(),
    };

    // 3. Atomically add to queue & persist to disk
    await lockManager.withLock(`lock:ticket:${user.id}`, async () => {
      await redis.set(`ticket:${user.id}`, JSON.stringify(ticket), 900); // 15 min TTL
      await redis.sAdd('matchmaking:queue', user.id);
      this.inMemoryQueue.set(user.id, ticket);
      this.savePersistentQueue();
    });

    return { success: true, message: 'Successfully joined the anonymous matchmaking queue.', ticket };
  }

  /**
   * Remove a user from the matchmaking queue
   */
  async leaveQueue(userId: string): Promise<boolean> {
    return await lockManager.withLock(`lock:ticket:${userId}`, async () => {
      await redis.del(`ticket:${userId}`);
      await redis.sRem('matchmaking:queue', userId);
      this.inMemoryQueue.delete(userId);
      this.savePersistentQueue();
      return true;
    });
  }

  /**
   * Returns whether a user is currently queued (auto-evicts expired tickets)
   */
  async isQueued(userId: string): Promise<boolean> {
    if (redis.isHealthy()) {
      const raw = await redis.get(`ticket:${userId}`);
      if (redis.isHealthy()) {
        if (!raw) {
          this.inMemoryQueue.delete(userId);
          return false;
        }
        try {
        const ticket = JSON.parse(raw) as MatchTicket;
        if (!isValidMatchTicket(ticket) || ticket.userId !== userId) {
          await this.leaveQueue(userId);
          return false;
        }
        this.inMemoryQueue.set(userId, ticket);
          return true;
        } catch {
          await this.leaveQueue(userId);
          return false;
        }
      }
    }

    const memoryTicket = this.inMemoryQueue.get(userId);
    if (!memoryTicket) return false;
    if (Date.now() - memoryTicket.queuedAt > TICKET_TTL_MS) {
      this.inMemoryQueue.delete(userId);
      this.savePersistentQueue();
      return false;
    }
    return true;
  }

  /**
   * Get all active queue tickets, evicting expired (>15m) tickets
   */
  async getQueueTickets(): Promise<MatchTicket[]> {
    const now = Date.now();
    if (config.NODE_ENV === 'production' && !redis.isHealthy()) {
      throw new Error('Redis is required to read the shared matchmaking queue in production.');
    }

    if (redis.isHealthy()) {
      let ids = await redis.sMembers('matchmaking:queue');
      if (!redis.isHealthy()) {
        // The shared store failed; retain this process's last known in-memory queue.
      } else {

      // One-time migration for tickets restored from the legacy local JSON file.
      if (!this.legacyQueueMigrationAttempted) {
        this.legacyQueueMigrationAttempted = true;
        if (ids.length === 0 && this.inMemoryQueue.size > 0) {
          for (const [userId, ticket] of this.inMemoryQueue) {
            if (now - ticket.queuedAt <= TICKET_TTL_MS) {
              await redis.set(`ticket:${userId}`, JSON.stringify(ticket), 900);
              await redis.sAdd('matchmaking:queue', userId);
            }
          }
          ids = await redis.sMembers('matchmaking:queue');
        }
      }

      const activeTickets: MatchTicket[] = [];
      const activeIds = new Set<string>();
      for (const userId of ids) {
        const raw = await redis.get(`ticket:${userId}`);
        if (!raw) {
          await redis.sRem('matchmaking:queue', userId);
          continue;
        }
        try {
          const ticket = JSON.parse(raw) as MatchTicket;
          const valid = isValidMatchTicket(ticket) && ticket.userId === userId;
          if (!valid) {
            await redis.del(`ticket:${userId}`);
            await redis.sRem('matchmaking:queue', userId);
            continue;
          }
          this.inMemoryQueue.set(userId, ticket);
          activeIds.add(userId);
          activeTickets.push(ticket);
        } catch {
          await redis.del(`ticket:${userId}`);
          await redis.sRem('matchmaking:queue', userId);
        }
      }

      for (const userId of this.inMemoryQueue.keys()) {
        if (!activeIds.has(userId)) this.inMemoryQueue.delete(userId);
      }
      this.savePersistentQueue();
      activeTickets.sort((a, b) => a.queuedAt - b.queuedAt);
      return activeTickets;
      }
    }

    let changed = false;
    for (const [userId, ticket] of this.inMemoryQueue.entries()) {
      if (now - ticket.queuedAt > TICKET_TTL_MS) {
        this.inMemoryQueue.delete(userId);
        changed = true;
      }
    }
    if (changed) this.savePersistentQueue();
    const validTickets = Array.from(this.inMemoryQueue.entries()).filter(([userId, ticket]) => {
      const valid = isValidMatchTicket(ticket) && ticket.userId === userId;
      if (!valid) this.inMemoryQueue.delete(userId);
      return valid;
    }).map(([, ticket]) => ticket);
    validTickets.sort((a, b) => a.queuedAt - b.queuedAt);
    return validTickets;
  }

  /**
   * Process matchmaking iteration atomically
   */
  async processMatchCycle(): Promise<{ matchesCreated: number }> {
    return await lockManager.withLock('lock:matchmaking:cycle', async () => {
      const tickets = await this.getQueueTickets();
      if (tickets.length < 2) return { matchesCreated: 0 };

      console.log(`[Matchmaking Cycle] Evaluating ${tickets.length} queue tickets:`, tickets.map(t => t.destinyId));

      let matchesCreated = 0;
      const matchedUserIds = new Set<string>();

      for (let i = 0; i < tickets.length; i++) {
        const ticketA = tickets[i];
        if (matchedUserIds.has(ticketA.userId)) continue;

        const remainingCandidates = tickets.filter(
          (t) => !matchedUserIds.has(t.userId) && t.userId !== ticketA.userId
        );

        const match = await matchmakingEngine.findBestMatch(ticketA, remainingCandidates);
        if (match) {
          const ticketB = match.partner;
          matchedUserIds.add(ticketA.userId);
          matchedUserIds.add(ticketB.userId);

          console.log(`[Matchmaking Cycle] Match confirmed between ${ticketA.destinyId} and ${ticketB.destinyId}! Creating room...`);

          // Remove both from queue
          await this.leaveQueue(ticketA.userId);
          await this.leaveQueue(ticketB.userId);

          // Create Room. If persistence fails before a room exists, put both
          // users back into the shared queue rather than silently losing them.
          try {
            const createdRoom = await this.createMatchRoom(ticketA, ticketB, match.matchResult.sharedInterests);
            if (createdRoom.status === 'active') matchesCreated++;
          } catch (error) {
            console.error('[Matchmaking] Room creation failed; restoring queue tickets:', error);
            for (const ticket of [ticketA, ticketB]) {
              const profile = await db.getUserById(ticket.userId, true).catch(() => null);
              if (profile) {
                await this.joinQueue(profile, ticket.guildId).catch((requeueError) => {
                  console.error('[Matchmaking] Could not restore queue ticket:', requeueError);
                });
              }
            }
          }
        }
      }

      return { matchesCreated };
    });
  }

  /**
   * Creates a confirmed match room between two users
   */
  async createMatchRoom(
    ticketA: MatchTicket,
    ticketB: MatchTicket,
    sharedInterests: string[] = []
  ): Promise<RoomSession> {
    const roomCode = anonymizer.generateRoomCode();
    const personaA = anonymizer.generatePersona(ticketA.userId, roomCode);
    const personaB = anonymizer.generatePersona(ticketB.userId, roomCode);

    const room = await db.createRoom({
      roomCode,
      user1Id: ticketA.userId,
      user2Id: ticketB.userId,
      user1DiscordId: ticketA.discordUserId,
      user2DiscordId: ticketB.discordUserId,
      user1Pseudonym: personaA.pseudonym,
      user2Pseudonym: personaB.pseudonym,
      user1Avatar: personaA.avatarEmoji,
      user2Avatar: personaB.avatarEmoji,
      status: 'active',
      startedAt: new Date().toISOString(),
      connectionXp: 10, // Initial match XP bonus
      connectionLevel: 'Strangers',
      revealStatusUser1: { consented: false, revealedFields: [] },
      revealStatusUser2: { consented: false, revealedFields: [] },
    });

    // Ensure Discord IDs and Avatars are populated on room session
    room.user1DiscordId = ticketA.discordUserId;
    room.user2DiscordId = ticketB.discordUserId;
    room.user1Avatar = personaA.avatarEmoji;
    room.user2Avatar = personaB.avatarEmoji;

    // Cache active room session in Redis. If any cache write fails, roll back
    // the newly-created database room so participants are not stranded.
    try {
      const cacheResults = await Promise.allSettled([
        redis.set(`room:${room.id}`, JSON.stringify(room), 86400),
        redis.set(`user:active_room:${ticketA.userId}`, room.id, 86400),
        redis.set(`user:active_room:${ticketB.userId}`, room.id, 86400),
      ]);
      const failedCacheWrite = cacheResults.find((result) => result.status === 'rejected');
      if (failedCacheWrite?.status === 'rejected') throw failedCacheWrite.reason;
    } catch (cacheError) {
      await db.endRoom(room.id, 'timeout').catch((rollbackError) => {
        console.error('[Matchmaking] Could not roll back room after cache failure:', rollbackError);
      });
      throw cacheError;
    }

    // Notify both users in Discord DMs
    try {
      const client = getDiscordClient();
      if (client && client.isReady()) {
        const iceBreaker = this.getRandomIceBreaker();

        const [userA, userB] = await Promise.all([
          client.users.fetch(ticketA.discordUserId).catch(() => null),
          client.users.fetch(ticketB.discordUserId).catch(() => null),
        ]);

        let sentA = false;
        let sentB = false;

        if (userA) {
          const containerA = embedService.createMatchFoundContainer(room, true, iceBreaker, sharedInterests);
          await userA.send({ components: [containerA], flags: [MessageFlags.IsComponentsV2] })
            .then(() => { sentA = true; })
            .catch((err) => {
              console.error(`[Matchmaking] DM delivery failed to User A (${ticketA.discordUserId}):`, err?.message || err);
            });
        }

        if (userB) {
          const containerB = embedService.createMatchFoundContainer(room, false, iceBreaker, sharedInterests);
          await userB.send({ components: [containerB], flags: [MessageFlags.IsComponentsV2] })
            .then(() => { sentB = true; })
            .catch((err) => {
              console.error(`[Matchmaking] DM delivery failed to User B (${ticketB.discordUserId}):`, err?.message || err);
            });
        }

        if (!sentA && !sentB) {
          await db.endRoom(room.id, 'user_left');
          room.status = 'ended';
          room.endedAt = new Date().toISOString();
          room.endReason = 'user_left';
          for (const ticket of [ticketA, ticketB]) {
            const profile = await db.getUserById(ticket.userId, true).catch(() => null);
            if (profile) await this.joinQueue(profile, ticket.guildId).catch(() => {});
          }
        }

        // Closed DM Guard: if one partner could not be reached, safely rollback and requeue the reachable user
        if (!sentA && sentB && userB) {
          await db.endRoom(room.id, 'user_left');
          room.status = 'ended';
          room.endedAt = new Date().toISOString();
          room.endReason = 'user_left';
          const notice = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ⚠️ Partner Unreachable\n\nYour match partner currently has Direct Messages closed. We have placed you back at the top of the queue!'
              )
            );
          await userB.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          const u2Profile = await db.getUserById(ticketB.userId);
          if (u2Profile) await this.joinQueue(u2Profile, ticketB.guildId);
        } else if (sentA && !sentB && userA) {
          await db.endRoom(room.id, 'user_left');
          room.status = 'ended';
          room.endedAt = new Date().toISOString();
          room.endReason = 'user_left';
          const notice = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ⚠️ Partner Unreachable\n\nYour match partner currently has Direct Messages closed. We have placed you back at the top of the queue!'
              )
            );
          await userA.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          const u1Profile = await db.getUserById(ticketA.userId);
          if (u1Profile) await this.joinQueue(u1Profile, ticketA.guildId);
        }
      }
    } catch (err: any) {
      console.warn('[Matchmaking] Discord DM notification skipped:', err?.message);
    }

    // A new conversation is live — reflect it in the rotating presence.
    refreshBotPresence();

    return room;
  }

  /**
   * Returns a random ice-breaker prompt
   */
  getRandomIceBreaker(): string {
    return ICE_BREAKERS[Math.floor(Math.random() * ICE_BREAKERS.length)];
  }
}

export const matchmakingManager = new MatchmakingManager();
