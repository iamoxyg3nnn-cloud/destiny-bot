import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { ReporterService } from '../../src/core/moderation/reporter.js';

describe('ReporterService authorization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects reports from users who were not in the referenced room', async () => {
    vi.spyOn(db, 'getRoomById').mockResolvedValue({
      id: 'room-1',
      user1Id: 'participant-a',
      user2Id: 'participant-b',
      status: 'active',
    } as any);
    const createReport = vi.spyOn(db, 'createReport');

    const result = await new ReporterService().submitReport(
      'unrelated-user',
      'harassment',
      'A fabricated report',
      'room-1'
    );

    expect(result.success).toBe(false);
    expect(createReport).not.toHaveBeenCalled();
  });

  it('rejects empty or oversized report descriptions', async () => {
    const getRoom = vi.spyOn(db, 'getRoomById');

    const empty = await new ReporterService().submitReport(
      'participant-a',
      'harassment',
      '   ',
      'room-1'
    );
    const oversized = await new ReporterService().submitReport(
      'participant-a',
      'harassment',
      'x'.repeat(1001),
      'room-1'
    );

    expect(empty.success).toBe(false);
    expect(oversized.success).toBe(false);
    expect(getRoom).not.toHaveBeenCalled();
  });

  it('does not apply reputation penalties before a moderator reviews a report', async () => {
    vi.spyOn(db, 'getRoomById').mockResolvedValue({
      id: 'room-2',
      user1Id: 'participant-a',
      user2Id: 'participant-b',
      status: 'ended',
    } as any);
    vi.spyOn(db, 'getRoomMessages').mockResolvedValue([]);
    vi.spyOn(db, 'createReport').mockResolvedValue({
      id: 'report-1',
      reporterId: 'participant-a',
      reportedId: 'participant-b',
      roomId: 'room-2',
      category: 'harassment',
      description: 'A valid report',
      chatExcerpt: [],
      status: 'pending',
      actionTaken: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(db, 'addBlock').mockResolvedValue(true);
    vi.spyOn(db, 'endRoom').mockResolvedValue(true);
    const penalize = vi.spyOn(db, 'createOrUpdateUser');

    const result = await new ReporterService().submitReport(
      'participant-a',
      'harassment',
      'A valid report',
      'room-2'
    );

    expect(result.success).toBe(true);
    expect(penalize).not.toHaveBeenCalled();
  });

  it('rejects invalid report categories at runtime', async () => {
    const getRoom = vi.spyOn(db, 'getRoomById');

    const result = await new ReporterService().submitReport(
      'participant-a',
      'made_up_category' as any,
      'A report',
      'room-1'
    );

    expect(result.success).toBe(false);
    expect(getRoom).not.toHaveBeenCalled();
  });
});
