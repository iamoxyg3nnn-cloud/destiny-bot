import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/supabase.js';

const discordUserId = 'profile-persistence-test-user';

afterEach(() => {
  for (const [id, user] of db.mockUsers) {
    if (user.discordUserId === discordUserId) {
      db.mockUsers.delete(id);
      db.mockTransactions = db.mockTransactions.filter((tx) => tx.userId !== id);
    }
  }
});

describe('profile extension persistence', () => {
  it('persists and clears optional profile fields without a stale cache restoring them', async () => {
    const created = await db.createOrUpdateUser({
      discordUserId,
      destinyId: 'PROF01',
      age: 24,
      gender: 'prefer_not_to_say',
      bio: 'old bio',
      matchIntent: 'friends',
      cardTheme: 'midnight',
      equippedBadges: ['badge-1'],
    });
    expect(created.bio).toBe('old bio');
    expect(db.mockTransactions.some((tx) => tx.referenceId === `welcome:${created.id}` && tx.type === 'welcome_bonus')).toBe(true);

    await db.createOrUpdateUser({
      discordUserId,
      bio: '',
      matchIntent: '',
      cardTheme: 'obsidian',
      equippedBadges: [],
    });

    const refreshed = await db.getUserByDiscordId(discordUserId, true);
    expect(refreshed?.bio).toBe('');
    expect(refreshed?.matchIntent).toBe('');
    expect(refreshed?.cardTheme).toBe('obsidian');
    expect(refreshed?.equippedBadges).toEqual([]);
  });
});
