import { describe, expect, it } from 'vitest';
import { isBanActive } from '../../src/core/moderation/ban-policy.js';

describe('isBanActive', () => {
  const now = Date.parse('2026-11-12T12:00:00.000Z');

  it('returns false when the user is not banned', () => {
    expect(isBanActive(false, null, now)).toBe(false);
  });

  it('treats a ban without an expiry as permanent', () => {
    expect(isBanActive(true, null, now)).toBe(true);
  });

  it('keeps a future temporary ban active', () => {
    expect(isBanActive(true, '2026-11-12T12:00:01.000Z', now)).toBe(true);
  });

  it('automatically expires a temporary ban at its expiry time', () => {
    expect(isBanActive(true, '2026-11-12T12:00:00.000Z', now)).toBe(false);
  });

  it('fails closed when the expiry timestamp is malformed', () => {
    expect(isBanActive(true, 'not-a-date', now)).toBe(true);
  });
});
