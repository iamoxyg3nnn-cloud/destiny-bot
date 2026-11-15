import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { matchmakingManager } from '../../src/core/matchmaking/manager.js';
import { proposalManager } from '../../src/core/matchmaking/proposal.js';
import { sanitizer } from '../../src/core/sanitizer.js';
import { revealService } from '../../src/core/moderation/reveal.js';
import { UserProfile } from '../../src/core/types.js';

describe('Website Commands End-to-End Flow Integration', () => {
  const discordA = '111122223333444455';
  const discordB = '555544443333222211';
  let profileA: UserProfile;
  let profileB: UserProfile;

  beforeEach(async () => {
    profileA = await db.createOrUpdateUser({
      discordUserId: discordA,
      age: 21,
      gender: 'female',
      interests: ['music', 'anime', 'gaming'],
      languages: ['en'],
    });

    profileB = await db.createOrUpdateUser({
      discordUserId: discordB,
      age: 23,
      gender: 'male',
      interests: ['gaming', 'coding', 'music'],
      languages: ['en'],
    });
  });

  it('successfully completes the full lifecycle: /application -> /find match -> proposal accept -> relay -> /cancel match', async () => {
    // 1. /application check
    expect(profileA).toBeDefined();
    expect(profileB).toBeDefined();
    expect(profileA.destinyId).toBeDefined();
    expect(profileB.destinyId).toBeDefined();

    // 2. /find match -> join queue
    const joinResA = await matchmakingManager.joinQueue(profileA);
    const joinResB = await matchmakingManager.joinQueue(profileB);
    expect(joinResA.success).toBe(true);
    expect(joinResB.success).toBe(true);

    // 3. Proposal Phase
    const proposal = await proposalManager.createProposal(
      joinResA.ticket!,
      joinResB.ticket!,
      ['music', 'gaming']
    );
    expect(proposal).toBeDefined();
    expect(proposal?.sharedInterests).toContain('gaming');

    // 4. Accept Proposal
    const resA = await proposalManager.handleAccept(proposal!.id, profileA.id);
    expect(resA.status).toBe('waiting');

    const resB = await proposalManager.handleAccept(proposal!.id, profileB.id);
    expect(resB.status).toBe('accepted');
    expect(resB.room).toBeDefined();
    expect(resB.room?.status).toBe('active');

    const activeRoom = resB.room!;

    // 5. Chat Sanitization & Relay simulation
    const rawMsg = 'Hey partner! Join https://discord.gg/invite123 and check <@123456789012345678>!';
    const result = sanitizer.sanitize(rawMsg);
    expect(result.sanitizedText).not.toContain('discord.gg/invite123');
    expect(result.sanitizedText).not.toContain('<@123456789012345678>');
    expect(result.sanitizedText).toContain('`[Invite Link Removed]`');
    expect(result.sanitizedText).toContain('@User');

    // 6. Mutual Reveal (/user reveal)
    const revealA = await revealService.submitConsent(activeRoom.id, profileA.id, ['interests', 'age', 'destinyId']);
    expect(revealA.completed).toBe(false);

    const revealB = await revealService.submitConsent(activeRoom.id, profileB.id, ['destinyId', 'age']);
    expect(revealB.completed).toBe(true);
    // Intersection: only fields BOTH selected are agreed
    expect(revealB.agreedFields).toContain('destinyId');
    expect(revealB.agreedFields).toContain('age');
    expect(revealB.agreedFields).not.toContain('interests'); // User B didn't choose interests

    // 7. /cancel match (End room cleanly)
    await db.endRoom(activeRoom.id, 'user_left');
    const endedRoom = await db.getRoomById(activeRoom.id);
    expect(endedRoom?.status).toBe('ended');
    expect(endedRoom?.endReason).toBe('user_left');
  });
});
