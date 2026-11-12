import { beforeAll, describe, expect, it } from 'vitest';
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
});
