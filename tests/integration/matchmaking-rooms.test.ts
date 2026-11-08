import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { matchmakingManager } from '../../src/core/matchmaking/manager.js';
import { matchmakingEngine } from '../../src/core/matchmaking/engine.js';
import { revealService } from '../../src/core/moderation/reveal.js';
import { blockerService } from '../../src/core/moderation/blocker.js';
import { MatchTicket } from '../../src/core/types.js';

describe('Matchmaking, Anonymous Rooms & Profile Reveal Integration Tests', () => {
  let userA: any;
  let userB: any;
  let userC: any;

  afterAll(async () => {
    if ((db as any).client) {
      await (db as any).client.from('users').delete().like('discord_user_id', 'discord_%');
    }
  });

  beforeEach(async () => {
    userA = await db.createOrUpdateUser({
      discordUserId: `discord_alice_${Date.now()}_${Math.random()}`,
      age: 22,
      gender: 'female',
      preferredGender: ['male', 'any'],
      languages: ['en'],
      interests: ['gaming', 'anime', 'synthwave'],
    });

    userB = await db.createOrUpdateUser({
      discordUserId: `discord_bob_${Date.now()}_${Math.random()}`,
      age: 24,
      gender: 'male',
      preferredGender: ['female', 'any'],
      languages: ['en'],
      interests: ['gaming', 'coding', 'synthwave'],
    });

    userC = await db.createOrUpdateUser({
      discordUserId: `discord_charlie_${Date.now()}_${Math.random()}`,
      age: 45,
      gender: 'male',
      preferredGender: ['female'],
      minAgePref: 40,
      maxAgePref: 55,
      languages: ['es'],
      interests: ['golf'],
    });
  });

  it('should evaluate compatibility accurately based on interests and criteria', async () => {
    const ticketA: MatchTicket = {
      userId: userA.id,
      destinyId: userA.destinyId,
      discordUserId: userA.discordUserId,
      age: userA.age,
      gender: userA.gender,
      preferredGender: userA.preferredGender,
      minAgePref: userA.minAgePref,
      maxAgePref: userA.maxAgePref,
      languages: userA.languages,
      interests: userA.interests,
      queuedAt: Date.now(),
    };

    const ticketB: MatchTicket = {
      userId: userB.id,
      destinyId: userB.destinyId,
      discordUserId: userB.discordUserId,
      age: userB.age,
      gender: userB.gender,
      preferredGender: userB.preferredGender,
      minAgePref: userB.minAgePref,
      maxAgePref: userB.maxAgePref,
      languages: userB.languages,
      interests: userB.interests,
      queuedAt: Date.now(),
    };

    const ticketC: MatchTicket = {
      userId: userC.id,
      destinyId: userC.destinyId,
      discordUserId: userC.discordUserId,
      age: userC.age,
      gender: userC.gender,
      preferredGender: userC.preferredGender,
      minAgePref: userC.minAgePref,
      maxAgePref: userC.maxAgePref,
      languages: userC.languages,
      interests: userC.interests,
      queuedAt: Date.now(),
    };

    // Alice and Bob share 'gaming' & 'synthwave', matching genders and age range -> COMPATIBLE
    const matchAB = await matchmakingEngine.evaluateMatch(ticketA, ticketB);
    expect(matchAB.isEligible).toBe(true);
    expect(matchAB.score).toBeGreaterThanOrEqual(70);
    expect(matchAB.sharedInterests).toEqual(expect.arrayContaining(['gaming', 'synthwave']));

    // Alice and Charlie have age and language mismatch -> INELIGIBLE
    const matchAC = await matchmakingEngine.evaluateMatch(ticketA, ticketC);
    expect(matchAC.isEligible).toBe(false);
  });

  it('should enforce global blocks and never pair blocked users', async () => {
    // Alice blocks Bob
    await blockerService.blockUser(userA.id, userB.id, 'Safety preference');

    const ticketA: MatchTicket = {
      userId: userA.id,
      destinyId: userA.destinyId,
      discordUserId: userA.discordUserId,
      age: userA.age,
      gender: userA.gender,
      preferredGender: userA.preferredGender,
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['gaming'],
      queuedAt: Date.now(),
    };

    const ticketB: MatchTicket = {
      userId: userB.id,
      destinyId: userB.destinyId,
      discordUserId: userB.discordUserId,
      age: userB.age,
      gender: userB.gender,
      preferredGender: userB.preferredGender,
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['gaming'],
      queuedAt: Date.now(),
    };

    const matchRes = await matchmakingEngine.evaluateMatch(ticketA, ticketB);
    expect(matchRes.isEligible).toBe(false);
    expect(matchRes.reasons).toContain('USER_BLOCKED');
  });

  it('should create an anonymous room with pseudonyms hiding real Discord identities', async () => {
    const ticketA: MatchTicket = {
      userId: userA.id,
      destinyId: userA.destinyId,
      discordUserId: userA.discordUserId,
      age: userA.age,
      gender: userA.gender,
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['coding'],
      queuedAt: Date.now(),
    };

    const ticketB: MatchTicket = {
      userId: userB.id,
      destinyId: userB.destinyId,
      discordUserId: userB.discordUserId,
      age: userB.age,
      gender: userB.gender,
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['coding'],
      queuedAt: Date.now(),
    };

    const room = await matchmakingManager.createMatchRoom(ticketA, ticketB);
    expect(room.id).toBeDefined();
    expect(room.roomCode).toMatch(/^ROOM-[A-F0-9]+/);
    expect(room.status).toBe('active');

    // Real usernames must not be used as pseudonyms
    expect(room.user1Pseudonym).not.toBe(userA.discordUserId);
    expect(room.user2Pseudonym).not.toBe(userB.discordUserId);
  });

  it('should handle mutual profile reveals safely: only agreed fields are revealed without race conditions', async () => {
    const ticketA: MatchTicket = {
      userId: userA.id,
      destinyId: userA.destinyId,
      discordUserId: userA.discordUserId,
      age: userA.age,
      gender: userA.gender,
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['gaming'],
      queuedAt: Date.now(),
    };
    const ticketB: MatchTicket = {
      userId: userB.id,
      destinyId: userB.destinyId,
      discordUserId: userB.discordUserId,
      age: userB.age,
      gender: userB.gender,
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      languages: ['en'],
      interests: ['gaming'],
      queuedAt: Date.now(),
    };

    const room = await matchmakingManager.createMatchRoom(ticketA, ticketB);

    // User A consents to: ['age', 'interests', 'discordTag']
    // User B consents to: ['age', 'interests'] (User B refuses discordTag)
    // Run both consents concurrently to simulate simultaneous clicks
    const [resA, resB] = await Promise.all([
      revealService.submitConsent(room.id, userA.id, ['age', 'interests', 'discordTag']),
      revealService.submitConsent(room.id, userB.id, ['age', 'interests']),
    ]);

    const completedResult = resA.completed ? resA : resB;
    expect(completedResult.completed).toBe(true);

    // Mutual intersection must ONLY be 'age' and 'interests'
    expect(completedResult.agreedFields).toContain('age');
    expect(completedResult.agreedFields).toContain('interests');
    expect(completedResult.agreedFields).not.toContain('discordTag');

    // Discord tag MUST NOT be revealed in data payloads
    expect(completedResult.user1Data?.discordTag).toBeUndefined();
    expect(completedResult.user2Data?.discordTag).toBeUndefined();
  });
});
