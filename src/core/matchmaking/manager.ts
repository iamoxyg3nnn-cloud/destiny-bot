import { MatchTicket, RoomSession, UserProfile } from '../types.js';
import { matchmakingEngine } from './engine.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
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

export class MatchmakingManager {
  private inMemoryQueue: Map<string, MatchTicket> = new Map();

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
  async joinQueue(user: UserProfile, guildId?: string, overridePref?: string[]): Promise<{ success: boolean; message: string; ticket?: MatchTicket }> {
    // 1. Safety checks
    if (user.isBanned) {
      return { success: false, message: 'Your account is currently restricted from matchmaking.' };
    }

    if (user.activeRoomId) {
      const activeRoom = await db.getRoomById(user.activeRoomId);
      if (activeRoom && activeRoom.status === 'active') {
        return { success: false, message: 'You are already in an active room. Use `leave` to exit first.' };
      } else {
        // Clean up stale reference
        await db.clearActiveRoom(user.id);
        user.activeRoomId = null;
      }
    }

    // 2. Sliding rate limit check (max 1 join per 2 seconds, relaxed for mood switching)
    const alreadyQueued = this.inMemoryQueue.has(user.id);
    if (!alreadyQueued) {
      const rateLimit = await redis.checkRateLimit(`queue:${user.id}`, 1, 2);
      if (!rateLimit.allowed) {
        return { success: false, message: 'You are queuing too quickly. Please wait a moment.' };
      }
    }

    const preferredGender = overridePref && overridePref.length > 0
      ? overridePref
      : (user.preferredGender && user.preferredGender.length > 0 ? user.preferredGender : ['any']);

    const ticket: MatchTicket = {
      userId: user.id,
      destinyId: user.destinyId,
      discordUserId: user.discordUserId,
      age: user.age,
      gender: user.gender,
      preferredGender,
      minAgePref: user.minAgePref || 18,
      maxAgePref: user.maxAgePref || 99,
      languages: user.languages && user.languages.length > 0 ? user.languages : ['en'],
      interests: user.interests || [],
      guildId,
      queuedAt: Date.now(),
    };

    // 3. Atomically add to queue & persist to disk
    await lockManager.withLock(`lock:ticket:${user.id}`, async () => {
      await redis.set(`ticket:${user.id}`, JSON.stringify(ticket), 900); // 15 min TTL
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
      this.inMemoryQueue.delete(userId);
      this.savePersistentQueue();
      return true;
    });
  }

  /**
   * Returns whether a user is currently queued (auto-evicts expired tickets)
   */
  async isQueued(userId: string): Promise<boolean> {
    const memoryTicket = this.inMemoryQueue.get(userId);
    if (memoryTicket) {
      if (Date.now() - memoryTicket.queuedAt > TICKET_TTL_MS) {
        this.inMemoryQueue.delete(userId);
        this.savePersistentQueue();
        return false;
      }
      return true;
    }
    const ticket = await redis.get(`ticket:${userId}`);
    return ticket !== null;
  }

  /**
   * Get all active queue tickets, evicting expired (>15m) tickets
   */
  async getQueueTickets(): Promise<MatchTicket[]> {
    const now = Date.now();
    let changed = false;
    for (const [userId, ticket] of this.inMemoryQueue.entries()) {
      if (now - ticket.queuedAt > TICKET_TTL_MS) {
        this.inMemoryQueue.delete(userId);
        changed = true;
      }
    }
    if (changed) {
      this.savePersistentQueue();
    }
    return Array.from(this.inMemoryQueue.values());
  }

  /**
   * Process matchmaking iteration atomically
   */
  async processMatchCycle(): Promise<{ matchesCreated: number }> {
    return await lockManager.withLock('lock:matchmaking:cycle', async () => {
      const tickets = await this.getQueueTickets();
      if (tickets.length < 2) return { matchesCreated: 0 };

      console.log(`[Matchmaking Cycle] Evaluating ${tickets.length} queue tickets:`, tickets.map(t => `${t.destinyId} (${t.gender}->${t.preferredGender.join(',')})`));

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

          // Create Room
          await this.createMatchRoom(ticketA, ticketB, match.matchResult.sharedInterests);
          matchesCreated++;
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

    // Cache active room session in Redis
    await redis.set(`room:${room.id}`, JSON.stringify(room), 86400);
    await redis.set(`user:active_room:${ticketA.userId}`, room.id, 86400);
    await redis.set(`user:active_room:${ticketB.userId}`, room.id, 86400);

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

        // Closed DM Guard: if one partner could not be reached, safely rollback and requeue the reachable user
        if (!sentA && sentB && userB) {
          await db.endRoom(room.id, 'user_left');
          const notice = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ⚠️ Partner Unreachable\n\nYour match partner currently has Direct Messages closed. We have placed you back at the top of the queue!'
              )
            );
          await userB.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          const u2Profile = await db.getUserById(ticketB.userId);
          if (u2Profile) await this.joinQueue(u2Profile, ticketB.guildId, ticketB.preferredGender);
        } else if (sentA && !sentB && userA) {
          await db.endRoom(room.id, 'user_left');
          const notice = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ⚠️ Partner Unreachable\n\nYour match partner currently has Direct Messages closed. We have placed you back at the top of the queue!'
              )
            );
          await userA.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          const u1Profile = await db.getUserById(ticketA.userId);
          if (u1Profile) await this.joinQueue(u1Profile, ticketA.guildId, ticketA.preferredGender);
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
