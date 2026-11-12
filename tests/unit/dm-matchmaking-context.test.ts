import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { matchmakingManager } from '../../src/core/matchmaking/manager.js';
import { redis } from '../../src/redis/client.js';

const createdUserIds: string[] = [];

afterEach(async () => {
  await Promise.all(createdUserIds.splice(0).map(async (userId) => {
    await matchmakingManager.leaveQueue(userId).catch(() => false);
    await redis.del(`user:origin_guild:${userId}`).catch(() => false);
  }));
});

describe('DM matchmaking server context', () => {
  it('preserves a guild-origin policy when the user re-matches from a DM', async () => {
    const user = await db.createOrUpdateUser({
      discordUserId: '987654321012345678',
      destinyId: 'CTX001',
      age: 24,
      gender: 'female',
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['music'],
    });
    createdUserIds.push(user.id);

    const first = await matchmakingManager.joinQueue(user, '123456789012345678');
    expect(first.success).toBe(true);
    expect(first.ticket?.guildId).toBe('123456789012345678');

    const dmRematch = await matchmakingManager.joinQueue(user);
    expect(dmRematch.success).toBe(true);
    expect(dmRematch.ticket?.guildId).toBe('123456789012345678');
  });

  it('updates the stored server context when matchmaking starts in another guild', async () => {
    const user = await db.createOrUpdateUser({
      discordUserId: '987654321012345679',
      destinyId: 'CTX002',
      age: 26,
      gender: 'male',
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['gaming'],
    });
    createdUserIds.push(user.id);

    await matchmakingManager.joinQueue(user, '123456789012345678');
    const switched = await matchmakingManager.joinQueue(user, '234567890123456789');
    expect(switched.ticket?.guildId).toBe('234567890123456789');

    const dmRematch = await matchmakingManager.joinQueue(user);
    expect(dmRematch.ticket?.guildId).toBe('234567890123456789');
  });
});
