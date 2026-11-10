import { describe, it, expect } from 'vitest';
import { ActivityType } from 'discord.js';
import { DESTINY_STATUSES, pickRandomStatusIndex, setStreamingPresence } from '../../src/bot/presence-manager.js';

/**
 * Minimal stand-in for a discord.js Client — the presence manager only
 * touches `user.id`, `user.setPresence`, `guilds.cache` and `isReady()`.
 */
function fakeClient(id: string, guilds = 3) {
  const guildCache = new Map();
  for (let i = 0; i < guilds; i++) guildCache.set(`g${i}`, { memberCount: 100 });
  const sent: any[] = [];
  return {
    user: {
      id,
      setPresence: (p: any) => sent.push(p),
    },
    guilds: { cache: guildCache },
    isReady: () => true,
    sent,
  } as any;
}

describe('Destiny Rotating Presence', () => {
  it('should use a supported streaming URL so Discord displays the Streaming badge', () => {
    const client = fakeClient('client_stream');
    setStreamingPresence(client, 'Live status');

    const [activity] = client.sent[0].activities;
    expect(activity.type).toBe(ActivityType.Streaming);
    expect(activity.url).toMatch(/^https:\/\/(www\.)?(twitch\.tv|youtube\.com)\//);
  });

  it('should expose a rich set of rotating statuses', () => {
    expect(DESTINY_STATUSES.length).toBeGreaterThanOrEqual(100);
    // Every status is non-empty and reasonably short for Discord.
    for (const s of DESTINY_STATUSES) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(128);
    }
  });

  it('should support the {members} and {servers} placeholders', () => {
    const withMembers = DESTINY_STATUSES.filter((s) => s.includes('{members}'));
    const withServers = DESTINY_STATUSES.filter((s) => s.includes('{servers}'));
    expect(withMembers.length).toBeGreaterThan(0);
    expect(withServers.length).toBeGreaterThan(0);
  });

  it('should never repeat a status across consecutive rotations of one client', () => {
    const client = fakeClient('client_a');
    const picked: number[] = [];
    for (let i = 0; i < 25; i++) picked.push(pickRandomStatusIndex(client));
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i]).not.toBe(picked[i - 1]);
    }
  });

  it('should not collide with a status already shown by another client', () => {
    const clientA = fakeClient('client_a');
    const clientB = fakeClient('client_b');

    const a = pickRandomStatusIndex(clientA);
    const b = pickRandomStatusIndex(clientB);
    expect(b).not.toBe(a);
  });

  it('should keep several clients on distinct statuses', () => {
    const clients = ['c1', 'c2', 'c3', 'c4'].map((id) => fakeClient(id));
    const picked = clients.map((c) => pickRandomStatusIndex(c));
    expect(new Set(picked).size).toBe(picked.length);
  });
});
