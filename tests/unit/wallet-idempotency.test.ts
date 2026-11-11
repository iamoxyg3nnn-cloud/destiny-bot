import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { streakService } from '../../src/core/economy/streaks.js';
import { walletService } from '../../src/core/economy/wallet.js';
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

  it('should reject reuse of a transaction idempotency key for a different operation', async () => {
    const reference = `idempotency-conflict:${uuidv4()}`;
    const first = await db.executeCoinTransaction(testUserId, -10, 'shop_purchase', reference);
    expect(first.success).toBe(true);

    const replayWithDifferentAmount = await db.executeCoinTransaction(testUserId, -20, 'shop_purchase', reference);
    const replayWithDifferentType = await db.executeCoinTransaction(testUserId, -10, 'admin_adjustment', reference);
    expect(replayWithDifferentAmount.success).toBe(false);
    expect(replayWithDifferentAmount.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(replayWithDifferentType.success).toBe(false);
    expect(replayWithDifferentType.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await walletService.getBalance(testUserId)).toBe(90);
  });

  it('should transfer coins atomically and replay idempotently', async () => {
    const recipient = await db.createOrUpdateUser({
      discordUserId: `test_wallet_recipient_${Date.now()}_${Math.random()}`,
      age: 22,
      gender: 'female',
    });
    const reference = `transfer-test:${uuidv4()}`;

    const first = await walletService.transfer(testUserId, recipient.id, 25, reference);
    expect(first.success).toBe(true);
    expect(await walletService.getBalance(testUserId)).toBe(75);
    expect(await walletService.getBalance(recipient.id)).toBe(125);

    const replay = await walletService.transfer(testUserId, recipient.id, 25, reference);
    expect(replay.success).toBe(true);
    expect(await walletService.getBalance(testUserId)).toBe(75);
    expect(await walletService.getBalance(recipient.id)).toBe(125);

    const debit = db.mockTransactions.find((tx) => tx.referenceId === `transfer:out:${reference}`);
    const credit = db.mockTransactions.find((tx) => tx.referenceId === `transfer:in:${reference}`);
    expect(debit?.type).toBe('transfer_sent');
    expect(credit?.type).toBe('transfer_received');

    const conflict = await walletService.transfer(testUserId, recipient.id, 30, reference);
    expect(conflict.success).toBe(false);
    expect(conflict.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await walletService.getBalance(testUserId)).toBe(75);
  });

  it('should reject invalid, fractional and self transfers without changing balances', async () => {
    const self = await walletService.transfer(testUserId, testUserId, 1, `self:${uuidv4()}`);
    const fractional = await walletService.transfer(testUserId, 'another-user', 1.5, `fraction:${uuidv4()}`);
    const invalid = await walletService.transfer(testUserId, 'another-user', Number.NaN, `nan:${uuidv4()}`);
    expect(self.success).toBe(false);
    expect(fractional.success).toBe(false);
    expect(invalid.success).toBe(false);
    expect(await walletService.getBalance(testUserId)).toBe(100);
  });

  it('should enforce the 24h daily streak cooldown without duplicating the reward', async () => {
    const firstClaim = await streakService.claimDaily(testUserId);
    expect(firstClaim.success).toBe(true);
    expect(firstClaim.newStreak).toBe(1);
    expect(firstClaim.rewardDc).toBe(50); // Base reward

    // Same-day retries reuse the stable daily idempotency key and return the
    // original claim result instead of attempting a second credit.
    const secondClaim = await streakService.claimDaily(testUserId);
    expect(secondClaim.success).toBe(true);
    expect(secondClaim.newStreak).toBe(firstClaim.newStreak);
    expect(secondClaim.rewardDc).toBe(firstClaim.rewardDc);
    expect(secondClaim.newBalance).toBe(firstClaim.newBalance);
    expect(await walletService.getBalance(testUserId)).toBe(150);
    expect(db.mockTransactions.filter((tx) => tx.referenceId.startsWith(`daily:${testUserId}:`))).toHaveLength(1);
  });

  it('should serialize simultaneous daily claims and credit the wallet only once', async () => {
    const [first, second] = await Promise.all([
      streakService.claimDaily(testUserId),
      streakService.claimDaily(testUserId),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.rewardDc).toBe(first.rewardDc);
    expect(second.newBalance).toBe(first.newBalance);
    expect(await walletService.getBalance(testUserId)).toBe(150);
    expect(db.mockTransactions.filter((tx) => tx.referenceId.startsWith(`daily:${testUserId}:`))).toHaveLength(1);
  });

  it('should repair the cooldown timestamp after an interrupted legacy claim without crediting twice', async () => {
    const reference = `daily:${testUserId}:legacy-retry`;
    const initial = await db.executeCoinTransaction(
      testUserId,
      50,
      'daily_reward',
      reference,
      { streak: 1 }
    );
    expect(initial.success).toBe(true);

    const userBeforeRetry = await db.getUserById(testUserId, true);
    expect(userBeforeRetry?.lastDailyClaim).toBeFalsy();

    const retry = await db.claimDailyReward(testUserId, reference);
    expect(retry.success).toBe(true);
    expect(retry.rewardDc).toBe(50);
    expect((await db.getUserById(testUserId, true))?.lastDailyClaim).toBeTruthy();
    expect(await walletService.getBalance(testUserId)).toBe(150);
    expect(db.mockTransactions.filter((tx) => tx.referenceId === reference)).toHaveLength(1);
  });
});
