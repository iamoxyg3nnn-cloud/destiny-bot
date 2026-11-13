import { afterEach, describe, expect, it } from 'vitest';
import type { RoomSession } from '../../src/core/types.js';
import { db } from '../../src/database/supabase.js';

const roomIds: string[] = [];

afterEach(() => {
  for (const id of roomIds.splice(0)) db.mockRooms.delete(id);
});

describe('owner active-room inventory', () => {
  it('returns active room metadata without participant account IDs or messages', async () => {
    const room: RoomSession = {
      id: 'room-private-id',
      roomCode: 'ROOM-2468',
      user1Id: 'private-user-one',
      user2Id: 'private-user-two',
      user1DiscordId: 'private-discord-one',
      user2DiscordId: 'private-discord-two',
      user1Pseudonym: 'Moonlight',
      user2Pseudonym: 'Bluebird',
      user1Avatar: '',
      user2Avatar: '',
      status: 'active',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      revealStatusUser1: { consented: false, revealedFields: [] },
      revealStatusUser2: { consented: false, revealedFields: [] },
    };
    roomIds.push(room.id);
    db.mockRooms.set(room.id, room);

    const [summary] = await db.getActiveRoomSummaries({ limit: 1 });

    expect(summary).toMatchObject({ roomCode: room.roomCode, user1Pseudonym: 'Moonlight', user2Pseudonym: 'Bluebird', status: 'active' });
    expect(summary).not.toHaveProperty('user1Id');
    expect(summary).not.toHaveProperty('user2Id');
    expect(summary).not.toHaveProperty('user1DiscordId');
    expect(summary).not.toHaveProperty('user2DiscordId');
    expect(summary).not.toHaveProperty('messages');
  });
});
