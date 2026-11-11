import { Client } from 'discord.js';
import { db } from '../../database/supabase.js';
import { matchmakingManager } from '../matchmaking/manager.js';

export const ECLAIRS_GUILD_IDS = ['1555968929023664208', '1524739596670337197', '1324387854041743442'];
export const ECLAIRS_GUILD_ID = '1555968929023664208';
export const ECLAIRS_INVITE_URL = 'https://discord.gg/eclairs';
export const LOW_REPUTATION_THRESHOLD = 10;
export const RESTORED_REPUTATION_SCORE = 100;
export const PENALIZED_REPUTATION_SCORE = 5;

/** Only these system-issued reasons are eligible for self-service recovery. */
export function isReputationRestriction(user: { banReason?: string } | null | undefined): boolean {
  const reason = user?.banReason?.trim().toLowerCase() || '';
  return reason.startsWith('low reputation (< 10)') ||
    reason.startsWith('left discord.gg/eclairs (reputation dropped');
}

/**
 * Checks if a Discord user is currently an active member of the Eclairs guild (discord.gg/eclairs)
 */
export async function checkEclairsMembership(client: Client, discordUserId: string): Promise<boolean | null> {
  const guildIds = new Set(ECLAIRS_GUILD_IDS);
  for (const guild of client.guilds.cache.values()) {
    const vanity = guild.vanityURLCode?.toLowerCase();
    const name = guild.name?.toLowerCase?.() || '';
    if (vanity === 'eclairs' || vanity === 'affairs' || vanity === 'together' || name.includes('eclairs')) {
      guildIds.add(guild.id);
    }
  }

  let lookupFailed = false;
  for (const guildId of guildIds) {
    let guild = client.guilds.cache.get(guildId);
    if (!guild) {
      try {
        guild = await client.guilds.fetch(guildId);
      } catch {
        // A missing guild from this bot's cache is not proof the user is not
        // a member. The bot may temporarily lack access or be rate limited.
        lookupFailed = true;
        continue;
      }
    }

    try {
      const member = await guild.members.fetch(discordUserId);
      if (member) return true;
    } catch (error: any) {
      // Discord 10007 is the definitive "Unknown Member" response. Every
      // other failure is indeterminate and must not trigger an automatic ban.
      if (Number(error?.code) !== 10007) lookupFailed = true;
    }
  }

  return lookupFailed ? null : false;
}

/**
 * Check membership in any other recognized Eclairs community after a member
 * leaves one guild. null means Discord lookup failed, so callers must not
 * punish the user on an indeterminate network/permission error.
 */
export async function checkOtherEclairsMembership(
  client: Client,
  discordUserId: string,
  excludedGuildId: string
): Promise<boolean | null> {
  const candidateGuildIds = new Set(ECLAIRS_GUILD_IDS.filter((id) => id !== excludedGuildId));
  for (const guild of client.guilds.cache.values()) {
    const vanity = guild.vanityURLCode?.toLowerCase();
    if (vanity === 'eclairs' || vanity === 'affairs' || vanity === 'together' || (guild.name?.toLowerCase?.() || '').includes('eclairs')) {
      if (guild.id !== excludedGuildId) candidateGuildIds.add(guild.id);
    }
  }

  let lookupFailed = false;
  for (const guildId of candidateGuildIds) {
    let guild = client.guilds.cache.get(guildId);
    if (!guild) {
      try {
        guild = await client.guilds.fetch(guildId);
      } catch {
        lookupFailed = true;
        continue;
      }
    }

    try {
      const member = await guild.members.fetch(discordUserId);
      if (member) return true;
    } catch (error: any) {
      // Discord 10007 means the user is not a member. Other failures (timeouts,
      // rate limits, missing access) are indeterminate rather than proof.
      if (Number(error?.code) !== 10007) lookupFailed = true;
    }
  }

  return lookupFailed ? null : false;
}

/**
 * Evaluates user reputation and enforces the Eclairs server membership rule
 */
export async function handleReputationCheck(
  client: Client,
  discordUserId: string
): Promise<{ isRestricted: boolean; restored: boolean }> {
  const initialUser = await db.getUserByDiscordId(discordUserId, true);
  if (!initialUser) return { isRestricted: false, restored: false };

  // Matchmaking tickets are keyed by the database UUID, not the Discord snowflake.
  return matchmakingManager.withTicketLock(initialUser.id, async () => {
    const user = await db.getUserByDiscordId(discordUserId, true);
    if (!user) return { isRestricted: false, restored: false };

    // The Eclairs recovery flow only reverses system-issued reputation bans.
    // Moderator/safety bans remain independent and cannot be self-cleared.
    const reputationBan = isReputationRestriction(user);
    if (user.isBanned && !reputationBan) {
      return { isRestricted: true, restored: false };
    }

    const isLowRep = user.reputationScore < LOW_REPUTATION_THRESHOLD || (user.isBanned && reputationBan);
    if (!isLowRep) return { isRestricted: false, restored: false };

    const isMember = await checkEclairsMembership(client, discordUserId);
    if (isMember === null) {
      console.warn(`[Reputation] Membership lookup is inconclusive for ${discordUserId}; deferring enforcement.`);
      return { isRestricted: true, restored: false };
    }

    if (isMember) {
      await db.createOrUpdateUser({
        discordUserId: user.discordUserId,
        reputationScore: RESTORED_REPUTATION_SCORE,
        isBanned: false,
        banReason: '',
      });
      return { isRestricted: false, restored: true };
    }

    // The queue lock prevents a new match from reserving this user between the
    // ban write and stale ticket/active room cleanup.
    await db.createOrUpdateUser({
      discordUserId: user.discordUserId,
      isBanned: true,
      banReason: 'Low reputation (< 10). Join discord.gg/eclairs to regain access.',
    });
    await matchmakingManager.removeQueueTicketUnderLock(user.id);
    if (user.activeRoomId) await db.endRoom(user.activeRoomId, 'moderated');

    return { isRestricted: true, restored: false };
  });
}
