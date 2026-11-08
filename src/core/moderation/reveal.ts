import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';
import { ProfileField, RoomSession, UserProfile } from '../types.js';

export interface RevealConsentResult {
  completed: boolean;
  agreedFields: ProfileField[];
  user1Data?: Partial<UserProfile> & { discordTag?: string };
  user2Data?: Partial<UserProfile> & { discordTag?: string };
  message: string;
}

export class RevealService {
  /**
   * Submit reveal consent and selected fields for a user in an active room
   */
  async submitConsent(
    roomId: string,
    userId: string,
    fields: ProfileField[]
  ): Promise<RevealConsentResult> {
    return await lockManager.withLock(`lock:reveal:${roomId}`, async () => {
      const room = await db.getRoomById(roomId);
      if (!room || room.status !== 'active') {
        return { completed: false, agreedFields: [], message: 'Room is no longer active.' };
      }

      const isUser1 = room.user1Id === userId;
      const isUser2 = room.user2Id === userId;

      if (!isUser1 && !isUser2) {
        return { completed: false, agreedFields: [], message: 'Unauthorized room participant.' };
      }

      // Update the user's reveal preferences
      if (isUser1) {
        room.revealStatusUser1 = { consented: true, revealedFields: fields };
      } else {
        room.revealStatusUser2 = { consented: true, revealedFields: fields };
      }

      await db.updateRoom(room);

      // Check if both users have consented
      if (room.revealStatusUser1.consented && room.revealStatusUser2.consented) {
        // Calculate intersection of consented fields
        const set1 = new Set(room.revealStatusUser1.revealedFields);
        const agreedFields = room.revealStatusUser2.revealedFields.filter((f) => set1.has(f));

        const u1 = await db.getUserById(room.user1Id);
        const u2 = await db.getUserById(room.user2Id);

        // Filter user data to ONLY agreed fields
        const filterData = (user: UserProfile | null) => {
          if (!user) return {};
          const filtered: any = { destinyId: user.destinyId };
          if (agreedFields.includes('age')) filtered.age = user.age;
          if (agreedFields.includes('gender')) filtered.gender = user.gender;
          if (agreedFields.includes('interests')) filtered.interests = user.interests;
          if (agreedFields.includes('discordTag')) filtered.discordTag = `<@${user.discordUserId}>`;
          return filtered;
        };

        // Award bonus Connection XP for mutual reveal
        await db.updateRoomXP(roomId, 100);

        return {
          completed: true,
          agreedFields,
          user1Data: filterData(u1),
          user2Data: filterData(u2),
          message: agreedFields.length > 0
            ? 'Mutual reveal successful! Mutually agreed profile fields have been revealed.'
            : 'Both partners consented, but had no common profile fields selected. Real identities remain protected.',
        };
      }

      return {
        completed: false,
        agreedFields: [],
        message: 'Your reveal preferences have been saved. Waiting for your partner to also consent.',
      };
    });
  }
}

export const revealService = new RevealService();
