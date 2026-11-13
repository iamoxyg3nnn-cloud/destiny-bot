import { db } from '../../database/supabase.js';
import { lockManager } from '../../storage/locks.js';
import { ProfileField, RoomSession, UserProfile } from '../types.js';

export interface RevealConsentResult {
  completed: boolean;
  agreedFields: ProfileField[];
  user1Data?: Partial<UserProfile> & { discordTag?: string };
  user2Data?: Partial<UserProfile> & { discordTag?: string };
  message: string;
}

/**
 * How a consent submission should combine with any consent the user already gave.
 *
 * - `replace`: the user made an explicit choice (e.g. the /reveal field picker),
 *   so their new selection fully replaces their previous one.
 * - `narrow`: the consent was granted implicitly (e.g. "Request Mutual Reveal"
 *   button), so it may only narrow what the user already agreed to — never widen it.
 */
export type ConsentMode = 'replace' | 'narrow';

export class RevealService {
  /**
   * Submit reveal consent and selected fields for a user in an active room
   */
  async submitConsent(
    roomId: string,
    userId: string,
    fields: ProfileField[],
    mode: ConsentMode = 'replace'
  ): Promise<RevealConsentResult> {
    const allowedFields = new Set<ProfileField>(['destinyId', 'age', 'gender', 'interests', 'discordTag']);
    const requestedFields = Array.isArray(fields) ? fields.filter((field) => allowedFields.has(field)) : [];

    // Share the room lifecycle lock so a reveal cannot complete after a leave,
    // moderation termination, or inactivity cleanup has begun.
    return await lockManager.withLock(`lock:room:${roomId}`, async () => {
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
      const previous = isUser1 ? room.revealStatusUser1 : room.revealStatusUser2;
      const effectiveFields = mode === 'narrow' && previous?.consented
        ? requestedFields.filter((f) => previous.revealedFields.includes(f))
        : requestedFields;

      if (isUser1) {
        room.revealStatusUser1 = { consented: true, revealedFields: effectiveFields };
      } else {
        room.revealStatusUser2 = { consented: true, revealedFields: effectiveFields };
      }

      const saved = await db.updateRoomRevealStatus(
        room.id,
        room.revealStatusUser1,
        room.revealStatusUser2
      );
      if (!saved) {
        return { completed: false, agreedFields: [], message: 'Room is no longer active.' };
      }

      // Check if both users have consented
      if (room.revealStatusUser1.consented && room.revealStatusUser2.consented) {
        // Calculate intersection of consented fields
        const set1 = new Set(room.revealStatusUser1.revealedFields);
        const agreedFields = room.revealStatusUser2.revealedFields.filter((f) => set1.has(f));

        const u1 = await db.getUserById(room.user1Id, true);
        const u2 = await db.getUserById(room.user2Id, true);

        // Filter user data to ONLY agreed fields
        const filterData = (user: UserProfile | null): Partial<UserProfile> & { discordTag?: string } => {
          if (!user) return {};
          const filtered: Partial<UserProfile> & { discordTag?: string } = {};
          if (agreedFields.includes('destinyId')) filtered.destinyId = user.destinyId;
          if (agreedFields.includes('age')) filtered.age = user.age;
          if (agreedFields.includes('gender')) filtered.gender = user.gender;
          if (agreedFields.includes('interests')) filtered.interests = user.interests;
          if (agreedFields.includes('discordTag')) filtered.discordTag = `<@${user.discordUserId}>`;
          return filtered;
        };


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
