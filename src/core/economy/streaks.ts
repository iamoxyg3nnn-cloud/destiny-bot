import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';
import { v4 as uuidv4 } from 'uuid';

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
      const user = await db.getUserById(userId);
      if (!user) {
        return { success: false, message: 'User not found.', rewardDc: 0, newStreak: 0, newBalance: 0 };
      }

      const now = new Date();
      const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim) : null;

      if (lastClaim) {
        const diffMs = now.getTime() - lastClaim.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 24) {
          const hoursLeft = Math.ceil(24 - diffHours);
          const nextClaimDate = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
          return {
            success: false,
            message: `You already claimed your daily reward! Please return in ${hoursLeft} hour(s).`,
            rewardDc: 0,
            newStreak: user.streakCount,
            newBalance: user.destinyCoins,
            nextClaimAt: nextClaimDate.toISOString(),
          };
        }

        // Streak check: within 48 hours keeps streak alive, >48 hours resets
        if (diffHours <= 48) {
          user.streakCount += 1;
        } else {
          user.streakCount = 1; // reset streak
        }
      } else {
        user.streakCount = 1;
      }

      // Base 50 DC + 10 DC per streak day (up to max 150 DC)
      const baseReward = 50;
      const streakBonus = Math.min((user.streakCount - 1) * 10, 100);
      const totalReward = baseReward + streakBonus;

      const dateStr = now.toISOString().split('T')[0];
      const refId = `daily:${userId}:${dateStr}`;

      const txResult = await db.executeCoinTransaction(
        userId,
        totalReward,
        'daily_reward',
        refId,
        { streak: user.streakCount }
      );

      if (!txResult.success) {
        return {
          success: false,
          message: txResult.error || 'Failed to claim daily reward.',
          rewardDc: 0,
          newStreak: user.streakCount,
          newBalance: user.destinyCoins,
        };
      }

      // Update user streak timestamp
      user.lastDailyClaim = now.toISOString();
      await db.createOrUpdateUser(user);

      return {
        success: true,
        message: `Claimed daily reward! +${totalReward} Destiny Coins! (${user.streakCount}-day streak 🔥)`,
        rewardDc: totalReward,
        newStreak: user.streakCount,
        newBalance: txResult.newBalance,
        nextClaimAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    });
  }
}

export const streakService = new StreakService();
