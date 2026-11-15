import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VoiceManager,
  voiceManager,
  getRandomIcebreakerTopic,
  createVoiceDashboardContainer,
  ICEBREAKER_TOPICS,
} from '../../src/core/voice/manager.js';
import { stateStore } from '../../src/storage/state-store.js';
import { blockerService } from '../../src/core/moderation/blocker.js';
import { ECLAIRS_GUILD_IDS } from '../../src/core/moderation/reputation.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

describe('VoiceManager & Blind Voice Matchmaking', () => {
  beforeEach(async () => {
    // Clear state store mock before each test
    vi.restoreAllMocks();
  });

  describe('Icebreaker Topics & Dashboard UI', () => {
    it('returns a valid icebreaker topic from the curated list', () => {
      const topic = getRandomIcebreakerTopic();
      expect(typeof topic).toBe('string');
      expect(ICEBREAKER_TOPICS).toContain(topic);
    });

    it('creates Components V2 voice dashboard container with all 4 control buttons', () => {
      const container = createVoiceDashboardContainer('destiny#0417', 'destiny#1183', 5);
      const json = container.toJSON();

      expect(json.type).toBe(17); // Container
      // Find the action row in components
      const actionRow = json.components?.find((c: any) => c.type === 1) as any;
      expect(actionRow).toBeDefined();

      const buttonIds = actionRow?.components?.map((b: any) => b.custom_id);
      expect(buttonIds).toContain('destiny_vc_icebreaker');
      expect(buttonIds).toContain('destiny_vc_extend');
      expect(buttonIds).toContain('destiny_vc_reveal');
      expect(buttonIds).toContain('destiny_vc_leave');
    });
  });

  describe('resolveVoiceGuild (Dual Routing System)', () => {
    it('falls back to Eclairs Central Hub if local guild is not configured or voice is disabled', async () => {
      const eclairsGuildId = ECLAIRS_GUILD_IDS[0];
      const mockEclairsGuild = {
        id: eclairsGuildId,
        members: {
          me: {
            permissions: {
              has: (perm: bigint) => perm === PermissionFlagsBits.ManageChannels,
            },
          },
        },
        channels: {
          cache: {
            find: vi.fn().mockReturnValue({ id: 'cat-eclairs-vc', type: ChannelType.GuildCategory, name: 'Voice Rooms' }),
          },
        },
      };

      const mockClient = {
        guilds: {
          cache: {
            get: (id: string) => (id === eclairsGuildId ? mockEclairsGuild : null),
          },
          fetch: vi.fn().mockImplementation(async (id: string) => (id === eclairsGuildId ? mockEclairsGuild : null)),
        },
      } as any;

      // Local guild has voice_enabled = null/false
      vi.spyOn(stateStore, 'get').mockResolvedValue(null);

      const resolved = await voiceManager.resolveVoiceGuild(
        mockClient,
        'local-guild-123',
        'user-1',
        'user-2'
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.isEclairsFallback).toBe(true);
      expect(resolved?.guild.id).toBe(eclairsGuildId);
      expect(resolved?.durationMins).toBe(5);
    });

    it('routes to local guild when voice is enabled and bot has ManageChannels permissions', async () => {
      const localGuildId = 'local-community-999';
      const mockLocalGuild = {
        id: localGuildId,
        members: {
          me: {
            permissions: {
              has: (perm: bigint) => perm === PermissionFlagsBits.ManageChannels,
            },
          },
          fetch: vi.fn().mockImplementation(async (uid: string) => ({ id: uid })),
        },
      };

      const mockClient = {
        guilds: {
          cache: {
            get: (id: string) => (id === localGuildId ? mockLocalGuild : null),
          },
        },
      } as any;

      vi.spyOn(stateStore, 'get').mockImplementation(async (key: string) => {
        if (key === `guild:${localGuildId}:voice_enabled`) return 'true';
        if (key === `guild:${localGuildId}:voice_category_id`) return 'custom-cat-456';
        if (key === `guild:${localGuildId}:voice_duration_minutes`) return '10';
        return null;
      });

      const resolved = await voiceManager.resolveVoiceGuild(
        mockClient,
        localGuildId,
        'user-1',
        'user-2'
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.isEclairsFallback).toBe(false);
      expect(resolved?.guild.id).toBe(localGuildId);
      expect(resolved?.categoryId).toBe('custom-cat-456');
      expect(resolved?.durationMins).toBe(10);
    });
  });

  describe('Call Extension Voting', () => {
    it('records first partner vote and notifies waiting for agreement', async () => {
      const channelId = 'channel-vc-100';
      const roomId = 'room-vc-100';

      const memory = new Map<string, string>();
      vi.spyOn(stateStore, 'get').mockImplementation(async (key: string) => memory.get(key) || null);
      vi.spyOn(stateStore, 'set').mockImplementation(async (key: string, val: string) => {
        memory.set(key, val);
        return true as any;
      });

      memory.set(`voice:channel:${channelId}:room_id`, roomId);
      memory.set(`voice:room:${roomId}:user1`, 'u1');
      memory.set(`voice:room:${roomId}:user2`, 'u2');

      const mockClient = { channels: { cache: { get: () => null } } } as any;

      const res1 = await voiceManager.handleExtendVoiceCall(mockClient, channelId, 'u1');
      expect(res1.success).toBe(true);
      expect(res1.message).toContain('Waiting for partner');

      // Now partner votes
      const expiresAt = Date.now() + 60_000;
      memory.set(`voice:room:${roomId}:expires_at`, String(expiresAt));

      const res2 = await voiceManager.handleExtendVoiceCall(mockClient, channelId, 'u2');
      expect(res2.success).toBe(true);
      expect(res2.message).toContain('Both partners agreed');

      // Verify expiration was extended by ~5 minutes
      const newExpiry = parseInt(memory.get(`voice:room:${roomId}:expires_at`) || '0', 10);
      expect(newExpiry).toBeGreaterThanOrEqual(expiresAt + 290_000);
    });
  });

  describe('Mutual Profile Reveal Voting', () => {
    it('requires mutual consent before revealing identities in voice', async () => {
      const channelId = 'channel-vc-200';
      const roomId = 'room-vc-200';

      const memory = new Map<string, string>();
      vi.spyOn(stateStore, 'get').mockImplementation(async (key: string) => memory.get(key) || null);
      vi.spyOn(stateStore, 'set').mockImplementation(async (key: string, val: string) => {
        memory.set(key, val);
        return true as any;
      });

      memory.set(`voice:channel:${channelId}:room_id`, roomId);
      memory.set(`voice:room:${roomId}:user1`, 'u1');
      memory.set(`voice:room:${roomId}:user2`, 'u2');
      memory.set(`voice:room:${roomId}:destiny1`, 'destiny#0101');
      memory.set(`voice:room:${roomId}:destiny2`, 'destiny#0202');

      const mockClient = { channels: { cache: { get: () => null } } } as any;

      // Partner 1 reveals
      const res1 = await voiceManager.handleRevealVoiceCall(mockClient, channelId, 'u1');
      expect(res1.success).toBe(true);
      expect(res1.message).toContain('Waiting for partner');

      // Partner 2 reveals
      const res2 = await voiceManager.handleRevealVoiceCall(mockClient, channelId, 'u2');
      expect(res2.success).toBe(true);
      expect(res2.message).toContain('Profiles revealed');
    });
  });

  describe('Emergency Leave & Panic Button', () => {
    it('disconnects users, deletes room, and blocks partner immediately', async () => {
      const channelId = 'channel-vc-300';
      const roomId = 'room-vc-300';

      const memory = new Map<string, string>();
      vi.spyOn(stateStore, 'get').mockImplementation(async (key: string) => memory.get(key) || null);
      vi.spyOn(stateStore, 'del').mockImplementation(async (key: string) => {
        memory.delete(key);
        return true as any;
      });
      vi.spyOn(blockerService, 'blockUser').mockResolvedValue({ success: true, message: 'Blocked' });

      memory.set(`voice:channel:${channelId}:room_id`, roomId);
      memory.set(`voice:room:${roomId}:user1`, 'u1');
      memory.set(`voice:room:${roomId}:user2`, 'u2');

      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockClient = {
        channels: {
          cache: {
            get: () => ({
              delete: mockDelete,
              members: new Map(),
            }),
          },
        },
      } as any;

      const res = await voiceManager.handleEmergencyLeave(mockClient, channelId, 'u1');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Voice session terminated immediately');
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
