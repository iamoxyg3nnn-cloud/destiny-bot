import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { streakService } from '../../src/core/economy/streaks.js';
import { v4 as uuidv4 } from 'uuid';

describe('Destiny Coins Wallet & Idempotency Tests', () => {
  let testUserId: string;

  afterAll(async () => {
    if ((db as any).client) {
      await (db as any).client.from('users').delete().like('discord_user_id', 'test_wallet_%');
    }
  });

  beforeEach(async () => {
    const user = await db.createOrUpdateUser({
      discordUserId: `test_wallet_${Date.now()}_${Math.random()}`,
      age: 21,
      gender: 'male',
    });
    testUserId = user.id;
  });

  it('should initialize user with 100 welcome Destiny Coins', async () => {
    const user = await db.getUserById(testUserId);
    expect(user?.destinyCoins).toBe(100);
  });

  it('should execute valid atomic credit and debit transactions', async () => {
    const creditRef = `test:credit:${uuidv4()}`;
    const creditRes = await db.executeCoinTransaction(testUserId, 50, 'room_milestone', creditRef);
    expect(creditRes.success).toBe(true);
    expect(creditRes.newBalance).toBe(150);

    const debitRef = `test:debit:${uuidv4()}`;
    const debitRes = await db.executeCoinTransaction(testUserId, -30, 'shop_purchase', debitRef);
    expect(debitRes.success).toBe(true);
    expect(debitRes.newBalance).toBe(120);
  });

  it('should reject transactions that would cause a negative balance', async () => {
    const excessiveDebitRef = `test:debit:fail:${uuidv4()}`;
    const res = await db.executeCoinTransaction(testUserId, -5000, 'shop_purchase', excessiveDebitRef);
    expect(res.success).toBe(false);
    expect(res.error).toBe('INSUFFICIENT_FUNDS');

    // Balance should remain unmutated
    const user = await db.getUserById(testUserId);
    expect(user?.destinyCoins).toBe(100);
  });

  it('should be strictly idempotent: duplicate referenceId is not charged twice', async () => {
    const uniqueRef = `idempotent:bet:${uuidv4()}`;

    // First call charges 40 DC
    const firstCall = await db.executeCoinTransaction(testUserId, -40, 'shop_purchase', uniqueRef);
    expect(firstCall.success).toBe(true);
    expect(firstCall.newBalance).toBe(60);

    // Second call with same referenceId must NOT deduct again
    const secondCall = await db.executeCoinTransaction(testUserId, -40, 'shop_purchase', uniqueRef);
    expect(secondCall.success).toBe(true);
    expect(secondCall.newBalance).toBe(60);

    // Verify balance is still 60
    const user = await db.getUserById(testUserId);
    expect(user?.destinyCoins).toBe(60);
  });

  it('should enforce 24h daily streak reward cooldown and prevent duplicate claims', async () => {
    const firstClaim = await streakService.claimDaily(testUserId);
    expect(firstClaim.success).toBe(true);
    expect(firstClaim.newStreak).toBe(1);
    expect(firstClaim.rewardDc).toBe(50); // Base reward

    // Immediate second claim must be rejected by cooldown
    const secondClaim = await streakService.claimDaily(testUserId);
    expect(secondClaim.success).toBe(false);
    expect(secondClaim.message).toContain('already claimed');
    expect(secondClaim.rewardDc).toBe(0);
  });
});
