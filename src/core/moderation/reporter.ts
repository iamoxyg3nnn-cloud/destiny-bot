import { db } from '../../database/supabase.js';
import { ReportItem } from '../types.js';

export class ReporterService {
  async submitReport(
    reporterUserId: string,
    category: ReportItem['category'],
    description: string,
    roomId?: string
  ): Promise<{ success: boolean; reportId?: string; message: string }> {
    let reportedUserId = '';
    let chatExcerpt: Array<{ senderPseudonym: string; content: string; timestamp: string }> = [];

    if (roomId) {
      const room = await db.getRoomById(roomId);
      if (room) {
        reportedUserId = room.user1Id === reporterUserId ? room.user2Id : room.user1Id;
        const messages = await db.getRoomMessages(roomId, 15);
        chatExcerpt = messages.map((m) => ({
          senderPseudonym: m.senderPseudonym,
          content: m.sanitizedContent,
          timestamp: m.createdAt,
        }));
      }
    }

    if (!reportedUserId) {
      return { success: false, message: 'Could not resolve the reported user context.' };
    }

    const report = await db.createReport({
      reporterId: reporterUserId,
      reportedId: reportedUserId,
      roomId,
      category,
      description,
      chatExcerpt,
    });

    // Auto-block the reported user
    await db.addBlock(reporterUserId, reportedUserId, `Auto-blocked following safety report (${category})`);

    // Deduct 20 reputation points from reported user
    const reportedUser = await db.getUserById(reportedUserId);
    if (reportedUser) {
      const currentScore = typeof reportedUser.reputationScore === 'number' ? reportedUser.reputationScore : 100;
      reportedUser.reputationScore = Math.max(0, currentScore - 20);
      if (reportedUser.reputationScore < 10) {
        reportedUser.isBanned = true;
        reportedUser.banReason = 'Low reputation (< 10). Join discord.gg/eclairs to regain access.';
      }
      await db.createOrUpdateUser(reportedUser);
    }

    // Gracefully terminate the reported room
    if (roomId) {
      await db.endRoom(roomId, 'moderated');
    }

    return {
      success: true,
      reportId: report.id,
      message: 'Report submitted successfully. The user has been blocked and our moderation team has been alerted.',
    };
  }
}

export const reporterService = new ReporterService();
