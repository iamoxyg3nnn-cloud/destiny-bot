import { describe, expect, it, vi } from 'vitest';
import { matchmakingEngine } from '../../src/core/matchmaking/engine.js';
import { MatchTicket } from '../../src/core/types.js';
import { isProfileComplete } from '../../src/bot/profile-view.js';
import { db } from '../../src/database/supabase.js';

function ticket(overrides: Partial<MatchTicket> = {}): MatchTicket {
  return {
    userId: 'user-a',
    destinyId: 'DEST-A',
    discordUserId: 'discord-a',
    age: 24,
    gender: 'female',
    preferredGender: ['any'],
    minAgePref: 18,
    maxAgePref: 99,
    languages: ['en'],
    interests: ['music'],
    queuedAt: Date.now(),
    ...overrides,
  };
}

describe('Matchmaking edge-case guards', () => {
  it('allows an adult profile to match without disclosing gender', () => {
    expect(isProfileComplete({ age: 24, gender: 'prefer_not_to_say' } as any)).toBe(true);
  });

  it('rejects profiles below the adult age threshold', () => {
    expect(isProfileComplete({ age: 17, gender: 'female' } as any)).toBe(false);
  });

  it('rejects invalid ages without throwing', async () => {
    const result = await matchmakingEngine.evaluateMatch(ticket({ age: Number.NaN }), ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b' }));
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('INVALID_PROFILE');
  });

  it('handles missing language and interest arrays safely', async () => {
    const a = ticket({ languages: undefined as any, interests: undefined as any });
    const b = ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', languages: undefined as any, interests: undefined as any });
    const result = await matchmakingEngine.evaluateMatch(a, b);
    expect(result.isEligible).toBe(true);
    expect(result.sharedInterests).toEqual([]);
  });

  it('does not award a negative wait-time score for future-dated tickets', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ queuedAt: Date.now() + 60_000, interests: ['music'] }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', queuedAt: Date.now() + 60_000, interests: ['sports'] })
    );
    expect(result.isEligible).toBe(true);
    expect(result.score).toBe(50);
  });

  it('uses Jaccard union size when scoring shared interests', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ interests: ['music', 'gaming'] }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', interests: ['music', 'travel'] })
    );
    expect(result.isEligible).toBe(true);
    expect(result.sharedInterests).toEqual(['music']);
    expect(result.score).toBe(67);
  });

  it('treats Hinglish speakers as compatible with Hindi or English speakers', async () => {
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
    ]);
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ languages: ['Hinglish'] }),
      ticket({
        userId: 'user-b',
        destinyId: 'DEST-B',
        discordUserId: 'discord-b',
        gender: 'male',
        languages: ['English', 'Hindi'],
      }),
      blocks
    );
    expect(result.isEligible).toBe(true);
    expect(result.reasons).toContain('MUTUAL_COMPATIBILITY_CONFIRMED');
  });

  it('does not treat Hinglish as compatible with unrelated languages', async () => {
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
    ]);
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ languages: ['Hinglish'] }),
      ticket({
        userId: 'user-b',
        destinyId: 'DEST-B',
        discordUserId: 'discord-b',
        gender: 'male',
        languages: ['Spanish'],
      }),
      blocks
    );
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('NO_COMMON_LANGUAGE');
  });

  it('matches users regardless of legacy gender preferences', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ gender: 'female', preferredGender: ['male'] }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', gender: 'male', preferredGender: ['female'] })
    );
    expect(result.isEligible).toBe(true);
    expect(result.reasons).toContain('MUTUAL_COMPATIBILITY_CONFIRMED');
  });

  it('rejects a pair when either preloaded block list contains the other user', async () => {
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>(['user-a'])],
    ]);
    const result = await matchmakingEngine.evaluateMatch(
      ticket(),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', gender: 'male' }),
      blocks
    );
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('USER_BLOCKED');
  });


  it('fails closed when a preloaded block-list snapshot is incomplete', async () => {
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
    ]);
    const result = await matchmakingEngine.evaluateMatch(
      ticket(),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b' }),
      blocks
    );
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('BLOCK_LIST_UNAVAILABLE');
  });

  it('rejects malformed mutual age preferences instead of silently widening them', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ minAgePref: 35, maxAgePref: 20 }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b' }),
      new Map([
        ['user-a', new Set<string>()],
        ['user-b', new Set<string>()],
      ])
    );
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('INVALID_PROFILE');
  });

  it('normalizes duplicate and case-varied interests before scoring', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ interests: ['Music', 'music', ' Gaming '] }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', interests: ['MUSIC', 'Travel'] }),
      new Map([
        ['user-a', new Set<string>()],
        ['user-b', new Set<string>()],
      ])
    );
    expect(result.isEligible).toBe(true);
    expect(result.sharedInterests).toEqual(['music']);
    expect(result.score).toBe(67);
  });

  it('selects randomly among all eligible partners instead of always choosing the first', async () => {
    const first = ticket({ interests: ['music'] });
    const second = ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', interests: ['sports'] });
    const third = ticket({ userId: 'user-c', destinyId: 'DEST-C', discordUserId: 'discord-c', interests: ['travel'] });
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
      ['user-c', new Set<string>()],
    ]);
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.1);
    try {
      const match = await matchmakingEngine.findRandomMatch(first, [second, third], blocks);
      expect(match?.partner.userId).toBe('user-c');
    } finally {
      random.mockRestore();
    }
  });


  it('blocks cross-server candidates when either guild opts out', async () => {
    const settings = vi.spyOn(db, 'getGuildSettings').mockImplementation(async (guildId: string) => ({
      guildId,
      crossServerEnabled: guildId !== 'guild-a',
    } as any));
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
    ]);
    try {
      const match = await matchmakingEngine.findRandomMatch(
        ticket({ guildId: 'guild-a' }),
        [ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', guildId: 'guild-b' })],
        blocks
      );
      expect(match).toBeNull();
    } finally {
      settings.mockRestore();
    }
  });

  it('does not pair a guild-scoped ticket with a ticket lacking guild attribution', async () => {
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
    ]);
    const match = await matchmakingEngine.findRandomMatch(
      ticket({ guildId: 'guild-a' }),
      [ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b' })],
      blocks
    );
    expect(match).toBeNull();
  });

  it('still allows same-guild matching when cross-server discovery is disabled', async () => {
    const settings = vi.spyOn(db, 'getGuildSettings').mockResolvedValue({
      guildId: 'guild-a',
      crossServerEnabled: false,
    } as any);
    const blocks = new Map<string, ReadonlySet<string>>([
      ['user-a', new Set<string>()],
      ['user-b', new Set<string>()],
    ]);
    try {
      const match = await matchmakingEngine.findRandomMatch(
        ticket({ guildId: 'guild-a' }),
        [ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', guildId: 'guild-a' })],
        blocks
      );
      expect(match?.partner.userId).toBe('user-b');
    } finally {
      settings.mockRestore();
    }
  });

  it('rejects mutually incompatible age ranges', async () => {
    const result = await matchmakingEngine.evaluateMatch(
      ticket({ minAgePref: 30, maxAgePref: 40 }),
      ticket({ userId: 'user-b', destinyId: 'DEST-B', discordUserId: 'discord-b', age: 25 })
    );
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('AGE_INCOMPATIBLE');
  });
});
