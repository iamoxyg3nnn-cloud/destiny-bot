import { Client } from 'discord.js';
import { stateStore } from '../storage/state-store.js';
import { db } from '../database/supabase.js';
import { parseEmbedScript, DEFAULT_LOG_TEMPLATE, formatDestinyHandle } from './embed-script.js';

export async function dispatchPairedLogEvent(
  client: Client,
  guildId: string | undefined,
  eventType: 'Pair' | 'Reveal' | 'Unmatch',
  participants: {
    discordUserId1: string;
    discordUserId2: string;
    pseudonym1?: string;
    pseudonym2?: string;
  }
): Promise<boolean> {
  if (!guildId || !client || !client.isReady()) return false;

  try {
    const enabled = await stateStore.get(`guild:${guildId}:paired_logs_enabled`);
    if (enabled !== 'true') return false;

    const logChannelId = await stateStore.get(`guild:${guildId}:paired_logs_channel`);
    if (!logChannelId) return false;

    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const [user1Obj, user2Obj] = await Promise.all([
      client.users.fetch(participants.discordUserId1).catch(() => null),
      client.users.fetch(participants.discordUserId2).catch(() => null),
    ]);

    const [profile1, profile2] = await Promise.all([
      db.getUserByDiscordId(participants.discordUserId1).catch(() => null),
      db.getUserByDiscordId(participants.discordUserId2).catch(() => null),
    ]);

    const alias1 = formatDestinyHandle(profile1?.destinyId || participants.pseudonym1);
    const alias2 = formatDestinyHandle(profile2?.destinyId || participants.pseudonym2);

    const customScript = await stateStore.get(`guild:${guildId}:paired_logs_embed`);
    const script = customScript || DEFAULT_LOG_TEMPLATE;

    const logEmbed = parseEmbedScript(script, {
      guild: {
        name: (channel as any).guild?.name,
        id: (channel as any).guild?.id,
        icon: (channel as any).guild?.iconURL(),
      },
      destiny1: {
        alias: alias1,
        id: participants.discordUserId1,
        name: user1Obj?.username || 'Member',
        mention: `<@${participants.discordUserId1}>`,
      },
      destiny2: {
        alias: alias2,
        id: participants.discordUserId2,
        name: user2Obj?.username || 'Member',
        mention: `<@${participants.discordUserId2}>`,
      },
      match: { type: eventType },
    });

    await (channel as any).send({ embeds: [logEmbed] }).catch(() => {});
    return true;
  } catch (err: any) {
    console.warn(`[PairedLogs] Could not post ${eventType} log:`, err?.message || err);
    return false;
  }
}
