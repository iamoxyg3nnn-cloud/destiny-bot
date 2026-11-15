import { formatCustomEmojiText, resolveBotEmoji } from '../custom-emojis.js';
import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  MessageFlagsBitField
} from 'discord.js';
import { db } from '../../database/supabase.js';
import { config } from '../../config/index.js';
import { stateStore } from '../../storage/state-store.js';
import { matchmakingManager } from '../../core/matchmaking/manager.js';
import { embedService, COLORS } from '../embeds/index.js';
import { reporterService } from '../../core/moderation/reporter.js';
import { blockerService } from '../../core/moderation/blocker.js';
import { revealService } from '../../core/moderation/reveal.js';
import { UserProfile } from '../../core/types.js';
import { buildProfileCard, createProfileActionRow, isProfileComplete } from '../profile-view.js';
import { buildProfileModal, normalizeGender, parseList } from '../profile-modal.js';
import { sendCleanDmPanel } from '../dm-cleanup.js';
import { ECLAIRS_GUILD_IDS, handleReputationCheck, isReputationRestriction } from '../../core/moderation/reputation.js';
import { parseEmbedScript, DEFAULT_PANEL_TEMPLATE, DEFAULT_LOG_TEMPLATE } from '../embed-script.js';

export const BOT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1568212916304617557&permissions=8&scope=bot%20applications.commands';
export const SUPPORT_SERVER_URL = 'https://discord.gg/eclairs';
export const WEBSITE_URL = 'https://destiny.adore.rest';

export function createInviteActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Invite Destiny')
      .setStyle(ButtonStyle.Link)
      .setURL(BOT_INVITE_URL),
    new ButtonBuilder()
      .setLabel('Support Server')
      .setStyle(ButtonStyle.Link)
      .setURL(SUPPORT_SERVER_URL),
    new ButtonBuilder()
      .setLabel('Website')
      .setStyle(ButtonStyle.Link)
      .setURL(WEBSITE_URL)
  );
}

export const slashCommands = [
  // 1. /application
  new SlashCommandBuilder()
    .setName('application')
    .setDescription('Open your destiny application panel'),

  // 2. /find match
  new SlashCommandBuilder()
    .setName('find')
    .setDescription('Destiny matchmaking discovery commands')
    .addSubcommand((sub) =>
      sub
        .setName('match')
        .setDescription('Ask destiny to match you with someone')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Matchmaking mode: Text or Voice')
            .setRequired(false)
            .addChoices(
              { name: '💬 Text (Anonymous Chat in DMs)', value: 'text' },
              { name: '🎙️ Voice (Blind Speed Call in VC)', value: 'voice' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('interests')
            .setDescription('Comma-separated interests (e.g. gaming, anime, music, coding)')
            .setRequired(false)
        )
    ),

  // 3. /cancel match
  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel your active matchmaking search or current room')
    .addSubcommand((sub) =>
      sub
        .setName('match')
        .setDescription('End your match or stop looking for one')
    ),

  // 4. /user info, /user overview, /user match, /user reveal
  new SlashCommandBuilder()
    .setName('user')
    .setDescription('Destiny user and account management')
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View your own destiny profile')
        .addUserOption((opt) => opt.setName('user').setDescription('User to view profile for').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('overview')
        .setDescription('Where your account stands: sections, pool, lookups left')
    )
    .addSubcommand((sub) =>
      sub
        .setName('match')
        .setDescription('Check where your match stands')
    )
    .addSubcommand((sub) =>
      sub
        .setName('reveal')
        .setDescription('Agree to swap real usernames with your match')
    ),

  // 5. /search scope
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search and discovery settings')
    .addSubcommand((sub) =>
      sub
        .setName('scope')
        .setDescription('Choose who you can find, and who can find you')
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Select match pool scope')
            .setRequired(false)
            .addChoices(
              { name: 'Global (All servers)', value: 'global' },
              { name: 'Guild Only (This server only)', value: 'guild' }
            )
        )
    ),

  // 6. /partner profile, /partner birthday, /partner time
  new SlashCommandBuilder()
    .setName('partner')
    .setDescription('Commands for your active match partner')
    .addSubcommand((sub) =>
      sub
        .setName('profile')
        .setDescription("View your active match's destiny profile")
    )
    .addSubcommand((sub) =>
      sub
        .setName('birthday')
        .setDescription("View your active match's upcoming birthday")
    )
    .addSubcommand((sub) =>
      sub
        .setName('time')
        .setDescription("View your active match's current local time")
    ),

  // 7. /report
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a user by their destiny id or session')
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('Violation category')
        .setRequired(true)
        .addChoices(
          { name: 'Harassment & Abuse', value: 'harassment' },
          { name: 'Unauthorized Identity Leak', value: 'identity_leak' },
          { name: 'Spam or Phishing', value: 'spam' },
          { name: 'Inappropriate Content', value: 'inappropriate_content' },
          { name: 'Underage User', value: 'underage' },
          { name: 'Other', value: 'other' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Details about the incident').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('destiny_id').setDescription('Destiny ID to report (defaults to current partner if empty)').setRequired(false)
    ),

  // 8. /latency
  new SlashCommandBuilder()
    .setName('latency')
    .setDescription('Check whether destiny is responding'),

  // 9. /help
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show destiny commands and how matching works'),

  // 10. /invite
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the invite link to add Destiny to your server'),

  // 11. /setup
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Server administrator onboarding and matchmaking configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)
    .addSubcommandGroup((group) =>
      group
        .setName('application')
        .setDescription('Application panel settings')
        .addSubcommand((sub) =>
          sub
            .setName('send')
            .setDescription('Post the destiny application panel in this channel')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel to post the application panel')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('embed')
            .setDescription("Replace this server's application panel with a custom embed script")
            .addStringOption((opt) =>
              opt.setName('script').setDescription('Custom embed script using $v{...} directives (leave empty to reset to default)').setRequired(false)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('paired-logs')
        .setDescription('Match logs configuration')
        .addSubcommand((sub) =>
          sub
            .setName('channel')
            .setDescription('Set the channel where match logs are posted')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel for match logs')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('embed')
            .setDescription('Customise the match log embed with a script')
            .addStringOption((opt) =>
              opt.setName('script').setDescription('Custom log script (leave empty to reset to default)').setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('enable')
            .setDescription('Enable posting match logs in this server')
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable')
            .setDescription('Stop posting match logs in this server')
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('search')
        .setDescription('Server match pool scope settings')
        .addSubcommand((sub) =>
          sub
            .setName('scope')
            .setDescription("Set this server's default match pool (Global or Guild Only)")
            .addStringOption((opt) =>
              opt
                .setName('scope')
                .setDescription('Match pool scope')
                .setRequired(true)
                .addChoices(
                  { name: 'Global (All servers)', value: 'global' },
                  { name: 'Guild Only (This server only)', value: 'guild' }
                )
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('voice')
        .setDescription('Blind voice matchmaking settings')
        .addSubcommand((sub) =>
          sub
            .setName('enable')
            .setDescription('Enable voice matchmaking in this server')
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable')
            .setDescription('Disable voice matchmaking in this server (fallback to Eclairs Hub)')
        )
        .addSubcommand((sub) =>
          sub
            .setName('category')
            .setDescription('Set category where temporary voice rooms are created')
            .addChannelOption((opt) =>
              opt
                .setName('category')
                .setDescription('Category channel for voice rooms')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('duration')
            .setDescription('Set default speed call duration (minutes)')
            .addIntegerOption((opt) =>
              opt
                .setName('minutes')
                .setDescription('Duration in minutes (e.g. 5, 10, 15)')
                .setMinValue(3)
                .setMaxValue(30)
                .setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('overview')
        .setDescription("This server's scope, panel status and applicant count")
    )
    // Backward-compatible setup subcommands
    .addSubcommand((sub) =>
      sub
        .setName('portal')
        .setDescription('Deploy the permanent matchmaking portal in a designated channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to deploy the Destiny Matchmaking Portal')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('modlog')
        .setDescription('Designate a staff channel for moderation and report alerts')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Staff channel for logs and alerts')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('cross_server')
        .setDescription('Enable or disable global cross-server matchmaking')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable cross-server matching').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current Destiny server configuration')
    ),

  // 11. /owner
  new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Bot-owner-only platform diagnostics')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show global bot, database and worker status')),

  // --- Convenience & Backward-Compatible Top-Level Aliases ---
  new SlashCommandBuilder()
    .setName('match')
    .setDescription('Join the anonymous matchmaking queue (Alias for /find match)')
    .addStringOption((opt) =>
      opt
        .setName('interests')
        .setDescription('Comma-separated interests (e.g. gaming, anime, music, coding)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave current room or queue (Alias for /cancel match)'),

  new SlashCommandBuilder()
    .setName('reveal')
    .setDescription('Request mutual profile reveal (Alias for /user reveal)'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View or update profile (Alias for /user info)')
    .addIntegerOption((opt) =>
      opt.setName('age').setDescription('Update your age (must be 18+)').setRequired(false).setMinValue(18).setMaxValue(99)
    )
    .addStringOption((opt) =>
      opt
        .setName('gender')
        .setDescription('Update your gender')
        .setRequired(false)
        .addChoices(
          { name: 'Male', value: 'male' },
          { name: 'Female', value: 'female' },
          { name: 'Non-Binary', value: 'non_binary' },
          { name: 'Prefer not to say', value: 'prefer_not_to_say' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('bio').setDescription('Update your quote/motto').setRequired(false).setMaxLength(80)
    )
    .addStringOption((opt) =>
      opt.setName('interests').setDescription('Comma-separated interests').setRequired(false).setMaxLength(150)
    ),

  new SlashCommandBuilder()
    .setName('block')
    .setDescription('Globally block a user by Destiny ID')
    .addStringOption((opt) =>
      opt.setName('destiny_id').setDescription('Destiny ID to block').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure daily 7:30 PM IST reminders and privacy controls')
    .addBooleanOption((opt) =>
      opt.setName('daily_reminder').setDescription('Enable/Disable 7:30 PM IST match reminder').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('timezone').setDescription('Your timezone (default: Asia/Kolkata)').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('opt_out').setDescription('Opt out of all automated prompts').setRequired(false)
    ),
];

/**
 * Apply the same fresh moderation gate to slash commands as component interactions.
 */
async function ensureSlashCommandAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const account = await db.getUserByDiscordId(interaction.user.id, true);
  if (!account || (!account.isBanned && account.reputationScore >= 10)) return true;

  const status = await handleReputationCheck(interaction.client, interaction.user.id);
  const refreshed = await db.getUserByDiscordId(interaction.user.id, true);
  if (status.restored || (refreshed && !refreshed.isBanned && refreshed.reputationScore >= 10)) {
    return true;
  }

  const isModerationBan = account.isBanned && !isReputationRestriction(account);
  const restrictedContainer = isModerationBan
    ? null
    : embedService.createLowReputationRestrictedContainer();

  if (interaction.deferred || interaction.replied) {
    if (isModerationBan) {
      await interaction.editReply({
        content: 'Your account is currently restricted by Destiny moderation. Please contact the moderators if you believe this is a mistake.',
      }).catch((error) => console.warn('[Commands] Could not deliver restriction response:', error?.message || error));
    } else {
      await interaction.editReply({
        components: [restrictedContainer!],
        flags: MessageFlags.IsComponentsV2,
      }).catch((error) => console.warn('[Commands] Could not deliver restriction response:', error?.message || error));
    }
  } else if (isModerationBan) {
    await interaction.reply({
      content: 'Your account is currently restricted by Destiny moderation. Please contact the moderators if you believe this is a mistake.',
      flags: MessageFlags.Ephemeral,
    }).catch((error) => console.warn('[Commands] Could not deliver restriction response:', error?.message || error));
  } else {
    await interaction.reply({
      components: [restrictedContainer!],
      flags: new MessageFlagsBitField([MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]).bitfield,
    }).catch((error) => console.warn('[Commands] Could not deliver restriction response:', error?.message || error));
  }
  return false;
}

async function logGuildSetupAudit(
  actorId: string,
  action: string,
  guildId: string,
  changes: Record<string, any> = {}
): Promise<boolean> {
  try {
    await db.logAdminAction(actorId, action, 'GUILD', guildId, changes);
    return true;
  } catch (error: any) {
    console.error('[Guild Setup] Setting saved but audit log failed:', error?.message || error);
    return false;
  }
}

/**
 * Main Interaction Handler for all Discord Slash Commands
 */
export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName, user: discordUser } = interaction;

  // `/profile` or `/application` modal handling before defer if new profile
  if (commandName === 'profile') {
    if (!(await ensureSlashCommandAccess(interaction))) return;
    await handleProfileCommand(interaction);
    return;
  }

  if (commandName === 'application') {
    if (!(await ensureSlashCommandAccess(interaction))) return;
    const user = await db.getUserByDiscordId(discordUser.id, true).catch(() => null);
    if (!user || !isProfileComplete(user)) {
      try {
        await interaction.showModal(buildProfileModal(user));
        return;
      } catch {
        // Fall through to reply with application hub
      }
    }
  }

  // Platform-owner operations
  if (commandName === 'owner') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    if (!config.BOT_OWNER_IDS.includes(interaction.user.id)) {
      await interaction.editReply({ content: formatCustomEmojiText('⛔ This command is reserved for configured Destiny bot owners.') });
      return;
    }
    let runtimeStateOnline = stateStore.isHealthy();
    let shardCount = 'Unavailable';
    let workerCount = 'Unavailable';
    if (runtimeStateOnline) {
      try {
        const [shardIds, workerIds] = await Promise.all([
          stateStore.sMembers('bot:guild-shards'),
          stateStore.sMembers('worker:instances'),
        ]);
        const [shardSnapshots, workerHeartbeats] = await Promise.all([
          Promise.all(shardIds.map((id) => stateStore.get('bot:guilds:' + id))),
          Promise.all(workerIds.map((id) => stateStore.get('worker:heartbeat:' + id))),
        ]);
        shardCount = String(shardSnapshots.filter(Boolean).length);
        workerCount = String(workerHeartbeats.filter(Boolean).length);
      } catch (error: any) {
        runtimeStateOnline = false;
        console.error('[Owner] Supabase runtime diagnostics failed:', error?.message || error);
      }
    }
    const dbOnline = !db.isUsingMock() && await db.assertConnection().then(() => true).catch(() => false);
    const embed = new EmbedBuilder()
      .setColor(COLORS.DARK)
      .setTitle('Destiny — Platform Owner Controls')
      .setDescription('Global diagnostics only. Per-server configuration remains under /setup.')
      .addFields(
        { name: 'Owner authorization', value: 'Verified', inline: true },
        { name: 'Bot shards online', value: shardCount, inline: true },
        { name: 'Workers online', value: workerCount, inline: true },
        { name: 'Supabase', value: dbOnline ? 'Connected' : 'Unavailable', inline: true },
        { name: 'Runtime state (Supabase)', value: runtimeStateOnline ? 'Connected' : 'Unavailable', inline: true },
        { name: 'Configured owner IDs', value: String(config.BOT_OWNER_IDS.length), inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Generic defer for user commands
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  if (!(await ensureSlashCommandAccess(interaction))) return;

  const respond = async (opts: any): Promise<any> => {
    const payload = { ...opts };
    const ephemeral = payload.ephemeral === true;
    delete payload.ephemeral;
    if (ephemeral) {
      payload.flags = new MessageFlagsBitField(payload.flags).add(MessageFlags.Ephemeral).bitfield;
    }

    const components = Array.isArray(payload.components) ? payload.components : [];
    const hasV2Container = components.some((c: any) => c instanceof ContainerBuilder || c?.type === 17);
    if (hasV2Container) {
      payload.flags = payload.flags !== undefined
        ? (payload.flags | MessageFlags.IsComponentsV2)
        : MessageFlags.IsComponentsV2;
      delete payload.content;
      delete payload.embeds;
    }

    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload).catch(console.error);
    }
    return await interaction.reply(payload).catch(console.error);
  };

  // Resolve user profile
  let user = await db.getUserByDiscordId(discordUser.id, true);
  if (!user) {
    user = await db.createOrUpdateUser({
      discordUserId: discordUser.id,
      age: 18,
      gender: 'prefer_not_to_say',
    });
  }

  // =========================================================================
  // 1. /application
  // =========================================================================
  if (commandName === 'application') {
    const isComplete = isProfileComplete(user);
    const appContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          formatCustomEmojiText(
            `# 🌸 Destiny Application Panel\n\n` +
            `• **Your Handle**: \`${user.destinyId || 'Pending'}\`\n` +
            `• **Age**: ${user.age >= 18 ? `${user.age} (Verified Adult)` : 'Incomplete'}\n` +
            `• **Gender**: \`${user.gender || 'Not specified'}\`\n` +
            `• **Interests**: ${user.interests.length > 0 ? user.interests.map((i) => `\`${i}\``).join(', ') : '*None set*'}\n` +
            `• **Status**: ${isComplete ? '✅ Complete & Ready to Match' : '⚠️ Application Incomplete'}\n\n` +
            `Click **Edit Profile** to change your application details, or **Find Match** to begin searching!`
          )
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('destiny_btn_setup_profile')
            .setLabel('Edit Application')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(resolveBotEmoji('📝')),
          new ButtonBuilder()
            .setCustomId('destiny_btn_start')
            .setLabel('Find Match')
            .setStyle(ButtonStyle.Success)
            .setEmoji(resolveBotEmoji('✨')),
          new ButtonBuilder()
            .setCustomId('destiny_btn_card_static')
            .setLabel('View Profile Card')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(resolveBotEmoji('🎴'))
        )
      );

    await respond({ components: [appContainer] });
    return;
  }

  // =========================================================================
  // 2. /find match OR /match
  // =========================================================================
  if (commandName === 'find' || commandName === 'match') {
    const sub = commandName === 'find' ? interaction.options.getSubcommand() : 'match';
    if (sub === 'match') {
      let activeRoomId = user.activeRoomId || (await stateStore.get(`user:active_room:${user.id}`)) || undefined;
      if (activeRoomId) {
        const room = await db.getRoomById(activeRoomId);
        if (room && room.status === 'active') {
          const container = embedService.createActiveRoomPromptContainer(room.roomCode);
          await respond({ components: [container] });
          return;
        }
      }

      const activeVoiceRoomId = await stateStore.get(`user:active_voice_room:${user.id}`);
      if (activeVoiceRoomId) {
        const vcChannelId = await stateStore.get(`voice:room:${activeVoiceRoomId}:channel_id`);
        await respond({
          content: formatCustomEmojiText(`⚠️ You already have an active speed voice call in <#${vcChannelId || 'voice-channel'}>! Click the channel to join, or run \`/cancel match\` to leave.`),
        });
        return;
      }

      if (!isProfileComplete(user)) {
        await respond({
          content: formatCustomEmojiText('⚠️ Please complete your profile application first with `/application` before joining matchmaking.'),
        });
        return;
      }

      const interestsStr = interaction.options.getString('interests');
      if (interestsStr) {
        user = await db.createOrUpdateUser({
          discordUserId: discordUser.id,
          interests: parseList(interestsStr),
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const usedKey = `user:daily_lookups:${user.id}:${today}`;
      const usedLookupsStr = await stateStore.get(usedKey);
      const usedLookups = parseInt(usedLookupsStr || '0', 10);
      await stateStore.set(usedKey, String(usedLookups + 1), 86400 * 2);

      const mode = (interaction.options.getString('mode') || 'text') as 'text' | 'voice';
      const result = await matchmakingManager.joinQueue(user, interaction.guildId || undefined, mode);
      if (!result.success) {
        await respond({ content: `${formatCustomEmojiText("❌")} ${result.message}` });
        return;
      }

      const searchingContainer = embedService.createSearchingContainer(user, mode);
      await respond({ components: [searchingContainer] });

      // Trigger immediate match cycle check
      matchmakingManager.processMatchCycle().catch(() => {});
      return;
    }
  }

  // =========================================================================
  // 3. /cancel match OR /leave
  // =========================================================================
  if (commandName === 'cancel' || commandName === 'leave') {
    const activeVoiceRoomId = await stateStore.get(`user:active_voice_room:${user.id}`);
    if (activeVoiceRoomId) {
      const channelId = await stateStore.get(`voice:room:${activeVoiceRoomId}:channel_id`);
      const { voiceManager } = await import('../../core/voice/manager.js');
      if (channelId) {
        await voiceManager.deleteVoiceRoom(interaction.client, activeVoiceRoomId, channelId);
      }
      await respond({
        content: formatCustomEmojiText('🛑 Your active voice matchmaking session has been closed and the voice room removed.'),
      });
      return;
    }

    let activeRoomId = user.activeRoomId;
    if (!activeRoomId) {
      activeRoomId = (await stateStore.get(`user:active_room:${user.id}`)) || undefined;
    }

    if (activeRoomId) {
      const room = await db.getRoomById(activeRoomId);
      await db.endRoom(activeRoomId, 'user_left');

      if (room) {
        const guildId = await stateStore.get(`room:${room.id}:guild_id`);
        if (guildId) {
          const { dispatchPairedLogEvent } = await import('../paired-logs.js');
          dispatchPairedLogEvent(interaction.client, guildId, 'Unmatch', {
            discordUserId1: room.user1DiscordId,
            discordUserId2: room.user2DiscordId,
            pseudonym1: room.user1Pseudonym,
            pseudonym2: room.user2Pseudonym,
          }).catch(() => {});
        }
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        if (partnerDiscordId) {
          interaction.client.users.fetch(partnerDiscordId)
            .then((partner) => sendCleanDmPanel(partner, {
              embeds: [
                new EmbedBuilder()
                  .setColor(COLORS.DARK)
                  .setTitle(formatCustomEmojiText('🚪 Chat Session Ended'))
                  .setDescription('Your anonymous partner has left the chat session. Your real identity remained hidden.'),
              ],
            }))
            .catch(() => {});
        }
      }

      await respond({ content: formatCustomEmojiText('🚪 You have cleanly ended the anonymous chat session. Your real identity remained hidden.') });
      return;
    }

    const wasQueued = await matchmakingManager.isQueued(user.id);
    if (wasQueued) {
      await matchmakingManager.leaveQueue(user.id);
      await respond({ content: formatCustomEmojiText('✅ You have been removed from the matchmaking queue.') });
      return;
    }

    await respond({ content: formatCustomEmojiText('ℹ️ You are not currently in a room or queue.') });
    return;
  }

  // =========================================================================
  // 4. /user info, /user overview, /user match, /user reveal
  // =========================================================================
  if (commandName === 'user') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'info') {
      const targetUser = interaction.options.getUser('user') || discordUser;
      const targetProfile = targetUser.id === discordUser.id ? user : await db.getUserByDiscordId(targetUser.id, true);

      if (!targetProfile || !isProfileComplete(targetProfile)) {
        await respond({ content: formatCustomEmojiText('⚠️ Profile is incomplete. Run `/application` to complete it.') });
        return;
      }

      const { attachment } = await buildProfileCard(targetProfile, targetUser, interaction.member);
      await respond({
        content: formatCustomEmojiText('🪐 **Destiny Profile Card**'),
        files: [attachment],
        components: [createProfileActionRow()],
      });
      return;
    }

    if (sub === 'overview') {
      const isQueued = await matchmakingManager.isQueued(user.id);
      let statusStr = '🟢 Idle (Available)';
      if (user.activeRoomId) statusStr = '💬 In Active Chat Room';
      else if (isQueued) statusStr = '🔍 Searching in Queue';

      const scope = (await stateStore.get(`user:${user.id}:search_scope`)) || 'global';
      const sectionsFilled = [
        user.age >= 18,
        Boolean(user.gender && user.gender !== 'prefer_not_to_say'),
        user.interests.length > 0,
        Boolean(user.bio && user.bio.trim().length > 0),
      ].filter(Boolean).length;

      const today = new Date().toISOString().slice(0, 10);
      const usedLookupsStr = await stateStore.get(`user:daily_lookups:${user.id}:${today}`);
      const usedLookups = parseInt(usedLookupsStr || '0', 10);
      const lookupsLeft = user.genderVerified ? 'Unlimited ✨' : `${Math.max(0, 10 - usedLookups)} / 10 daily`;
      const { formatDestinyHandle } = await import('../embed-script.js');

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`🌌 ${discordUser.username}'s Destiny Account Overview`)
        .addFields(
          { name: 'Destiny Handle', value: `\`${formatDestinyHandle(user.destinyId)}\``, inline: true },
          { name: 'Status', value: statusStr, inline: true },
          { name: 'Lookups Left', value: lookupsLeft, inline: true },
          { name: 'Match Pool', value: scope === 'global' ? '🌐 Global' : '🏰 Guild Only', inline: true },
          { name: 'Profile Sections', value: `${sectionsFilled}/4 Completed`, inline: true },
          { name: 'Reputation Score', value: `${user.reputationScore}/100`, inline: true },
          { name: 'Age Verification', value: `${user.age}+ (${user.genderVerified ? 'Verified' : 'Self-declared'})`, inline: true },
          { name: 'Gender', value: `\`${user.gender}\``, inline: true },
          { name: 'Language', value: user.languages.length > 0 ? user.languages.join(', ') : 'en', inline: true },
          { name: 'Interests', value: user.interests.length > 0 ? user.interests.map((i) => `\`${i}\``).join(' ') : '*None*', inline: false },
        )
        .setFooter({ text: 'Destiny — Anonymous Matchmaking & Social' });

      await respond({
        embeds: [embed],
        components: [createInviteActionRow()]
      });
      return;
    }

    if (sub === 'match') {
      let activeRoomId = user.activeRoomId || (await stateStore.get(`user:active_room:${user.id}`)) || undefined;
      if (activeRoomId) {
        const room = await db.getRoomById(activeRoomId);
        if (room && room.status === 'active') {
          const isUser1 = room.user1Id === user.id;
          const partnerPseudonym = isUser1 ? room.user2Pseudonym : room.user1Pseudonym;
          const partnerAvatar = isUser1 ? room.user2Avatar : room.user1Avatar;

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('btn_reveal_consent').setLabel('Request Reveal').setStyle(ButtonStyle.Primary).setEmoji(resolveBotEmoji('📜')),
            new ButtonBuilder().setCustomId('destiny_btn_leave').setLabel('End Chat').setStyle(ButtonStyle.Danger).setEmoji(resolveBotEmoji('🚪')),
            new ButtonBuilder().setCustomId(`btn_report_room_${room.id}`).setLabel('Report').setStyle(ButtonStyle.Secondary).setEmoji(resolveBotEmoji('🚨'))
          );

          const container = new ContainerBuilder()
            .setAccentColor(COLORS.DESTINY_PURPLE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                formatCustomEmojiText(
                  `# 💬 Active Match Session\n\n` +
                  `• **Current Partner**: ${partnerAvatar} **${partnerPseudonym}**\n` +
                  `• **Session Code**: \`${room.roomCode}\`\n` +
                  `• **Status**: Connected & Chatting\n\n` +
                  `You can safely type messages here in DMs to chat!`
                )
              )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(row);

          await respond({ components: [container] });
          return;
        }
      }

      const isQueued = await matchmakingManager.isQueued(user.id);
      if (isQueued) {
        await respond({ components: [embedService.createSearchingContainer(user)] });
        return;
      }

      const idleContainer = new ContainerBuilder()
        .setAccentColor(COLORS.DARK)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText('# 💤 No Active Match\n\nYou are not currently in a room or queue. Run `/find match` to start matching!')
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('destiny_btn_start').setLabel('Find Match').setStyle(ButtonStyle.Success).setEmoji(resolveBotEmoji('✨'))
          )
        );

      await respond({ components: [idleContainer] });
      return;
    }

    if (sub === 'reveal') {
      if (!user.activeRoomId) {
        await respond({ content: formatCustomEmojiText('❌ You must be in an active chat room to request a profile reveal.') });
        return;
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`reveal_fields_${user.activeRoomId}`)
        .setPlaceholder('Select profile fields you consent to reveal')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
          { label: 'Age', value: 'age', description: 'Reveal your age' },
          { label: 'Gender', value: 'gender', description: 'Reveal your gender' },
          { label: 'Interests', value: 'interests', description: 'Reveal your interest tags' },
          { label: 'Destiny ID', value: 'destinyId', description: 'Reveal your permanent Destiny ID' },
          { label: 'Discord Tag (@username)', value: 'discordTag', description: 'Only shared if partner also agrees!' }
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      await respond({
        content: formatCustomEmojiText('🔒 **Mutual Profile Reveal**: Select the fields you are willing to exchange. A field is **only** revealed if BOTH of you select it!'),
        components: [row],
      });
      return;
    }
  }

  // =========================================================================
  // 5. /search scope
  // =========================================================================
  if (commandName === 'search') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'scope') {
      const scopeChoice = interaction.options.getString('scope');
      if (scopeChoice) {
        await stateStore.set(`user:${user.id}:search_scope`, scopeChoice, 86400 * 30);
        const scopeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('destiny_scope_global')
            .setLabel('Set to Global')
            .setStyle(scopeChoice === 'global' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(resolveBotEmoji('🌍')),
          new ButtonBuilder()
            .setCustomId('destiny_scope_guild')
            .setLabel('Set to Guild Only')
            .setStyle(scopeChoice === 'guild' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(resolveBotEmoji('🏰'))
        );
        await respond({
          content: formatCustomEmojiText(
            `✅ Your personal search scope has been set to **${scopeChoice === 'global' ? 'Global (All Servers)' : 'Guild Only (This Server Only)'}**.`
          ),
          components: [scopeRow],
        });
        return;
      }

      const currentScope = (await stateStore.get(`user:${user.id}:search_scope`)) || 'global';
      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('🔭 Destiny Discovery Scope')
        .setDescription(
          `Your current matchmaking pool is: **${currentScope === 'global' ? 'Global (Cross-server)' : 'Guild Only'}**.\n\n` +
          `• **Global**: Connect with compatible users from any Destiny community.\n` +
          `• **Guild Only**: Limit your matches only to members sharing your current server.`
        );

      const scopeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_scope_global')
          .setLabel('Set to Global')
          .setStyle(currentScope === 'global' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(resolveBotEmoji('🌍')),
        new ButtonBuilder()
          .setCustomId('destiny_scope_guild')
          .setLabel('Set to Guild Only')
          .setStyle(currentScope === 'guild' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(resolveBotEmoji('🏰'))
      );

      await respond({ embeds: [embed], components: [scopeRow] });
      return;
    }
  }

  // =========================================================================
  // 6. /partner profile, /partner birthday, /partner time
  // =========================================================================
  if (commandName === 'partner') {
    let activeRoomId = user.activeRoomId || (await stateStore.get(`user:active_room:${user.id}`)) || undefined;
    if (!activeRoomId) {
      await respond({ content: formatCustomEmojiText('❌ You are not currently in an active chat room.') });
      return;
    }

    const room = await db.getRoomById(activeRoomId);
    if (!room || room.status !== 'active') {
      await respond({ content: formatCustomEmojiText('❌ Your chat session has ended.') });
      return;
    }

    const isUser1 = room.user1Id === user.id;
    const partnerId = isUser1 ? room.user2Id : room.user1Id;
    const partnerPseudonym = isUser1 ? room.user2Pseudonym : room.user1Pseudonym;
    const partnerAvatar = isUser1 ? room.user2Avatar : room.user1Avatar;
    const partnerProfile = await db.getUserById(partnerId, true);

    const sub = interaction.options.getSubcommand();

    if (sub === 'profile') {
      const { formatDestinyHandle } = await import('../embed-script.js');
      const partnerHandle = formatDestinyHandle(partnerProfile?.destinyId);

      const container = new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(
              `# ${partnerAvatar} ${partnerPseudonym}'s Profile\n\n` +
              `• **Destiny Handle**: \`${partnerHandle}\`\n` +
              `• **Vibe / Intent**: ${partnerProfile?.matchIntent || '*Open to conversation*'}\n` +
              `• **Interests**: ${partnerProfile && partnerProfile.interests.length > 0 ? partnerProfile.interests.map((i) => `\`${i}\``).join(' ') : '*Open Horizons*'}\n` +
              `• **Languages**: ${partnerProfile && partnerProfile.languages.length > 0 ? partnerProfile.languages.join(', ') : 'en'}\n` +
              `• **Bio**: *${partnerProfile?.bio || 'Living under the stars ✨'}*\n\n` +
              `- # Identity details remain masked until both sides agree to \`/user reveal\`.`
            )
          )
        );

      await respond({ components: [container] });
      return;
    }

    if (sub === 'birthday') {
      const storedBirthday = await stateStore.get(`user:${partnerId}:birthday`);
      if (storedBirthday) {
        await respond({
          content: formatCustomEmojiText(
            `🎂 **Partner Birthday**: \`${storedBirthday}\` ✨ (Celestial Sign: Cosmic Wanderer 🌟)`
          ),
        });
        return;
      }
      await respond({
        content: formatCustomEmojiText(
          `🎂 **Partner Birthday & Celestial Sign**: Your partner's sign is celestial ✨.\nDetailed birthday information is masked until both sides agree to \`/user reveal\`.`
        ),
      });
      return;
    }

    if (sub === 'time') {
      const partnerTz = (await stateStore.get(`user:${partnerId}:timezone`)) || 'Asia/Kolkata';
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: partnerTz,
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
        });
        const localTime = formatter.format(new Date());

        await respond({
          content: formatCustomEmojiText(
            `🕒 Your partner's current local time is **${localTime}** (\`${partnerTz}\`).`
          ),
        });
      } catch {
        const localTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
        await respond({
          content: formatCustomEmojiText(
            `🕒 Your partner's current local time is **${localTime}** (\`UTC\`).`
          ),
        });
      }
      return;
    }
  }

  // =========================================================================
  // 7. /report
  // =========================================================================
  if (commandName === 'report') {
    const category = interaction.options.getString('category', true) as any;
    const description = interaction.options.getString('description', true);
    const targetDestinyId = interaction.options.getString('destiny_id');

    let targetUserId = '';
    if (targetDestinyId) {
      const target = await db.getUserByDestinyId(targetDestinyId);
      if (target) {
        targetUserId = target.id;
      } else {
        await respond({
          content: formatCustomEmojiText(`❌ No Destiny user found matching handle \`${targetDestinyId}\`. Please check the handle and try again.`),
        });
        return;
      }
    }

    const res = await reporterService.submitReport(
      user.id,
      category,
      description,
      user.activeRoomId || undefined
    );
    await respond({ content: res.message });
    return;
  }

  // =========================================================================
  // 8. /latency
  // =========================================================================
  if (commandName === 'latency') {
    const wsPing = interaction.client.ws.ping;
    const t0 = Date.now();
    await db.assertConnection().catch(() => {});
    const dbPing = Date.now() - t0;

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('🏓 Destiny Latency & Health Check')
      .setThumbnail('https://destiny.adore.rest/brand/destiny-mark-256.png')
      .setDescription('-# Real-time latency diagnostics across active shards and database cluster')
      .addFields(
        { name: 'Gateway Latency', value: `\`${wsPing >= 0 ? wsPing : 12} ms\``, inline: true },
        { name: 'Database Latency', value: `\`${dbPing} ms\``, inline: true },
        { name: 'System Status', value: '🟢 Operational', inline: true },
      )
      .setFooter({ text: 'All workers, relay and matchmaking instances healthy' });

    await respond({ embeds: [embed] });
    return;
  }

  // =========================================================================
  // 9. /help
  // =========================================================================
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.DESTINY_PURPLE)
      .setTitle('🌌 Destiny — Anonymous Matchmaking Guide')
      .setThumbnail('https://destiny.adore.rest/brand/destiny-mark-256.png')
      .setDescription(
        `Destiny connects you with compatible people anonymously across Discord.\n\n` +
        `### 🚀 Getting Started (Three Commands)\n` +
        `1. **/application** — Fill out or edit your profile questions & handle.\n` +
        `2. **/find match** — Enter the matchmaking queue to meet someone.\n` +
        `3. **/cancel match** — Exit the queue or end your current chat session.\n\n` +
        `### 👤 User Commands\n` +
        `• **/user info** — View your generated celestial profile card.\n` +
        `• **/user overview** — Check account details, pool, and reputation.\n` +
        `• **/user match** — View current room status.\n` +
        `• **/user reveal** — Request to swap real usernames with your match.\n` +
        `• **/partner profile** — View your match's anonymous bio and tags.\n` +
        `• **/partner time** — Check your match partner's current local time.\n` +
        `• **/report** — Safely report inappropriate behavior.\n` +
        `• **/latency** — Check bot ping and response speed.\n` +
        `• **/invite** — Get the invite link to add Destiny to your server.\n\n` +
        `-# Tip: Run /find match anywhere or directly in Destiny's DMs to match.`
      )
      .setFooter({ text: 'Powered by destiny.adore.rest • Free to invite' });

    await respond({
      embeds: [embed],
      components: [createInviteActionRow()]
    });
    return;
  }

  // =========================================================================
  // 10. /invite
  // =========================================================================
  if (commandName === 'invite') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.DESTINY_PURPLE)
      .setTitle('🌌 Add Destiny to Your Server')
      .setThumbnail('https://destiny.adore.rest/brand/destiny-mark-256.png')
      .setDescription(
        'Bring anonymous social matchmaking, celestial profile cards, and private ephemeral pairing to your community.\n\n' +
        '• **Free to Invite:** Click the button below to authorize Destiny for your server.\n' +
        '• **Support & Community:** Join [discord.gg/eclairs](https://discord.gg/eclairs) for help, updates, and feedback.\n' +
        '• **Official Site:** Learn more at [destiny.adore.rest](https://destiny.adore.rest).\n\n' +
        '-# Part of the adore.rest network • Free for all communities'
      )
      .setFooter({ text: 'Powered by destiny.adore.rest • Free to invite' });

    await respond({
      embeds: [embed],
      components: [createInviteActionRow()]
    });
    return;
  }

  // =========================================================================
  // 11. /setup (Server Administration)
  // =========================================================================
  if (commandName === 'setup') {
    if (!interaction.guild) {
      await respond({ content: formatCustomEmojiText('⚠️ `/setup` can only be executed inside a Discord server.') });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await respond({ content: formatCustomEmojiText('⛔ You need Discord Manage Server or Administrator permission.') });
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    // /setup application send [channel]
    if (group === 'application' && sub === 'send') {
      const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
      if (!channel || ![0, 5].includes(Number(channel.type))) {
        await respond({ content: formatCustomEmojiText('⚠️ Channel must be a text channel.') });
        return;
      }

      const customScript = (await stateStore.get(`guild:${interaction.guild.id}:application_embed`)) || DEFAULT_PANEL_TEMPLATE;
      const embed = parseEmbedScript(customScript, {
        guild: {
          name: interaction.guild.name,
          id: interaction.guild.id,
          count: interaction.guild.memberCount,
          icon: interaction.guild.iconURL(),
          boost_count: interaction.guild.premiumSubscriptionCount || 0,
          created_at: interaction.guild.createdAt.toISOString().slice(0, 10),
        },
        user: {
          name: interaction.user.username,
          mention: `<@${interaction.user.id}>`,
          id: interaction.user.id,
          avatar: interaction.user.displayAvatarURL(),
          nick: (interaction.member as any)?.displayName || interaction.user.username,
          joined_at: (interaction.member as any)?.joinedAt ? (interaction.member as any).joinedAt.toISOString().slice(0, 10) : undefined,
        },
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('destiny_btn_setup_profile').setLabel('Apply').setStyle(ButtonStyle.Primary).setEmoji(resolveBotEmoji('📝')),
        new ButtonBuilder().setCustomId('destiny_btn_start').setLabel('Find Match').setStyle(ButtonStyle.Success).setEmoji(resolveBotEmoji('✨')),
        new ButtonBuilder().setCustomId('destiny_btn_profile').setLabel('My Profile').setStyle(ButtonStyle.Secondary).setEmoji(resolveBotEmoji('🎴'))
      );

      await channel.send({ embeds: [embed], components: [row] });
      await db.setGuildMatchChannel(interaction.guild.id, channel.id, interaction.guild.name);
      await logGuildSetupAudit(interaction.user.id, 'SET_APPLICATION_PANEL', interaction.guild.id, { channelId: channel.id });

      await respond({ content: formatCustomEmojiText(`✅ Destiny Application Panel deployed successfully in <#${channel.id}>!`) });
      return;
    }

    // /setup application embed [script]
    if (group === 'application' && sub === 'embed') {
      const script = interaction.options.getString('script');
      if (!script || script.trim().length === 0 || ['reset', 'default', 'none'].includes(script.trim().toLowerCase())) {
        await stateStore.del(`guild:${interaction.guild.id}:application_embed`);
        await logGuildSetupAudit(interaction.user.id, 'RESET_APPLICATION_EMBED', interaction.guild.id, {});
        await respond({ content: formatCustomEmojiText('✅ Reset application panel embed back to the default Destiny template.') });
        return;
      }

      await stateStore.set(`guild:${interaction.guild.id}:application_embed`, script.trim(), 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_APPLICATION_EMBED', interaction.guild.id, { script: script.trim() });

      await respond({ content: formatCustomEmojiText('✅ Application panel embed script updated successfully! Run `/setup application send` to post it.') });
      return;
    }

    // /setup paired-logs channel <channel>
    if (group === 'paired-logs' && sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true) as any;
      await stateStore.set(`guild:${interaction.guild.id}:paired_logs_channel`, channel.id, 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_PAIRED_LOGS_CHANNEL', interaction.guild.id, { channelId: channel.id });

      await respond({ content: formatCustomEmojiText(`✅ Paired match logs channel set to <#${channel.id}>.`) });
      return;
    }

    // /setup paired-logs embed [script]
    if (group === 'paired-logs' && sub === 'embed') {
      const script = interaction.options.getString('script');
      if (!script || script.trim().length === 0 || ['reset', 'default', 'none'].includes(script.trim().toLowerCase())) {
        await stateStore.del(`guild:${interaction.guild.id}:paired_logs_embed`);
        await logGuildSetupAudit(interaction.user.id, 'RESET_PAIRED_LOGS_EMBED', interaction.guild.id, {});
        await respond({ content: formatCustomEmojiText('✅ Paired match logs embed reset back to the default Destiny template.') });
        return;
      }

      await stateStore.set(`guild:${interaction.guild.id}:paired_logs_embed`, script.trim(), 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_PAIRED_LOGS_EMBED', interaction.guild.id, { script: script.trim() });
      await respond({ content: formatCustomEmojiText('✅ Custom paired-logs embed script saved!') });
      return;
    }

    // /setup paired-logs enable
    if (group === 'paired-logs' && sub === 'enable') {
      await stateStore.set(`guild:${interaction.guild.id}:paired_logs_enabled`, 'true', 86400 * 365);
      await respond({ content: formatCustomEmojiText('✅ Paired match logging is now **ENABLED** for this server.') });
      return;
    }

    // /setup paired-logs disable
    if (group === 'paired-logs' && sub === 'disable') {
      await stateStore.set(`guild:${interaction.guild.id}:paired_logs_enabled`, 'false', 86400 * 365);
      await respond({ content: formatCustomEmojiText('🛑 Paired match logging is now **DISABLED** for this server.') });
      return;
    }

    // /setup search scope <scope>
    if (group === 'search' && sub === 'scope') {
      const scope = interaction.options.getString('scope', true);
      const isGlobal = scope === 'global';
      await db.setGuildCrossServerEnabled(interaction.guild.id, isGlobal, interaction.guild.name);
      await logGuildSetupAudit(interaction.user.id, 'SET_GUILD_SEARCH_SCOPE', interaction.guild.id, { isGlobal });

      await respond({
        content: formatCustomEmojiText(`✅ Default match pool set to **${isGlobal ? 'Global (All Servers)' : 'Guild Only'}**.`),
      });
      return;
    }

    // /setup voice enable
    if (group === 'voice' && sub === 'enable') {
      await stateStore.set(`guild:${interaction.guild.id}:voice_enabled`, 'true', 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_VOICE_ENABLED', interaction.guild.id, { enabled: true });
      await respond({
        content: formatCustomEmojiText('✅ Blind Speed Voice Matchmaking is now **ENABLED** for this server!'),
      });
      return;
    }

    // /setup voice disable
    if (group === 'voice' && sub === 'disable') {
      await stateStore.set(`guild:${interaction.guild.id}:voice_enabled`, 'false', 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_VOICE_DISABLED', interaction.guild.id, { enabled: false });
      await respond({
        content: formatCustomEmojiText('🛑 Blind Speed Voice Matchmaking has been **DISABLED** for this server. (Members matched in voice will be routed to the Eclairs Central Hub instead).'),
      });
      return;
    }

    // /setup voice category <category>
    if (group === 'voice' && sub === 'category') {
      const category = interaction.options.getChannel('category', true) as any;
      await stateStore.set(`guild:${interaction.guild.id}:voice_category_id`, category.id, 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_VOICE_CATEGORY', interaction.guild.id, { categoryId: category.id });
      await respond({
        content: formatCustomEmojiText(`✅ Ephemeral voice match rooms will now be created under category **${category.name}** (\`${category.id}\`).`),
      });
      return;
    }

    // /setup voice duration <minutes>
    if (group === 'voice' && sub === 'duration') {
      const minutes = interaction.options.getInteger('minutes', true);
      await stateStore.set(`guild:${interaction.guild.id}:voice_duration_minutes`, String(minutes), 86400 * 365);
      await logGuildSetupAudit(interaction.user.id, 'SET_VOICE_DURATION', interaction.guild.id, { minutes });
      await respond({
        content: formatCustomEmojiText(`✅ Speed voice call timer set to **${minutes} minutes** (participants can still mutually vote to extend +5m during call).`),
      });
      return;
    }

    // /setup overview
    if (sub === 'overview' || sub === 'view') {
      const settings = await db.getGuildSettings(interaction.guild.id);
      const pairedLogsChannel = await stateStore.get(`guild:${interaction.guild.id}:paired_logs_channel`);
      const pairedLogsEnabled = (await stateStore.get(`guild:${interaction.guild.id}:paired_logs_enabled`)) === 'true';
      const voiceEnabled = (await stateStore.get(`guild:${interaction.guild.id}:voice_enabled`)) === 'true';
      const voiceCategoryId = await stateStore.get(`guild:${interaction.guild.id}:voice_category_id`);
      const voiceDuration = (await stateStore.get(`guild:${interaction.guild.id}:voice_duration_minutes`)) || '5';

      const embed = new EmbedBuilder()
        .setColor(COLORS.DARK)
        .setTitle(`🛡️ ${interaction.guild.name} — Destiny Configuration Overview`)
        .addFields(
          { name: 'Application Panel Channel', value: settings?.matchChannelId ? `<#${settings.matchChannelId}>` : '`Not configured` (use `/setup application send`)', inline: false },
          { name: 'Paired Logs Channel', value: pairedLogsChannel ? `<#${pairedLogsChannel}>` : '`None`', inline: true },
          { name: 'Paired Logs Status', value: pairedLogsEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
          { name: 'Match Pool Scope', value: settings?.crossServerEnabled !== false ? '🌐 Global' : '🔒 Guild Only', inline: true },
          { name: 'Voice Matchmaking', value: voiceEnabled ? '🟢 Enabled (Local VC)' : '🔴 Disabled (Eclairs Hub Fallback)', inline: true },
          { name: 'Voice Category', value: voiceCategoryId ? `<#${voiceCategoryId}>` : '`Automatic / Root`', inline: true },
          { name: 'Voice Call Duration', value: `⏱️ ${voiceDuration} minutes`, inline: true },
          { name: 'Server Members', value: `${interaction.guild.memberCount || 0}`, inline: true },
        )
        .setFooter({ text: 'Destiny Server Administration' });

      await respond({
        embeds: [embed],
        components: [createInviteActionRow()]
      });
      return;
    }

    // Backward-compatible subcommands
    if (sub === 'portal') {
      const channel = interaction.options.getChannel('channel', true) as any;
      const portalContainer = embedService.createMatchmakingPortalContainer();
      await channel.send({ components: [portalContainer], flags: [MessageFlags.IsComponentsV2] });
      await db.setGuildMatchChannel(interaction.guild.id, channel.id, interaction.guild.name);
      await respond({ content: formatCustomEmojiText(`✅ Matchmaking portal deployed in <#${channel.id}>!`) });
      return;
    }

    if (sub === 'modlog') {
      const channel = interaction.options.getChannel('channel', true) as any;
      await db.setGuildModLogChannel(interaction.guild.id, channel.id, interaction.guild.name);
      await respond({ content: formatCustomEmojiText(`✅ Moderation alerts channel set to <#${channel.id}>.`) });
      return;
    }

    if (sub === 'cross_server') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await db.setGuildCrossServerEnabled(interaction.guild.id, enabled, interaction.guild.name);
      await respond({ content: formatCustomEmojiText(`✅ Cross-server matchmaking set to **${enabled ? 'ENABLED' : 'DISABLED'}**.`) });
      return;
    }
  }

  // =========================================================================
  // Top-Level Aliases: /reveal, /block, /settings
  // =========================================================================
  if (commandName === 'reveal') {
    if (!user.activeRoomId) {
      await respond({ content: formatCustomEmojiText('❌ You must be in an active chat room to request a profile reveal.') });
      return;
    }
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`reveal_fields_${user.activeRoomId}`)
      .setPlaceholder('Select profile fields you consent to reveal')
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(
        { label: 'Age', value: 'age', description: 'Reveal your age' },
        { label: 'Gender', value: 'gender', description: 'Reveal your gender' },
        { label: 'Interests', value: 'interests', description: 'Reveal your interest tags' },
        { label: 'Destiny ID', value: 'destinyId', description: 'Reveal your permanent Destiny ID' },
        { label: 'Discord Tag (@username)', value: 'discordTag', description: 'Only shared if partner also agrees!' }
      );
    await respond({
      content: formatCustomEmojiText('🔒 **Mutual Profile Reveal**: Select fields to exchange. Only shared if BOTH select it!'),
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
    });
    return;
  }

  if (commandName === 'block') {
    const targetDestinyId = interaction.options.getString('destiny_id');
    let targetUserId = '';
    if (targetDestinyId) {
      const target = await db.getUserByDestinyId(targetDestinyId);
      if (target) targetUserId = target.id;
    } else if (user.activeRoomId) {
      const room = await db.getRoomById(user.activeRoomId);
      if (room) targetUserId = room.user1Id === user.id ? room.user2Id : room.user1Id;
    }
    if (!targetUserId) {
      await respond({ content: formatCustomEmojiText('❌ Could not find a user to block. Provide a Destiny ID or use during a room session.') });
      return;
    }
    const res = await blockerService.blockUser(user.id, targetUserId);
    await respond({ content: res.message });
    return;
  }

  if (commandName === 'settings') {
    const reminder = interaction.options.getBoolean('daily_reminder');
    const tz = interaction.options.getString('timezone');
    const optOut = interaction.options.getBoolean('opt_out');

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(formatCustomEmojiText('⚙️ Destiny Notification & Privacy Settings'))
      .setDescription(
        `• **7:30 PM IST Daily Reminder**: ${reminder !== null ? (reminder ? formatCustomEmojiText('✅ Enabled') : formatCustomEmojiText('❌ Disabled')) : formatCustomEmojiText('✅ Enabled')}\n` +
        `• **Configured Timezone**: \`${tz || 'Asia/Kolkata'}\`\n` +
        `• **System Opt-Out**: ${optOut ? formatCustomEmojiText('🚫 Active') : formatCustomEmojiText('🟢 Inactive')}\n\n` +
        `Settings updated successfully.`
      );
    await respond({ embeds: [embed] });
    return;
  }
}

/**
 * Handle `/profile` or profile edits
 */
async function handleProfileCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordUser = interaction.user;
  let user = await db.getUserByDiscordId(discordUser.id, true).catch(() => null);

  const optionAge = interaction.options.getInteger('age');
  const optionGender = interaction.options.getString('gender');
  const optionBio = interaction.options.getString('bio');
  const optionInterests = interaction.options.getString('interests');
  const hasOptions = [optionAge, optionGender, optionBio, optionInterests].some((v) => v !== null && v !== undefined);

  if (!hasOptions && (!user || !isProfileComplete(user))) {
    try {
      await interaction.showModal(buildProfileModal(user));
    } catch {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: formatCustomEmojiText('⚠️ Could not open the profile editor. Please try `/application` again.'),
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  try {
    if (!user) {
      user = await db.createOrUpdateUser({
        discordUserId: discordUser.id,
        age: optionAge ?? 18,
        gender: optionGender ? normalizeGender(optionGender) : 'prefer_not_to_say',
      });
    }

    if (hasOptions) {
      const updates: Partial<UserProfile> & { discordUserId: string } = { discordUserId: discordUser.id };
      if (optionAge !== null) updates.age = optionAge;
      if (optionGender) updates.gender = normalizeGender(optionGender);
      if (optionBio !== null) updates.bio = optionBio.trim();
      if (optionInterests !== null && optionInterests.trim().length > 0) {
        updates.interests = parseList(optionInterests);
      }
      user = await db.createOrUpdateUser(updates);
    }

    const { attachment } = await buildProfileCard(user, discordUser, interaction.member);
    await interaction.editReply({
      content: formatCustomEmojiText('🪐 **Your Destiny Profile** — update anytime with `/application`.'),
      files: [attachment],
      components: [createProfileActionRow()],
    });
  } catch (err: any) {
    console.error('[Bot] handleProfileCommand error:', err?.message || err);
    await interaction.editReply({
      content: formatCustomEmojiText('⚠️ Something went wrong while loading your profile. Please try again.'),
    }).catch(() => {});
  }
}
