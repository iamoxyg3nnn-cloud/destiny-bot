import { Client } from 'discord.js';
import { db } from '../../database/supabase.js';

export const ECLAIRS_GUILD_IDS = ['1555968929023664208', '1524739596670337197', '1324387854041743442'];
export const ECLAIRS_GUILD_ID = '1555968929023664208';
export const ECLAIRS_INVITE_URL = 'https://discord.gg/eclairs';
export const LOW_REPUTATION_THRESHOLD = 10;
export const RESTORED_REPUTATION_SCORE = 100;
export const PENALIZED_REPUTATION_SCORE = 5;

/**
 * Checks if a Discord user is currently an active member of the Eclairs guild (discord.gg/eclairs)
 */
export async function checkEclairsMembership(client: Client, discordUserId: string): Promise<boolean> {
  try {
    for (const gid of ECLAIRS_GUILD_IDS) {
      let guild = client.guilds.cache.get(gid);
      if (!guild) {
        guild = await client.guilds.fetch(gid).catch(() => null) as any;
      }
      if (guild) {
        const member = await guild.members.fetch(discordUserId).catch(() => null);
        if (member) return true;
      }
    }

    for (const g of client.guilds.cache.values()) {
      const v = g.vanityURLCode?.toLowerCase();
      const n = g.name.toLowerCase();
      if (v === 'eclairs' || v === 'affairs' || v === 'together' || n.includes('eclairs')) {
        const member = await g.members.fetch(discordUserId).catch(() => null);
        if (member) return true;
      }
    }
    return false;
  } catch (err: any) {
    console.warn('[Reputation] Error checking Eclairs membership:', err?.message || err);
    return false;
  }
}

/**
 * Evaluates user reputation and enforces the Eclairs server membership rule
 */
export async function handleReputationCheck(
  client: Client,
  discordUserId: string
): Promise<{ isRestricted: boolean; restored: boolean }> {
  const user = await db.getUserByDiscordId(discordUserId, true);
  if (!user) return { isRestricted: false, restored: false };

  const isLowRep = user.reputationScore < LOW_REPUTATION_THRESHOLD || (user.isBanned && user.banReason?.includes('reputation'));
  if (!isLowRep) return { isRestricted: false, restored: false };

  // Check if they are currently inside discord.gg/eclairs
  const isMember = await checkEclairsMembership(client, discordUserId);
  if (isMember) {
    user.reputationScore = RESTORED_REPUTATION_SCORE;
    user.isBanned = false;
    user.banReason = undefined;
    await db.createOrUpdateUser(user);
    return { isRestricted: false, restored: true };
  }

  // Ensure banned status is locked
  if (!user.isBanned) {
    user.isBanned = true;
    user.banReason = 'Low reputation (< 10). Join discord.gg/eclairs to regain access.';
    await db.createOrUpdateUser(user);
  }

  return { isRestricted: true, restored: false };
}
