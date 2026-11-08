import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  REST, 
  Routes, 
  Events,
  MessageFlags
} from 'discord.js';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { ECLAIRS_GUILD_ID } from '../core/moderation/reputation.js';
import { embedService } from './embeds/index.js';
import { handleInteraction } from './interactions/handler.js';
import { messageCommandHandler } from './messages/handler.js';
import { messageRelayService } from './relay/index.js';
import { slashCommands } from './commands/definitions.js';

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
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
      ],
    });

    this.registerEvents();
  }

  private registerEvents() {
    this.client.once(Events.ClientReady, async (c) => {
      console.log(`🤖 Destiny Bot logged in as ${c.user.tag} (ID: ${c.user.id})`);
      await this.syncSlashCommands();
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
              await interaction.editReply({ content: '⚠️ An unexpected error occurred while processing this interaction.' });
            } else if (!interaction.replied) {
              await interaction.reply({ content: '⚠️ An unexpected error occurred while processing this interaction.', flags: MessageFlags.Ephemeral });
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
      console.log(`🤖 Destiny joined new server: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
      try {
        await sendGuildSetupWelcome(guild);
      } catch (err: any) {
        console.warn(`[Bot] Failed to send setup welcome in ${guild.name}:`, err?.message);
      }
    });

    // Enforce reputation drop when a member leaves discord.gg/eclairs
    this.client.on(Events.GuildMemberRemove, async (member) => {
      try {
        if (member.guild.id === ECLAIRS_GUILD_ID || member.guild.vanityURLCode === 'eclairs') {
          const user = await db.getUserByDiscordId(member.id, true);
          if (user) {
            console.log(`[Reputation] User ${member.user?.tag || member.id} left Eclairs. Dropping reputation < 10...`);
            user.reputationScore = 5; // Drops below 10
            user.isBanned = true;
            user.banReason = 'Left discord.gg/eclairs (Reputation dropped < 10)';

            if (user.activeRoomId) {
              await db.endRoom(user.activeRoomId, 'user_left');
            }

            await db.createOrUpdateUser(user);

            // Notify user in DM with the regain card
            try {
              const dm = await member.user.createDM();
              const container = embedService.createLowReputationRestrictedContainer();
              await dm.send({ components: [container], flags: [MessageFlags.IsComponentsV2] });
            } catch {}
          }
        }
      } catch (err: any) {
        console.error('[Bot] GuildMemberRemove event error:', err?.message || err);
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
      console.log('ℹ️ Running in mock Discord token mode. Skipping REST command registration.');
      return;
    }

    try {
      const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
      console.log(`🔄 Syncing ${slashCommands.length} slash commands to Discord API...`);

      const body = slashCommands.map((cmd) => cmd.toJSON());
      await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body }
      );
      console.log(`✅ Successfully registered ${slashCommands.length} global slash commands!`);
    } catch (err: any) {
      console.error('❌ Failed to register slash commands:', err?.message || err);
    }
  }

  async start(): Promise<void> {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
      console.log('ℹ️ Mock Discord mode active. Bot client initialized in standalone test configuration.');
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
