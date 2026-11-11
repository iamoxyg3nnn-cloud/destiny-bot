import { describe, expect, it } from 'vitest';
import { parseCronClock } from '../../src/workers/notification.worker.js';

describe('daily reminder cron parsing', () => {
  it('parses a numeric minute and hour', () => {
    expect(parseCronClock('30 19 * * *')).toBe(19 * 60 + 30);
  });

  it('supports midnight and the last minute of the day', () => {
    expect(parseCronClock('0 0 * * *')).toBe(0);
    expect(parseCronClock('59 23 * * *')).toBe(23 * 60 + 59);
  });

  it('rejects out-of-range or malformed clock fields', () => {
    expect(parseCronClock('60 19 * * *')).toBeNull();
    expect(parseCronClock('30 24 * * *')).toBeNull();
    expect(parseCronClock('')).toBeNull();
    expect(parseCronClock('30 19 * *')).toBeNull();
  });

  it('rejects unsupported cron syntax rather than silently scheduling a different time', () => {
    expect(parseCronClock('*/5 * * * *')).toBeNull();
    expect(parseCronClock('0 9 1 * *')).toBeNull();
  });
});
