import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { streakService } from '../../src/core/economy/streaks.js';
import { UserProfile } from '../../src/core/types.js';

async function createUser(): Promise<UserProfile> {
  return db.createOrUpdateUser({
    discordUserId: `daily_claim_test_${Date.now()}_${Math.random()}`,
    age: 24,
    gender: 'male',
  });
}

describe('atomic daily reward claims', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not award two daily rewards for concurrent requests', async () => {
    const user = await createUser();

    const [first, second] = await Promise.all([
      streakService.claimDaily(user.id),
      streakService.claimDaily(user.id),
    ]);

    // The replay may also return success, but it must return the exact same
    // committed reward and must never credit the wallet a second time.
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.rewardDc).toBe(first.rewardDc);
    expect(second.newBalance).toBe(first.newBalance);
    const refreshed = await db.getUserById(user.id, true);
    expect(refreshed?.streakCount).toBe(1);
    expect(refreshed?.destinyCoins).toBe(150);
    expect(db.mockTransactions.filter((tx) =>
      tx.userId === user.id && tx.type === 'daily_reward'
    )).toHaveLength(1);
  });

  it('returns the prior committed result for the same idempotency key', async () => {
    const user = await createUser();
    const referenceId = `daily:${user.id}:retry-test`;

    const first = await db.claimDailyReward(user.id, referenceId);
    const replay = await db.claimDailyReward(user.id, referenceId);

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.rewardDc).toBe(first.rewardDc);
    expect(replay.newBalance).toBe(first.newBalance);
    expect(replay.newStreak).toBe(first.newStreak);
    expect(db.mockTransactions.filter((tx) => tx.referenceId === referenceId)).toHaveLength(1);
  });

  it('enforces the 24-hour cooldown even when a new idempotency key is used', async () => {
    const user = await createUser();
    const first = await db.claimDailyReward(user.id, `daily:${user.id}:first`);
    expect(first.success).toBe(true);

    const second = await db.claimDailyReward(user.id, `daily:${user.id}:second`);
    expect(second.success).toBe(false);
    expect(second.error).toBe('ALREADY_CLAIMED');
    expect(second.nextClaimAt).toBeDefined();
    expect((await db.getUserById(user.id, true))?.destinyCoins).toBe(150);
  });

  it('repairs the legacy split-write case when the ledger exists but the cooldown timestamp is missing', async () => {
    const user = await createUser();
    const referenceId = `daily:${user.id}:legacy-repair`;
    const tx = await db.executeCoinTransaction(user.id, 50, 'daily_reward', referenceId, { streak: 1 });
    expect(tx.success).toBe(true);

    const repaired = await db.claimDailyReward(user.id, referenceId);
    expect(repaired.success).toBe(true);
    const refreshed = await db.getUserById(user.id, true);
    expect(refreshed?.lastDailyClaim).toBeDefined();
    expect(refreshed?.streakCount).toBe(1);
    expect(refreshed?.destinyCoins).toBe(150);
    expect(db.mockTransactions.filter((entry) => entry.referenceId === referenceId)).toHaveLength(1);
  });
});
