import { db } from '../../database/supabase.js';
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
    return db.transferCoins(fromUserId, toUserId, amount, referenceId);
  }

  async getTransactionHistory(userId: string, limit: number = 20): Promise<CoinTransaction[]> {
    return await db.getUserTransactions(userId, limit);
  }
}

export const walletService = new WalletService();
