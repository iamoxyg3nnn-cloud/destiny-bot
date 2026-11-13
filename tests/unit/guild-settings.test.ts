import { describe, expect, it } from 'vitest';
import { db } from '../../src/database/supabase.js';

describe('guild settings persistence', () => {
  it('keeps portal, moderation log and cross-server settings independent in mock mode', async () => {
    const guildId = '876543210987654321';
    const portalId = '765432109876543210';
    const modLogId = '654321098765432109';

    expect(await db.setGuildMatchChannel(guildId, portalId, 'Test Guild')).toBe(true);
    expect(await db.setGuildModLogChannel(guildId, modLogId, 'Test Guild')).toBe(true);
    expect(await db.setGuildCrossServerEnabled(guildId, false, 'Test Guild')).toBe(true);

    const settings = await db.getGuildSettings(guildId, true);
    expect(settings).toMatchObject({
      guildId,
      guildName: 'Test Guild',
      matchChannelId: portalId,
      modLogChannelId: modLogId,
      crossServerEnabled: false,
    });
  });

  it('rejects stale dashboard writes instead of overwriting a newer value', async () => {
    const guildId = '876543210987654322';
    const first = await db.saveGuildDashboardSetting(guildId, 'crossServerEnabled', false, null, 'Concurrent Guild');
    expect(first.status).toBe('saved');
    if (first.status !== 'saved') return;

    const stale = await db.saveGuildDashboardSetting(guildId, 'crossServerEnabled', true, null, 'Concurrent Guild');
    const fresh = await db.saveGuildDashboardSetting(guildId, 'crossServerEnabled', true, first.updatedAt, 'Concurrent Guild');

    expect(stale.status).toBe('conflict');
    expect(fresh.status).toBe('saved');
    expect((await db.getGuildSettings(guildId, true))?.crossServerEnabled).toBe(true);
  });
});
