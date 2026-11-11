import { describe, expect, it, vi } from 'vitest';
import { Client } from 'discord.js';
import { checkEclairsMembership, ECLAIRS_GUILD_IDS } from '../../src/core/moderation/reputation.js';

function makeClient(memberFetch: (userId: string) => Promise<any>): Client {
  const cache = new Map<string, any>();
  for (const guildId of ECLAIRS_GUILD_IDS) {
    cache.set(guildId, {
      id: guildId,
      members: { fetch: vi.fn(memberFetch) },
    });
  }

  return {
    guilds: {
      cache,
      fetch: vi.fn(),
    },
  } as unknown as Client;
}

describe('Eclairs membership verification', () => {
  it('returns true when the user is confirmed in any accepted Eclairs guild', async () => {
    const member = { id: '12345678901234567' };
    const client = makeClient(async () => member);

    await expect(checkEclairsMembership(client, member.id)).resolves.toBe(true);
  });

  it('returns false only when every accepted guild definitively reports unknown member', async () => {
    const client = makeClient(async () => {
      throw Object.assign(new Error('Unknown Member'), { code: 10007 });
    });

    await expect(checkEclairsMembership(client, '12345678901234567')).resolves.toBe(false);
  });

  it('returns null when Discord access or the membership lookup is inconclusive', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
      throw Object.assign(new Error('Missing Access'), { code: 50001 });
    });

    await expect(checkEclairsMembership(client, '12345678901234567')).resolves.toBeNull();
  });

  it('does not report non-membership when the bot cannot fetch a configured guild', async () => {
    const client = {
      guilds: {
        cache: new Map(),
        fetch: vi.fn(async () => {
          throw Object.assign(new Error('Missing Access'), { code: 50001 });
        }),
      },
    } as unknown as Client;

    await expect(checkEclairsMembership(client, '12345678901234567')).resolves.toBeNull();
  });
});
