import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';
import { CoinTransaction } from '../types.js';

export class WalletService {
  async getBalance(userId: string): Promise<number> {
    const user = await db.getUserById(userId);
    return user ? user.destinyCoins : 0;
  }

  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    referenceId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (amount <= 0) return { success: false, error: 'Transfer amount must be positive.' };

    return await lockManager.withLock(`lock:wallet:transfer:${fromUserId}`, async () => {
      const debitRes = await db.executeCoinTransaction(
        fromUserId,
        -amount,
        'shop_purchase',
        `transfer:out:${referenceId}`,
        { toUserId }
      );
      if (!debitRes.success) return { success: false, error: debitRes.error };

      await db.executeCoinTransaction(
        toUserId,
        amount,
        'mission_reward',
        `transfer:in:${referenceId}`,
        { fromUserId }
      );

      return { success: true };
    });
  }

  async getTransactionHistory(userId: string, limit: number = 20): Promise<CoinTransaction[]> {
    return await db.getUserTransactions(userId, limit);
  }
}

export const walletService = new WalletService();
