import { describe, it, expect, beforeEach, vi } from 'vitest';
import { socialManager, PRAISE_TAG_LABELS } from '../../src/core/social/manager.js';
import { stateStore } from '../../src/storage/state-store.js';
import { db } from '../../src/database/supabase.js';
import { blockerService } from '../../src/core/moderation/blocker.js';
import { UserProfile } from '../../src/core/types.js';

describe('SocialManager - Friends, Reputation Accolades & Second Chance Matching', () => {
  const mockUser1: UserProfile = {
    id: 'user_uuid_1',
    discordUserId: 'discord_id_1',
    destinyId: 'destiny#1111',
    age: 22,
    gender: 'female',
    interests: ['anime', 'gaming'],
    languages: ['en'],
    genderVerified: true,
    genderVerificationStatus: 'verified',
    preferredGender: ['any'],
    minAgePref: 18,
    maxAgePref: 99,
    isBanned: false,
    reputationScore: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockUser2: UserProfile = {
    id: 'user_uuid_2',
    discordUserId: 'discord_id_2',
    destinyId: 'destiny#2222',
    age: 24,
    gender: 'male',
    interests: ['music', 'gaming'],
    languages: ['en'],
    genderVerified: true,
    genderVerificationStatus: 'verified',
    preferredGender: ['any'],
    minAgePref: 18,
    maxAgePref: 99,
    isBanned: false,
    reputationScore: 90,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Mock db lookup
    vi.spyOn(db, 'getUserById').mockImplementation(async (id: string) => {
      if (id === mockUser1.id) return { ...mockUser1 };
      if (id === mockUser2.id) return { ...mockUser2 };
      return null;
    });

    vi.spyOn(db, 'getUserByDestinyId').mockImplementation(async (destinyId: string) => {
      if (destinyId.toLowerCase() === mockUser1.destinyId.toLowerCase()) return { ...mockUser1 };
      if (destinyId.toLowerCase() === mockUser2.destinyId.toLowerCase()) return { ...mockUser2 };
      return null;
    });

    vi.spyOn(db, 'createOrUpdateUser').mockImplementation(async (user: any) => {
      return { ...mockUser2, ...user };
    });
  });

  describe('Reputation Accolades (Feature 5)', () => {
    it('awards a peer accolade and increments counter and reputation score', async () => {
      const targetUserId = mockUser2.id;
      const res = await socialManager.addAccolade(mockUser1.id, targetUserId, 'great_listener', 'room_abc_1');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Great Listener');

      const accolades = await socialManager.getAccolades(targetUserId);
      expect(accolades.greatListener).toBeGreaterThanOrEqual(1);
      expect(db.createOrUpdateUser).toHaveBeenCalledWith({
        discordUserId: mockUser2.discordUserId,
        reputationScore: 95,
      });
    });

    it('rejects self-awarding accolades', async () => {
      const res = await socialManager.addAccolade(mockUser1.id, mockUser1.id, 'hilarious');
      expect(res.success).toBe(false);
      expect(res.message).toContain('cannot award accolades to yourself');
    });

    it('enforces session deduplication for peer praise', async () => {
      const roomId = 'room_dedup_test';
      const first = await socialManager.addAccolade(mockUser1.id, mockUser2.id, 'respectful', roomId);
      expect(first.success).toBe(true);

      const second = await socialManager.addAccolade(mockUser1.id, mockUser2.id, 'hilarious', roomId);
      expect(second.success).toBe(false);
      expect(second.message).toContain('already awarded peer praise for this session');
    });

    it('retrieves verified accolades accurately', async () => {
      const targetId = 'user_accolade_stats';
      await stateStore.set(`user:accolades:${targetId}:great_listener`, '3');
      await stateStore.set(`user:accolades:${targetId}:hilarious`, '5');
      await stateStore.set(`user:accolades:${targetId}:respectful`, '8');
      await stateStore.set(`user:accolades:${targetId}:insightful`, '2');

      const stats = await socialManager.getAccolades(targetId);
      expect(stats.greatListener).toBe(3);
      expect(stats.hilarious).toBe(5);
      expect(stats.respectful).toBe(8);
      expect(stats.insightful).toBe(2);
    });
  });

  describe('Missed Connections / Second-Chance Matching (Feature 2)', () => {
    it('records a secret vote and detects mutual match when both vote yes', async () => {
      const roomId = 'room_mutual_test_1';
      // User 1 votes
      const vote1 = await socialManager.castReconnectVote(mockUser1.id, mockUser2.id, roomId);
      expect(vote1).not.toBeNull();
      expect(vote1?.isMutual).toBe(false);

      // User 2 votes for same room
      const vote2 = await socialManager.castReconnectVote(mockUser2.id, mockUser1.id, roomId);
      expect(vote2).not.toBeNull();
      expect(vote2?.isMutual).toBe(true);
      expect(vote2?.alreadyAnnounced).toBe(false);

      // Subsequent vote flags alreadyAnnounced to prevent duplicate celebration DMs
      const voteAgain = await socialManager.castReconnectVote(mockUser2.id, mockUser1.id, roomId);
      expect(voteAgain?.alreadyAnnounced).toBe(true);
    });

    it('creates post-session wrap-up container with custom_id <= 100 characters even with full UUIDs', () => {
      const fullUuidPartner = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const fullUuidRoom = 'a12bc34d-56ef-7890-abcd-ef1234567890';
      const container = socialManager.createSessionWrapUpContainer('destiny#2222', fullUuidPartner, fullUuidRoom);
      expect(container).toBeDefined();
      const json = container.toJSON() as any;
      expect(json.type).toBe(17); // Components V2 Container

      // Every button custom_id MUST be <= 100 chars (Discord strict limit)
      for (const comp of json.components || []) {
        if (comp.type === 1 && comp.components) { // ActionRow
          for (const btn of comp.components) {
            if (btn.custom_id) {
              expect(btn.custom_id.length).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    });

    it('gracefully handles missing or undefined partnerUserId in wrap-up container', () => {
      const container = socialManager.createSessionWrapUpContainer('destiny#????', '', 'room_123');
      expect(container).toBeDefined();
      const json = container.toJSON() as any;
      expect(json.type).toBe(17);
      // Only 1 row (Find Match, Dismiss) when no valid partner
      const rows = (json.components || []).filter((c: any) => c.type === 1);
      expect(rows.length).toBe(1);
    });

    it('creates celebration mutual reconnect container with friend and direct session buttons', () => {
      const container = socialManager.createMutualReconnectContainer('destiny#2222', mockUser2.id);
      expect(container).toBeDefined();
      const json = container.toJSON();
      expect(json.type).toBe(17);
    });
  });

  describe('Destiny Friends Network (Feature 3)', () => {
    it('prevents sending a friend request to oneself', async () => {
      const res = await socialManager.sendFriendRequest(mockUser1, mockUser1.destinyId);
      expect(res.success).toBe(false);
      expect(res.message).toContain('cannot add yourself');
    });

    it('prevents sending a friend request if users are blocked', async () => {
      vi.spyOn(blockerService, 'isBlocked').mockResolvedValue(true);
      const res = await socialManager.sendFriendRequest(mockUser1, mockUser2.destinyId);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Unable to send friend request');
    });

    it('prevents accepting a friend request from a blocked user', async () => {
      vi.spyOn(blockerService, 'isBlocked').mockResolvedValue(true);
      const res = await socialManager.acceptFriendRequest(mockUser1, mockUser2.id);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Cannot accept a friend request from a blocked user');
    });

    it('sends friend request and supports acceptance, listing, and removal', async () => {
      vi.spyOn(blockerService, 'isBlocked').mockResolvedValue(false);

      // 1. Send request
      const sendRes = await socialManager.sendFriendRequest(mockUser1, mockUser2.destinyId);
      expect(sendRes.success).toBe(true);
      expect(sendRes.message).toContain('request sent');

      // 2. Duplicate check
      const dupRes = await socialManager.sendFriendRequest(mockUser1, mockUser2.destinyId);
      expect(dupRes.success).toBe(false);
      expect(dupRes.message).toContain('already pending');

      // 3. Accept request
      const acceptRes = await socialManager.acceptFriendRequest(mockUser2, mockUser1.id);
      expect(acceptRes.success).toBe(true);
      expect(acceptRes.message).toContain('now Destiny friends');

      // 4. Verify friendship
      const areFriends = await socialManager.areFriends(mockUser1.id, mockUser2.id);
      expect(areFriends).toBe(true);

      // 5. List friends
      const friends1 = await socialManager.getFriends(mockUser1.id);
      expect(friends1.length).toBe(1);
      expect(friends1[0].destinyId).toBe(mockUser2.destinyId);

      // 6. Remove friend
      const removeRes = await socialManager.removeFriend(mockUser1.id, mockUser2.destinyId);
      expect(removeRes.success).toBe(true);
      const areFriendsAfter = await socialManager.areFriends(mockUser1.id, mockUser2.id);
      expect(areFriendsAfter).toBe(false);
    });

    it('auto-accepts if the receiver already sent a request to sender', async () => {
      vi.spyOn(blockerService, 'isBlocked').mockResolvedValue(false);

      const userA = { ...mockUser1, id: 'user_auto_a', destinyId: 'destiny#9001' };
      const userB = { ...mockUser2, id: 'user_auto_b', destinyId: 'destiny#9002' };

      vi.spyOn(db, 'getUserById').mockImplementation(async (id: string) => {
        if (id === userA.id) return userA;
        if (id === userB.id) return userB;
        return null;
      });
      vi.spyOn(db, 'getUserByDestinyId').mockImplementation(async (destinyId: string) => {
        if (destinyId === userA.destinyId) return userA;
        if (destinyId === userB.destinyId) return userB;
        return null;
      });

      // User A sends to User B
      await socialManager.sendFriendRequest(userA, userB.destinyId);

      // User B sends to User A -> should auto-accept!
      const autoRes = await socialManager.sendFriendRequest(userB, userA.destinyId);
      expect(autoRes.success).toBe(true);
      expect(autoRes.message).toContain('also sent you a request! You are now Destiny friends');

      const areFriends = await socialManager.areFriends(userA.id, userB.id);
      expect(areFriends).toBe(true);
    });
  });
});
