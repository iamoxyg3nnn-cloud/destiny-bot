import { db } from '../../database/supabase.js';

export class BlockerService {
  async blockUser(blockerId: string, blockedId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    if (blockerId === blockedId) {
      return { success: false, message: 'You cannot block yourself.' };
    }

    const added = await db.addBlock(blockerId, blockedId, reason || 'User initiated block');
    if (!added) {
      return { success: false, message: 'Failed to record block.' };
    }

    // Check if they share an active room
    const blocker = await db.getUserById(blockerId);
    if (blocker && blocker.activeRoomId) {
      const room = await db.getRoomById(blocker.activeRoomId);
      if (room && (room.user1Id === blockedId || room.user2Id === blockedId)) {
        await db.endRoom(room.id, 'user_left');
      }
    }

    return {
      success: true,
      message: 'User blocked globally. You will never be matched with this user again across any server.',
    };
  }

  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    return await db.isBlocked(userAId, userBId);
  }
}

export const blockerService = new BlockerService();
