import { afterEach, describe, expect, it } from 'vitest';
import type { ReportItem, UserProfile } from '../../src/core/types.js';
import { db } from '../../src/database/supabase.js';

const addedIds: string[] = [];
const addedUserIds: string[] = [];

afterEach(() => {
  for (const id of addedIds.splice(0)) db.mockReports.delete(id);
  for (const id of addedUserIds.splice(0)) db.mockUsers.delete(id);
});

describe('owner dashboard report queue', () => {
  it('returns paginated case metadata without participant identities or evidence', async () => {
    const report: ReportItem = {
      id: 'report-a',
      reporterId: 'private-reporter',
      reportedId: 'private-reported',
      roomId: 'private-room',
      category: 'harassment',
      description: 'Case details stay out of the queue preview.',
      chatExcerpt: [{ senderPseudonym: 'Guest 1', content: 'private evidence', timestamp: '2026-01-01T00:00:00.000Z' }],
      status: 'pending',
      actionTaken: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    addedIds.push(report.id);
    db.mockReports.set(report.id, report);

    const [entry] = await db.getReportQueue({ status: 'pending', limit: 1 });

    expect(entry).toMatchObject({ id: report.id, category: 'harassment', status: 'pending' });
    expect(entry).not.toHaveProperty('reporterId');
    expect(entry).not.toHaveProperty('reportedId');
    expect(entry).not.toHaveProperty('chatExcerpt');
    expect(entry).not.toHaveProperty('description');
  });

  it('returns only reviewer queue fields for pending verification requests', async () => {
    const user: UserProfile = {
      id: 'verification-user',
      discordUserId: 'private-discord-user',
      destinyId: 'DESTINY-12345',
      age: 25,
      gender: 'female',
      genderVerified: false,
      genderVerificationStatus: 'pending',
      genderVerificationEvidence: 'private evidence',
      interests: [],
      languages: ['en'],
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      isBanned: false,
      reputationScore: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    addedUserIds.push(user.id);
    db.mockUsers.set(user.id, user);

    const [entry] = await db.getPendingVerificationQueue({ limit: 1 });

    expect(entry).toEqual({ id: user.id, destinyId: user.destinyId, age: user.age, gender: user.gender, createdAt: user.createdAt });
    expect(entry).not.toHaveProperty('discordUserId');
    expect(entry).not.toHaveProperty('genderVerificationEvidence');
  });
});
