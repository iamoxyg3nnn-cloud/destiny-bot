import { db } from '../../database/supabase.js';
import { matchmakingManager } from '../matchmaking/manager.js';

export class BlockerService {
  async blockUser(blockerId: string, blockedId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    if (!blockerId || !blockedId || blockerId === blockedId) {
      return { success: false, message: 'You cannot block yourself.' };
    }

    // Match reservation takes the same two locks in sorted order. This closes
    // the race where a pair is matched after the block list was checked but
    // before the block is persisted.
    const [first, second] = [blockerId, blockedId].sort((a, b) => a.localeCompare(b));
    return matchmakingManager.withTicketLock(first, () =>
      matchmakingManager.withTicketLock(second, async () => {
        const added = await db.addBlock(blockerId, blockedId, reason || 'User initiated block');
        if (!added) {
          return { success: false, message: 'Failed to record block.' };
        }

        const blocker = await db.getUserById(blockerId, true);
        if (blocker?.activeRoomId) {
          const room = await db.getRoomById(blocker.activeRoomId);
          if (room && room.status === 'active' &&
              (room.user1Id === blockedId || room.user2Id === blockedId)) {
            await db.endRoom(room.id, 'user_left');
          }
        }

        return {
          success: true,
          message: 'User blocked globally. You will never be matched with this user again across any server.',
        };
      })
    );
  }

  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    return await db.isBlocked(userAId, userBId);
  }
}

export const blockerService = new BlockerService();
