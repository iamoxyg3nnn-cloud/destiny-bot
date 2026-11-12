import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/supabase.js';
import { CleanupWorker } from '../../src/workers/cleanup.worker.js';
import { RoomSession } from '../../src/core/types.js';

function room(overrides: Partial<RoomSession> = {}): RoomSession {
  const now = new Date().toISOString();
  return {
    id: 'room-1',
    roomCode: 'DST-123',
    user1Id: 'user-1',
    user2Id: 'user-2',
    user1DiscordId: '10000000000000001',
    user2DiscordId: '10000000000000002',
    user1Pseudonym: 'Silver Fox',
    user2Pseudonym: 'Lunar Wolf',
    user1Avatar: '🦊',
    user2Avatar: '🐺',
    status: 'active',
    startedAt: now,
    revealStatusUser1: { consented: false, revealedFields: [] },
    revealStatusUser2: { consented: false, revealedFields: [] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('room inactivity cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an old room open when it has recent message activity', async () => {
    const oldStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentActivity = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    vi.spyOn(db, 'getActiveRooms').mockResolvedValue([
      room({ startedAt: oldStart, createdAt: oldStart, updatedAt: recentActivity }),
    ]);
    const conditionalClose = vi.spyOn(db, 'endRoomIfInactive').mockResolvedValue(true);

    const result = await new CleanupWorker().runCleanup();

    expect(result.staleRoomsClosed).toBe(0);
    expect(conditionalClose).not.toHaveBeenCalled();
  });

  it('closes a room after 24 hours without activity and counts only successful transitions', async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    vi.spyOn(db, 'getActiveRooms').mockResolvedValue([
      room({ startedAt: stale, updatedAt: stale }),
    ]);
    const conditionalClose = vi.spyOn(db, 'endRoomIfInactive').mockResolvedValue(true);

    const result = await new CleanupWorker().runCleanup();

    expect(conditionalClose).toHaveBeenCalledTimes(1);
    expect(conditionalClose.mock.calls[0][0]).toBe('room-1');
    expect(conditionalClose.mock.calls[0][1]).toBeInstanceOf(Date);
    expect(result.staleRoomsClosed).toBe(1);
  });

  it('does not close a room when its activity timestamps are invalid', async () => {
    vi.spyOn(db, 'getActiveRooms').mockResolvedValue([
      room({ startedAt: 'not-a-date', updatedAt: 'not-a-date' }),
    ]);
    const conditionalClose = vi.spyOn(db, 'endRoomIfInactive').mockResolvedValue(true);

    const result = await new CleanupWorker().runCleanup();

    expect(result.staleRoomsClosed).toBe(0);
    expect(conditionalClose).not.toHaveBeenCalled();
  });

  it('does not report a room closed when another worker already ended it', async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    vi.spyOn(db, 'getActiveRooms').mockResolvedValue([
      room({ startedAt: stale, updatedAt: stale }),
    ]);
    vi.spyOn(db, 'endRoomIfInactive').mockResolvedValue(false);

    const result = await new CleanupWorker().runCleanup();

    expect(result.staleRoomsClosed).toBe(0);
  });

  it('does not close a room if it became active after the cleanup snapshot', async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    vi.spyOn(db, 'getActiveRooms').mockResolvedValue([
      room({ startedAt: stale, updatedAt: stale }),
    ]);
    const conditionalClose = vi.spyOn(db, 'endRoomIfInactive').mockResolvedValue(false);

    const result = await new CleanupWorker().runCleanup();

    expect(conditionalClose).toHaveBeenCalledTimes(1);
    expect(result.staleRoomsClosed).toBe(0);
  });

});
