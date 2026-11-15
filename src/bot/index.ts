import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  REST, 
  Routes, 
  Events,
  MessageFlags,
  AuditLogEvent,
  PermissionFlagsBits
} from 'discord.js';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { stateStore } from '../storage/state-store.js';
import { ECLAIRS_GUILD_IDS, checkOtherEclairsMembership, isReputationRestriction } from '../core/moderation/reputation.js';
import { matchmakingManager } from '../core/matchmaking/manager.js';
import { embedService } from './embeds/index.js';
import { configureDestinyEmojis, formatCustomEmojiText } from './custom-emojis.js';
import { setDiscordClient } from './client-registry.js';
import { initPresence, refreshPresence, stopPresence } from './presence-manager.js';
import { handleInteraction } from './interactions/handler.js';
import { messageCommandHandler } from './messages/handler.js';
import { messageRelayService } from './relay/index.js';
import { slashCommands } from './commands/definitions.js';
import { matchmakingWorker } from '../workers/matchmaking.worker.js';
import { voiceManager } from '../core/voice/manager.js';

let guildSnapshotTimer: NodeJS.Timeout | null = null;

const LEGACY_EMOJI_GUILD_ID = '1555968929023664208';
const LEGACY_EMOJI_AUDIT_REASON = 'Destiny brand emoji sourced from Emoji.gg entry #';

/**
 * Removes only emojis created by the retired Emoji.gg installer.
 * The audit-log reason and bot executor are both checked so existing server
 * emojis with similar names are never touched.
 */
async function removeLegacyEmojiGgAssets(client: Client): Promise<void> {
  const guild = client.guilds.cache.get(LEGACY_EMOJI_GUILD_ID)
    || await client.guilds.fetch(LEGACY_EMOJI_GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn('[Emoji cleanup] Legacy emoji server is not accessible');
    return;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)
    || !me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    console.warn('[Emoji cleanup] Missing Manage Expressions or View Audit Log; skipping');
    return;
  }

  try {
    await guild.emojis.fetch();
    const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 100 });
    let removed = 0;

    for (const entry of audit.entries.values()) {
      if (entry.executorId !== client.user?.id) continue;
      if (!entry.reason?.startsWith(LEGACY_EMOJI_AUDIT_REASON)) continue;

      const emoji = entry.targetId ? guild.emojis.cache.get(entry.targetId) : null;
      if (!emoji) continue;

      await emoji.delete('Remove emojis installed by the retired Emoji.gg integration');
      removed += 1;
    }

    console.log(`[Emoji cleanup] Removed ${removed} legacy Emoji.gg asset(s)`);
  } catch (error: any) {
    console.warn('[Emoji cleanup] Could not remove legacy Emoji.gg assets:', error?.message || error);
  }
}

async function publishGuildSnapshot(client: Client): Promise<void> {
  if (!client.isReady()) return;
  const shardId = client.shard?.ids?.[0] ?? 0;
  const guilds = Array.from(client.guilds.cache.values()).map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    channels: Array.from(guild.channels.cache.values())
      .filter((channel: any) => channel && (channel.type === 0 || channel.type === 5))
      .map((channel: any) => ({
        id: channel.id,
        name: channel.name,
        botPermissions: guild.members.me?.permissionsIn(channel).bitfield.toString() || '0',
      })),
  }));

  await Promise.all([
    stateStore.set(`bot:guilds:${shardId}`, JSON.stringify(guilds), 180),
    stateStore.sAdd('bot:guild-shards', String(shardId)),
  ]);
}

export class DestinyBot {
  public client: Client;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
      ],
    });

    setDiscordClient(this.client);
    this.registerEvents();
  }

  private registerEvents() {
    this.client.once(Events.ClientReady, async (readyClient) => {
      try {
        console.log(`Destiny Bot is online as ${readyClient.user.tag}`);
        console.log(`Serving ${readyClient.guilds.cache.size} servers`);
        configureDestinyEmojis(readyClient);
        await publishGuildSnapshot(readyClient).catch((error) => console.warn('[Bot] Guild snapshot publish failed:', error?.message || error));
        if (!guildSnapshotTimer) {
          guildSnapshotTimer = setInterval(() => {
            void publishGuildSnapshot(readyClient).catch((error) => console.warn('[Bot] Guild snapshot refresh failed:', error?.message || error));
          }, 60_000);
          guildSnapshotTimer.unref?.();
        }
        const isPrimaryShard = !readyClient.shard || readyClient.shard.ids.includes(0);
        if (isPrimaryShard) {
          await removeLegacyEmojiGgAssets(readyClient);
          await this.syncSlashCommands();
          await matchmakingWorker.start();
          await voiceManager.sweepOrphanedVoiceChannels(readyClient).catch((e: any) => console.warn('[Bot] Orphaned voice sweeper error:', e?.message || e));
        }
        initPresence(readyClient);
      } catch (error) {
        console.error('[Bot] Startup initialization failed:', error);
        if (config.NODE_ENV === 'production') process.exit(1);
      }
    });

    // Interactive button & modal interactions
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await handleInteraction(interaction);
      } catch (err: any) {
        if (err?.code === 10062 || err?.code === 40060) {
          // Token expired or acknowledged already by Discord Gateway; ignore gracefully
          return;
        }
        console.error('[Bot] Interaction error:', err?.message || err);
        if (interaction.isRepliable()) {
          try {
            if (interaction.deferred) {
              await interaction.editReply({ content: formatCustomEmojiText('⚠️ An unexpected error occurred while processing this interaction.') });
            } else if (!interaction.replied) {
              await interaction.reply({ content: formatCustomEmojiText('⚠️ An unexpected error occurred while processing this interaction.'), flags: MessageFlags.Ephemeral });
            }
          } catch {}
        }
      }
    });

    // Text messages: prefix command routing & anonymous room relay
    this.client.on(Events.MessageCreate, async (message) => {
      try {
        // 1. Process destiny commands (destiny, destiny start, destiny setchannel)
        const isHandled = await messageCommandHandler.handleMessage(this.client, message);
        if (isHandled) return;

        // 2. Direct message relay for active chat rooms
        await messageRelayService.handleIncomingMessage(this.client, message);
      } catch (err: any) {
        console.error('[Bot] Message event error:', err);
      }
    });

    // When Destiny joins a new server, automatically send the Setup Console to the admins!
    this.client.on(Events.GuildCreate, async (guild) => {
      console.log(`Destiny joined new server: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
      await publishGuildSnapshot(this.client).catch((error) => console.warn('[Bot] Guild snapshot update failed:', error?.message || error));
      try {
        await sendGuildSetupWelcome(guild);
      } catch (err: any) {
        console.warn(`[Bot] Failed to send setup welcome in ${guild.name}:`, err?.message);
      }
    });

    this.client.on(Events.GuildDelete, async () => {
      await publishGuildSnapshot(this.client).catch((error) => console.warn('[Bot] Guild snapshot update failed:', error?.message || error));
    });

    // Enforce reputation drop only after confirming the user left every
    // recognized Eclairs community. The per-user ticket lock serializes this
    // policy with queue reservation and profile changes.
    this.client.on(Events.GuildMemberRemove, async (member) => {
      try {
        const vanity = member.guild.vanityURLCode?.toLowerCase();
        const guildName = member.guild.name?.toLowerCase?.() || '';
        const isEclairsCommunity = ECLAIRS_GUILD_IDS.includes(member.guild.id) ||
          vanity === 'eclairs' || vanity === 'affairs' || vanity === 'together' ||
          guildName.includes('eclairs');
        if (!isEclairsCommunity) return;

        const initialUser = await db.getUserByDiscordId(member.id, true);
        if (!initialUser) return;

        const result = await matchmakingManager.withTicketLock(initialUser.id, async () => {
          // Recheck while holding the same internal-user lock used by /match,
          // report/admin bans and pair reservation.
          const remainingMembership = await checkOtherEclairsMembership(
            this.client,
            member.id,
            member.guild.id
          );
          if (remainingMembership === true) return { action: 'retained' as const };
          if (remainingMembership === null) return { action: 'indeterminate' as const };

          const user = await db.getUserByDiscordId(member.id, true);
          if (!user || user.id !== initialUser.id) return { action: 'missing' as const };

          const hasIndependentAdminBan = user.isBanned && !isReputationRestriction(user);
          await db.createOrUpdateUser({
            discordUserId: user.discordUserId,
            reputationScore: 5,
            ...(hasIndependentAdminBan ? {} : {
              isBanned: true,
              banReason: 'Left discord.gg/eclairs (Reputation dropped < 10)',
            }),
          });

          await matchmakingManager.removeQueueTicketUnderLock(user.id);
          if (user.activeRoomId) await db.endRoom(user.activeRoomId, 'moderated');

          return {
            action: hasIndependentAdminBan ? 'admin-banned' as const : 'restricted' as const,
            discordUser: member.user,
          };
        });

        if (result.action === 'retained') {
          console.log(`[Reputation] User ${member.user?.tag || member.id} remains in another Eclairs community; access retained.`);
          return;
        }
        if (result.action === 'indeterminate') {
          console.warn(`[Reputation] Could not verify other Eclairs memberships for ${member.id}; no penalty applied.`);
          return;
        }
        if (result.action === 'missing') return;

        console.log(`[Reputation] User ${member.user?.tag || member.id} left the Eclairs community; queue and active-room state cleared.`);
        if (result.action === 'restricted') {
          try {
            const dm = await result.discordUser.createDM();
            const container = embedService.createLowReputationRestrictedContainer();
            await dm.send({ components: [container], flags: [MessageFlags.IsComponentsV2] });
          } catch (error: any) {
            console.warn('[Reputation] Could not send recovery instructions:', error?.message || error);
          }
        }
      } catch (err: any) {
        console.error('[Bot] GuildMemberRemove event error:', err?.message || err);
      }
    });

    this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      try {
        const { voiceManager } = await import('../core/voice/manager.js');
        await voiceManager.handleVoiceStateUpdate(oldState, newState);
      } catch (err: any) {
        console.error('[Bot] VoiceStateUpdate event error:', err?.message || err);
      }
    });

    this.client.on(Events.Error, (err) => {
      console.error('[Bot] Discord Client Error:', err);
    });
  }

  /**
   * Syncs all application slash commands to Discord REST API
   */
  async syncSlashCommands() {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
      console.log('Running in mock Discord token mode. Skipping REST command registration.');
      return;
    }

    try {
      const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
      console.log(`Syncing ${slashCommands.length} slash commands to Discord API...`);

      const body = slashCommands.map((cmd) => cmd.toJSON());
      await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body }
      );
      console.log(`Successfully registered ${slashCommands.length} global slash commands.`);
    } catch (err: any) {
      console.error('Failed to register slash commands:', err?.message || err);
    }
  }

  async start(): Promise<void> {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
      console.log('Mock Discord mode active. Bot client initialized in standalone test configuration.');
      return;
    }
    await this.client.login(config.DISCORD_TOKEN);
  }
}

/**
 * Automatically discovers the primary/admin channel in a guild and sends the Server Setup Console
 */
export async function sendGuildSetupWelcome(guild: any): Promise<boolean> {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember) return false;

  const canSend = (ch: any) => {
    if (!ch || !ch.isTextBased()) return false;
    const perms = ch.permissionsFor(botMember);
    return perms?.has('ViewChannel') && perms?.has('SendMessages');
  };

  let targetChannel: any = null;
  if (guild.systemChannel && canSend(guild.systemChannel)) {
    targetChannel = guild.systemChannel;
  }

  if (!targetChannel) {
    const channels = Array.from(guild.channels.cache.values());
    const preferredNames = ['destiny', 'setup', 'bot-setup', 'admin', 'staff', 'mod', 'general', 'chat', 'lobby'];
    for (const name of preferredNames) {
      const match = channels.find((c: any) => c.name.toLowerCase().includes(name) && canSend(c));
      if (match) {
        targetChannel = match;
        break;
      }
    }
  }

  if (!targetChannel) {
    targetChannel = Array.from(guild.channels.cache.values()).find((c: any) => canSend(c));
  }

  if (targetChannel) {
    const settings = await db.getGuildSettings(guild.id);
    const container = embedService.createServerSetupContainer(guild, settings, targetChannel.id);
    await targetChannel.send({
      components: [container],
      flags: [MessageFlags.IsComponentsV2]
    }).catch(() => {});
    return true;
  }
  return false;
}

export const bot = new DestinyBot();

if (process.env.RUN_BOT === 'true') {
  bot.start().catch((err) => console.error('Failed to start Destiny Bot:', err));
}
