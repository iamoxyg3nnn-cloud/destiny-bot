import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/supabase.js';

const baseline = db.mockAuditLogs.length;

afterEach(() => {
  db.mockAuditLogs.splice(baseline);
});

describe('dashboard audit history', () => {
  it('returns only the requested guild and omits IP addresses', async () => {
    db.mockAuditLogs.push(
      { id: '1', adminId: '12345678901234567', action: 'DASHBOARD_SET_PORTAL_CHANNEL', targetType: 'guild', targetId: '11111111111111111', changes: { next: '22222222222222222' }, ipAddress: '192.0.2.1', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', adminId: '12345678901234568', action: 'DASHBOARD_SET_CROSS_SERVER', targetType: 'guild', targetId: '33333333333333333', changes: { next: false }, createdAt: '2026-01-02T00:00:00.000Z' },
    );

    const logs = await db.getAdminAuditLogs({ targetId: '11111111111111111' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id: '1', targetId: '11111111111111111' });
    expect(logs[0]).not.toHaveProperty('ipAddress');
  });

  it('sorts newest first and clamps page size', async () => {
    db.mockAuditLogs.push(
      { id: 'older', adminId: '12345678901234567', action: 'OLDER', targetType: 'platform', targetId: 'platform', changes: {}, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'newer', adminId: '12345678901234567', action: 'NEWER', targetType: 'platform', targetId: 'platform', changes: {}, createdAt: '2026-01-02T00:00:00.000Z' },
    );

    const logs = await db.getAdminAuditLogs({ limit: 1000 });

    expect(logs[0]?.id).toBe('newer');
    expect(logs).toHaveLength(2);
  });

  it('loads a rollback source only within its guild and omits the stored IP', async () => {
    const auditId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    db.mockAuditLogs.push(
      { id: auditId, adminId: '12345678901234567', action: 'DASHBOARD_SET_PORTAL_CHANNEL', targetType: 'guild', targetId: '11111111111111111', changes: { key: 'matchChannelId', previous: null, next: '22222222222222222' }, ipAddress: '192.0.2.2', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: auditId, adminId: '12345678901234567', action: 'DASHBOARD_SET_PORTAL_CHANNEL', targetType: 'guild', targetId: '33333333333333333', changes: { key: 'matchChannelId', previous: null, next: '22222222222222222' }, createdAt: '2026-01-01T00:00:00.000Z' },
    );

    const event = await db.getGuildAdminAuditLogById('11111111111111111', auditId);
    const crossGuild = await db.getGuildAdminAuditLogById('44444444444444444', auditId);

    expect(event).toMatchObject({ id: auditId, targetId: '11111111111111111' });
    expect(event).not.toHaveProperty('ipAddress');
    expect(crossGuild).toBeNull();
  });
});
