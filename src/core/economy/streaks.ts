import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';

export interface DailyClaimResult {
  success: boolean;
  message: string;
  rewardDc: number;
  newStreak: number;
  newBalance: number;
  nextClaimAt?: string;
}

export class StreakService {
  async claimDaily(userId: string): Promise<DailyClaimResult> {
    return await lockManager.withLock(`lock:streak:${userId}`, async () => {
      // The database function performs the cooldown check, streak calculation,
      // balance update and ledger insert in one transaction. Do not calculate
      // the reward from a cached profile or write the cooldown separately.
      // Stable key for this user's UTC claim day. If Postgres commits but the
      // response is lost, the retry resolves to the same ledger transaction.
      // The database still enforces the rolling 24-hour cooldown across days.
      const utcDay = new Date().toISOString().slice(0, 10);
      const referenceId = `daily:${userId}:${utcDay}`;
      const result = await db.claimDailyReward(userId, referenceId);

      if (!result.success) {
        if (result.error === 'USER_NOT_FOUND') {
          return {
            success: false,
            message: 'User not found.',
            rewardDc: 0,
            newStreak: 0,
            newBalance: 0,
          };
        }

        if (result.error === 'ALREADY_CLAIMED') {
          const nextClaimAt = result.nextClaimAt;
          const remainingMs = nextClaimAt ? Math.max(0, Date.parse(nextClaimAt) - Date.now()) : 0;
          const hoursLeft = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
          return {
            success: false,
            message: `You already claimed your daily reward! Please return in ${hoursLeft} hour(s).`,
            rewardDc: 0,
            newStreak: result.newStreak,
            newBalance: result.newBalance,
            nextClaimAt,
          };
        }

        return {
          success: false,
          message: result.error || 'Failed to claim daily reward.',
          rewardDc: 0,
          newStreak: result.newStreak,
          newBalance: result.newBalance,
          nextClaimAt: result.nextClaimAt,
        };
      }

      return {
        success: true,
        message: `Claimed daily reward! +${result.rewardDc} Destiny Coins! (${result.newStreak}-day streak 🔥)`,
        rewardDc: result.rewardDc,
        newStreak: result.newStreak,
        newBalance: result.newBalance,
        nextClaimAt: result.nextClaimAt,
      };
    });
  }
}

export const streakService = new StreakService();
