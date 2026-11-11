import { db } from '../../database/supabase.js';
import { blockerService } from './blocker.js';
import { sanitizer } from '../sanitizer.js';
import { ReportItem } from '../types.js';

export class ReporterService {
  async submitReport(
    reporterUserId: string,
    category: ReportItem['category'],
    description: string,
    roomId?: string
  ): Promise<{ success: boolean; reportId?: string; message: string }> {
    const validCategories: ReportItem['category'][] = ['harassment', 'identity_leak', 'inappropriate_content', 'spam', 'underage', 'other'];
    const cleanDescription = typeof description === 'string' ? description.trim() : '';
    if (!validCategories.includes(category) || cleanDescription.length < 1 || cleanDescription.length > 1000) {
      return { success: false, message: 'Please provide a valid report category and a description of 1–1000 characters.' };
    }
    if (!reporterUserId || !roomId) {
      return { success: false, message: 'Could not resolve the reported user context.' };
    }

    let reportedUserId = '';
    let chatExcerpt: Array<{ senderPseudonym: string; content: string; timestamp: string }> = [];

    {
      const room = await db.getRoomById(roomId);
      if (room && (room.user1Id === reporterUserId || room.user2Id === reporterUserId)) {
        reportedUserId = room.user1Id === reporterUserId ? room.user2Id : room.user1Id;
        const messages = await db.getRoomMessages(roomId, 15);
        chatExcerpt = messages.map((m) => ({
          senderPseudonym: m.senderPseudonym,
          content: m.sanitizedContent,
          timestamp: m.createdAt,
        }));
      }
    }

    if (!reportedUserId || reportedUserId === reporterUserId) {
      return { success: false, message: 'You can only report the other participant in a chat you were part of.' };
    }

    let report: ReportItem;
    try {
      report = await db.createReport({
        reporterId: reporterUserId,
        reportedId: reportedUserId,
        roomId,
        category,
        description: cleanDescription,
        chatExcerpt,
      });
    } catch (error) {
      console.error('[Reports] Could not persist report:', error);
      return { success: false, message: 'The report could not be saved. Please try again.' };
    }

    // Auto-block using the same sorted ticket locks as pair reservation.
    // The report remains saved if a secondary safety action fails.
    let blocked = false;
    try {
      const result = await blockerService.blockUser(
        reporterUserId,
        reportedUserId,
        `Auto-blocked following safety report (${category})`
      );
      blocked = result.success;
      if (!blocked) console.error('[Reports] Report saved but automatic block failed:', result.message);
    } catch (error) {
      console.error('[Reports] Report saved but automatic block failed:', error);
    }

    let roomClosed = false;
    try {
      roomClosed = await db.endRoom(roomId, 'moderated');
    } catch (error) {
      console.error('[Reports] Report saved but room closure failed:', error);
    }

    return {
      success: true,
      reportId: report.id,
      message: blocked
        ? (roomClosed
          ? 'Report submitted successfully. The user has been blocked and the room has been closed.'
          : 'Report submitted and user blocked. The room was already closed or could not be closed.')
        : 'Report submitted successfully, but automatic blocking failed. Please block the user manually.',
    };
  }
}

export const reporterService = new ReporterService();
