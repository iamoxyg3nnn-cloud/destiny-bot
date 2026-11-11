import { describe, expect, it } from 'vitest';
import { isReputationRestriction } from '../../src/core/moderation/reputation.js';

describe('reputation restriction recovery eligibility', () => {
  it('recognizes only the system-issued reputation restriction reasons', () => {
    expect(isReputationRestriction({
      banReason: 'Low reputation (< 10). Join discord.gg/eclairs to regain access.',
    })).toBe(true);
    expect(isReputationRestriction({
      banReason: 'Left discord.gg/eclairs (Reputation dropped < 10)',
    })).toBe(true);
  });

  it('does not treat moderator bans mentioning reputation as recoverable', () => {
    expect(isReputationRestriction({
      banReason: 'Banned by moderator for reputation manipulation.',
    })).toBe(false);
    expect(isReputationRestriction({
      banReason: 'Admin moderation action',
    })).toBe(false);
    expect(isReputationRestriction({})).toBe(false);
    expect(isReputationRestriction(null)).toBe(false);
  });
});
