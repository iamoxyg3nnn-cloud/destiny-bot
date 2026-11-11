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
    const queued = await lockManager.withLock(`lock:ticket:${user.id}`, async () => {
      const latestProfile = await db.getUserById(user.id, true);
      if (!latestProfile) return false;
      if (latestProfile.activeRoomId) {
        const latestRoom = await db.getRoomById(latestProfile.activeRoomId);
        if (latestRoom?.status === 'active') return false;
        const cleared = await db.clearActiveRoom(user.id, latestProfile.activeRoomId);
        if (!cleared) return false;
      }
      await redis.set(`ticket:${user.id}`, JSON.stringify(ticket), 900); // 15 min TTL
      await redis.sAdd('matchmaking:queue', user.id);
      this.inMemoryQueue.set(user.id, ticket);
      this.savePersistentQueue();
      return true;
    });

    if (!queued) {
      return { success: false, message: 'You are already in an active room. Use `leave` to exit first.' };
    }
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

      // Fetch Redis tickets concurrently in bounded batches. Serial GETs made
      // queue scan latency grow linearly with queue size and delayed every
      // matchmaking cycle.
      const ticketEntries: Array<[string, string | null]> = [];
      const batchSize = 100;
      for (let offset = 0; offset < ids.length; offset += batchSize) {
        const batch = ids.slice(offset, offset + batchSize);
        const values = await Promise.all(batch.map(async (userId) => [userId, await redis.get(`ticket:${userId}`)] as [string, string | null]));
        ticketEntries.push(...values);
      }

      const staleIds: string[] = [];
      for (const [userId, raw] of ticketEntries) {
        if (!raw) {
          staleIds.push(userId);
          continue;
        }
        try {
          const ticket = JSON.parse(raw) as MatchTicket;
          const valid = isValidMatchTicket(ticket) && ticket.userId === userId;
          if (!valid) {
            staleIds.push(userId);
            continue;
          }
          this.inMemoryQueue.set(userId, ticket);
          activeIds.add(userId);
          activeTickets.push(ticket);
        } catch {
          staleIds.push(userId);
        }
      }

      if (staleIds.length > 0) {
        await Promise.all(staleIds.map(async (userId) => {
          await redis.del(`ticket:${userId}`);
          await redis.sRem('matchmaking:queue', userId);
        }));
      }

      for (const userId of this.inMemoryQueue.keys()) {
        if (!activeIds.has(userId)) this.inMemoryQueue.delete(userId);
      }
      // Redis is authoritative in production; avoid synchronous disk writes on
      // every 2.5s poll. Join/leave still persist local snapshots for migration.
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

  private async createMatchRoomRecord(ticketA: MatchTicket, ticketB: MatchTicket): Promise<RoomSession> {
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
      connectionXp: 10,
      connectionLevel: 'Strangers',
      revealStatusUser1: { consented: false, revealedFields: [] },
      revealStatusUser2: { consented: false, revealedFields: [] },
    });
    room.user1DiscordId = ticketA.discordUserId;
    room.user2DiscordId = ticketB.discordUserId;
    room.user1Avatar = personaA.avatarEmoji;
    room.user2Avatar = personaB.avatarEmoji;
    return room;
  }

  /**
   * Reserve a pair against concurrent leave/rejoin requests. Locks are always
   * acquired in sorted user-id order to avoid deadlocks. The Redis values are
   * compared with the cycle snapshot before either ticket is consumed.
   */
  private async reserveTicketsAndCreateRoom(
    ticketA: MatchTicket,
    ticketB: MatchTicket
  ): Promise<RoomSession | null> {
    const ordered = [ticketA, ticketB].sort((a, b) => a.userId.localeCompare(b.userId));
    return lockManager.withLock(`lock:ticket:${ordered[0].userId}`, async () =>
      lockManager.withLock(`lock:ticket:${ordered[1].userId}`, async () => {
        const [rawA, rawB] = await Promise.all([
          redis.get(`ticket:${ticketA.userId}`),
          redis.get(`ticket:${ticketB.userId}`),
        ]);
        const matchesSnapshot = (raw: string | null, expected: MatchTicket) => {
          if (!raw) return false;
          try {
            const current = JSON.parse(raw) as MatchTicket;
            return isValidMatchTicket(current) &&
              current.userId === expected.userId &&
              current.discordUserId === expected.discordUserId &&
              current.queuedAt === expected.queuedAt;
          } catch {
            return false;
          }
        };
        if (!matchesSnapshot(rawA, ticketA) || !matchesSnapshot(rawB, ticketB)) return null;

        const removedA = await redis.delIfValue(`ticket:${ticketA.userId}`, rawA!);
        if (!removedA) return null;
        const removedB = await redis.delIfValue(`ticket:${ticketB.userId}`, rawB!);
        if (!removedB) {
          await redis.set(`ticket:${ticketA.userId}`, rawA!, 900);
          await redis.sAdd('matchmaking:queue', ticketA.userId);
          return null;
        }

        try {
          await Promise.all([
            redis.sRem('matchmaking:queue', ticketA.userId),
            redis.sRem('matchmaking:queue', ticketB.userId),
          ]);
        } catch (error) {
          // Restore both tickets if queue-set cleanup fails partway through.
          await Promise.allSettled([
            redis.set(`ticket:${ticketA.userId}`, rawA!, 900),
            redis.set(`ticket:${ticketB.userId}`, rawB!, 900),
            redis.sAdd('matchmaking:queue', ticketA.userId),
            redis.sAdd('matchmaking:queue', ticketB.userId),
          ]);
          throw error;
        }

        this.inMemoryQueue.delete(ticketA.userId);
        this.inMemoryQueue.delete(ticketB.userId);
        this.savePersistentQueue();
        // Create the database room before releasing ticket locks. This closes
        // the gap where a concurrent /match could re-enqueue an active user.
        return await this.createMatchRoomRecord(ticketA, ticketB);
      })
    );
  }

  /**
   * Process matchmaking iteration atomically
   */
  async processMatchCycle(): Promise<{ matchesCreated: number }> {
    // The worker starts before Discord login completes. Never consume tickets
    // or create active rooms until the client can actually deliver both DMs.
    const client = getDiscordClient();
    if (!client || !client.isReady()) return { matchesCreated: 0 };

    return await lockManager.withLock('lock:matchmaking:cycle', async () => {
      const tickets = await this.getQueueTickets();
      if (tickets.length < 2) return { matchesCreated: 0 };

      console.log(`[Matchmaking Cycle] Evaluating ${tickets.length} queue tickets.`);

      let matchesCreated = 0;
      const blockLists = await matchmakingEngine.preloadBlockLists(tickets);
      const unmatched = [...tickets];

      while (unmatched.length > 1) {
        const ticketA = unmatched.shift()!;
        const match = await matchmakingEngine.findBestMatch(ticketA, unmatched, blockLists);
        if (match) {
          const ticketB = match.partner;
          const partnerIndex = unmatched.findIndex((ticket) => ticket.userId === ticketB.userId);
          if (partnerIndex < 0) continue;
          unmatched.splice(partnerIndex, 1);

          console.log('[Matchmaking Cycle] Compatible pair found; reserving queue tickets.');
          try {
            const reservedRoom = await this.reserveTicketsAndCreateRoom(ticketA, ticketB);
            if (!reservedRoom) {
              // One user left, rejoined, or had their ticket refreshed after the
              // queue snapshot. Keep the other candidate available for matching.
              unmatched.splice(partnerIndex, 0, ticketB);
              continue;
            }
            // The DB room is committed under both ticket locks. Release them
            // before Redis caching and Discord DM delivery.
            const createdRoom = await this.createMatchRoom(
              ticketA,
              ticketB,
              match.matchResult.sharedInterests,
              reservedRoom
            );
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
    sharedInterests: string[] = [],
    precreatedRoom?: RoomSession
  ): Promise<RoomSession> {
    const room = precreatedRoom ?? await this.createMatchRoomRecord(ticketA, ticketB);

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

    // Notify both users concurrently. A room is only considered delivered
    // when both DMs succeed; partial delivery is rolled back and the reachable
    // participant is returned to the queue.
    const client = getDiscordClient();
    if (!client || !client.isReady()) {
      if (config.NODE_ENV !== 'production') {
        // Unit/integration environments intentionally do not log in to Discord.
        console.warn('[Matchmaking] Discord is unavailable outside production; skipping DM delivery.');
        refreshBotPresence();
        return room;
      }
      await db.endRoom(room.id, 'timeout');
      room.status = 'ended';
      room.endedAt = new Date().toISOString();
      room.endReason = 'timeout';
      throw new Error('Discord client became unavailable before match notifications.');
    }

    const [userAResult, userBResult] = await Promise.allSettled([
      client.users.fetch(ticketA.discordUserId),
      client.users.fetch(ticketB.discordUserId),
    ]);
    const userA = userAResult.status === 'fulfilled' ? userAResult.value : null;
    const userB = userBResult.status === 'fulfilled' ? userBResult.value : null;
    const iceBreaker = this.getRandomIceBreaker();

    const [deliveryA, deliveryB] = await Promise.allSettled([
      userA
        ? userA.send({
            components: [embedService.createMatchFoundContainer(room, true, iceBreaker, sharedInterests)],
            flags: [MessageFlags.IsComponentsV2],
          })
        : Promise.reject(new Error('Could not fetch Discord user A')),
      userB
        ? userB.send({
            components: [embedService.createMatchFoundContainer(room, false, iceBreaker, sharedInterests)],
            flags: [MessageFlags.IsComponentsV2],
          })
        : Promise.reject(new Error('Could not fetch Discord user B')),
    ]);
    const sentA = deliveryA.status === 'fulfilled';
    const sentB = deliveryB.status === 'fulfilled';

    if (!sentA || !sentB) {
      await db.endRoom(room.id, 'user_left');
      room.status = 'ended';
      room.endedAt = new Date().toISOString();
      room.endReason = 'user_left';

      const reachableUser = sentA ? userA : sentB ? userB : null;
      if (reachableUser) {
        const notice = new ContainerBuilder()
          .setAccentColor(COLORS.GOLD)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '# ⚠️ Partner Unreachable\n\nYour match partner could not be reached through Discord DMs. We have returned you to the top of the queue.'
            )
          );
        await reachableUser.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
      }

      const ticketsToRestore = sentA ? [ticketA] : sentB ? [ticketB] : [ticketA, ticketB];
      for (const ticket of ticketsToRestore) {
        const profile = await db.getUserById(ticket.userId, true).catch(() => null);
        if (profile) {
          await this.joinQueue(profile, ticket.guildId).catch((requeueError) => {
            console.error('[Matchmaking] Could not requeue reachable participant:', requeueError);
          });
        }
      }
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
