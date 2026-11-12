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
  MessageFlags,
  MessageFlagsBitField
} from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { matchmakingManager } from '../../core/matchmaking/manager.js';
import { embedService, COLORS } from '../embeds/index.js';
import { reporterService } from '../../core/moderation/reporter.js';
import { blockerService } from '../../core/moderation/blocker.js';
import { revealService } from '../../core/moderation/reveal.js';
import { UserProfile } from '../../core/types.js';
import { buildProfileCard, createProfileActionRow, isProfileComplete } from '../profile-view.js';
import { buildProfileModal, normalizeGender, parseList } from '../profile-modal.js';
import { pickIcebreaker } from '../icebreakers.js';
import { sendCleanDmPanel } from '../dm-cleanup.js';
import { handleReputationCheck, isReputationRestriction } from '../../core/moderation/reputation.js';

export const slashCommands = [
  // 1. /match
  new SlashCommandBuilder()
    .setName('match')
    .setDescription('Join the anonymous matchmaking queue to meet someone new')
    .addStringOption((opt) =>
      opt
        .setName('interests')
        .setDescription('Comma-separated interests (e.g. gaming, anime, music, coding)')
        .setRequired(false)
    ),

  // 2. /leave
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current anonymous chat room or exit the matchmaking queue'),

  // 3. /reveal
  new SlashCommandBuilder()
    .setName('reveal')
    .setDescription('Initiate a mutual-consent profile reveal with your chat partner'),

  // 4. /profile
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile card or auto-create/edit your anonymous profile')
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
      opt.setName('bio').setDescription('Update your profile quote/motto (max 80 chars)').setRequired(false).setMaxLength(80)
    )
    .addStringOption((opt) =>
      opt
        .setName('intent')
        .setDescription('Your active matchmaking vibe/intent')
        .setRequired(false)
        .addChoices(
          { name: 'Late Night Chat', value: 'LATE NIGHT CHAT' },
          { name: 'Casual Talk', value: 'CASUAL TALK' },
          { name: 'Deep Convo', value: 'DEEP CONVO' },
          { name: 'Gaming Duo', value: 'GAMING DUO' },
          { name: 'Chill Vibes', value: 'CHILL VIBES' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('interests')
        .setDescription('Comma-separated interests (e.g. music, anime, coding)')
        .setRequired(false)
        .setMaxLength(150)
    )
    .addStringOption((opt) =>
      opt
        .setName('languages')
        .setDescription('Comma-separated languages you speak')
        .setRequired(false)
        .setMaxLength(50)
    ),

  // 5. /report
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report harassment, spam, or identity leaks in your current session')
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
          { name: 'Underage User', value: 'underage' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Details about the incident').setRequired(true)
    ),

  // 10. /block
  new SlashCommandBuilder()
    .setName('block')
    .setDescription('Globally block your current partner or a Destiny ID from ever matching with you')
    .addStringOption((opt) =>
      opt.setName('destiny_id').setDescription('Destiny ID to block (defaults to current partner if empty)').setRequired(false)
    ),

  // 11. /settings
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

  // 12. /icebreaker
  new SlashCommandBuilder()
    .setName('icebreaker')
    .setDescription('Get a curated thought-provoking conversation starter in your current chat room'),

  // 14. /setup
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Server administrator onboarding and matchmaking portal configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
];

/**
 * Apply the same fresh moderation gate to slash commands as component
 * interactions. In particular, do not let /profile bypass the guard just
 * because it needs to open a modal before acknowledging the interaction.
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
    // Ephemeral is immutable after defer. Only Components V2 is permitted as
    // an editable flag; do not attempt to set Ephemeral a second time.
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

/**
 * Main Interaction Handler for all Discord Slash Commands
 */
export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName, user: discordUser } = interaction;

  // `/profile` must be handled before the generic defer so it can open a modal.
  if (commandName === 'profile') {
    if (!(await ensureSlashCommandAccess(interaction))) return;
    await handleProfileCommand(interaction);
    return;
  }

  // All other commands acknowledge immediately before DB-backed moderation checks.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  if (!(await ensureSlashCommandAccess(interaction))) return;

  // Resolve user account in Supabase
  // instantly for new or incomplete profiles.
  const respond = async (opts: any): Promise<any> => {
    const payload = { ...opts };
    const ephemeral = payload.ephemeral === true;
    delete payload.ephemeral;
    if (ephemeral) {
      payload.flags = new MessageFlagsBitField(payload.flags)
        .add(MessageFlags.Ephemeral)
        .bitfield;
    }

    const components = Array.isArray(payload.components) ? payload.components : [];
    const hasV2Container = components.some((component: any) => component instanceof ContainerBuilder || component?.type === 17);
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

  // Resolve user account in Supabase
  let user = await db.getUserByDiscordId(discordUser.id, true);
  if (!user) {
    user = await db.createOrUpdateUser({
      discordUserId: discordUser.id,
      age: 18,
      gender: 'prefer_not_to_say',
    });
  }

  // 1. MATCH
  if (commandName === 'match') {
    if (!isProfileComplete(user)) {
      await respond({
        content: '⚠️ Please complete your profile first with `/profile` before joining matchmaking.',
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

    const result = await matchmakingManager.joinQueue(user, interaction.guildId || undefined);

    if (!result.success) {
      await respond({ content: `❌ ${result.message}` });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.DESTINY_PURPLE)
      .setTitle('🔍 Searching for your anonymous match...')
      .setDescription(
        `You are now in the Destiny matchmaking queue!\n` +
        `• **Age Criteria**: 18+\n` +
        `• **Interests**: ${user.interests.length > 0 ? user.interests.map((i) => `\`${i}\``).join(' ') : '*Any*'}\n\n` +
        `⏳ We will deliver a private DM the moment a compatible partner arrives!`
      )
      .setFooter({ text: 'Use /leave anytime to exit the queue.' });

    await respond({ embeds: [embed] });

    // Trigger immediate match cycle check
    matchmakingManager.processMatchCycle().catch(() => {});
    return;
  }

  // 2. LEAVE
  if (commandName === 'leave') {
    let activeRoomId = user.activeRoomId;
    if (!activeRoomId) {
      activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
    }

    if (activeRoomId) {
      const room = await db.getRoomById(activeRoomId);
      await db.endRoom(activeRoomId, 'user_left');

      if (room) {
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        if (partnerDiscordId) {
          interaction.client.users.fetch(partnerDiscordId)
            .then((partner) => sendCleanDmPanel(partner, {
              embeds: [
                new EmbedBuilder()
                  .setColor(COLORS.DARK)
                  .setTitle('🚪 Chat Session Ended')
                  .setDescription('Your anonymous partner has left the chat session. Your real identity remained hidden.'),
              ],
            }))
            .catch(() => {});
        }
      }

      await respond({ content: '🚪 You have cleanly ended the anonymous chat session. Your real identity remained hidden.' });
      return;
    }

    const wasQueued = await matchmakingManager.isQueued(user.id);
    if (wasQueued) {
      await matchmakingManager.leaveQueue(user.id);
      await respond({ content: '✅ You have been removed from the matchmaking queue.' });
      return;
    }

    await respond({ content: 'ℹ️ You are not currently in a room or queue.' });
    return;
  }

  // 3. REVEAL
  if (commandName === 'reveal') {
    if (!user.activeRoomId) {
      await respond({ content: '❌ You must be in an active chat room to request a profile reveal.', ephemeral: true });
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
      content: '🔒 **Mutual Profile Reveal**: Select the fields you are willing to exchange. A field is **only** revealed if BOTH of you select it!',
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // 8. REPORT
  if (commandName === 'report') {
    const category = interaction.options.getString('category') as any;
    const description = interaction.options.getString('description') || '';

    const res = await reporterService.submitReport(user.id, category, description, user.activeRoomId || undefined);
    await respond({ content: res.message, ephemeral: true });
    return;
  }

  // 9. BLOCK
  if (commandName === 'block') {
    const targetDestinyId = interaction.options.getString('destiny_id');
    let targetUserId = '';

    if (targetDestinyId) {
      const target = await db.getUserByDestinyId(targetDestinyId);
      if (target) targetUserId = target.id;
    } else if (user.activeRoomId) {
      const room = await db.getRoomById(user.activeRoomId);
      if (room) {
        targetUserId = room.user1Id === user.id ? room.user2Id : room.user1Id;
      }
    }

    if (!targetUserId) {
      await respond({ content: '❌ Could not find a user to block. Provide a Destiny ID or use during a room session.', ephemeral: true });
      return;
    }

    const res = await blockerService.blockUser(user.id, targetUserId);
    await respond({ content: res.message, ephemeral: true });
    return;
  }

  // 10. SETTINGS
  if (commandName === 'settings') {
    const reminder = interaction.options.getBoolean('daily_reminder');
    const tz = interaction.options.getString('timezone');
    const optOut = interaction.options.getBoolean('opt_out');

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('⚙️ Destiny Notification & Privacy Settings')
      .setDescription(
        `• **7:30 PM IST Daily Reminder**: ${reminder !== null ? (reminder ? '✅ Enabled' : '❌ Disabled') : '✅ Enabled'}\n` +
        `• **Configured Timezone**: \`${tz || 'Asia/Kolkata'}\`\n` +
        `• **System Opt-Out**: ${optOut ? '🚫 Active' : '🟢 Inactive'}\n\n` +
        `Settings updated successfully.`
      );

    await respond({ embeds: [embed], ephemeral: true });
    return;
  }

  // 11. ICEBREAKER
  if (commandName === 'icebreaker') {
    const picked = pickIcebreaker();

    let activeRoomId = user.activeRoomId;
    if (!activeRoomId) {
      activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
    }

    if (activeRoomId) {
      const room = await db.getRoomById(activeRoomId);
      if (room && room.status === 'active') {
        const isUser1 = room.user1Id === user.id;
        const partnerId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        const partnerUser = partnerId ? await interaction.client.users.fetch(partnerId).catch(() => null) : null;

        const promptContainer = embedService.createIcebreakerContainer(picked, true);

        if (partnerUser) {
          await sendCleanDmPanel(partnerUser, {
            components: [promptContainer],
            flags: [MessageFlags.IsComponentsV2],
          }).catch(() => {});
        }
        await respond({ components: [promptContainer], ephemeral: true });
        return;
      }
    }

    const soloContainer = embedService.createIcebreakerContainer(picked, false);
    await respond({ components: [soloContainer], ephemeral: true });
    return;
  }

  // 14. SETUP (Administrator)
  if (commandName === 'setup') {
    if (!interaction.guild) {
      await respond({ content: '⚠️ The `/setup` command can only be executed inside a Discord server.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'portal') {
      const channel = interaction.options.getChannel('channel', true) as any;
      if (!channel.isTextBased()) {
        await respond({ content: '⚠️ The designated portal channel must be a text channel.', ephemeral: true });
        return;
      }

      await db.setGuildMatchChannel(interaction.guild.id, channel.id, interaction.guild.name);

      const portalContainer = embedService.createMatchmakingPortalContainer();
      await channel.send({
        components: [portalContainer],
        flags: [MessageFlags.IsComponentsV2]
      }).catch((err: any) => {
        throw new Error(`Failed to send portal in #${channel.name}: ${err?.message}`);
      });

      await respond({
        content: `✅ **Destiny Matchmaking Portal** deployed successfully in <#${channel.id}>! Members can now click "Find Match" to start chatting.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'modlog') {
      const channel = interaction.options.getChannel('channel', true) as any;
      await db.setGuildAdminChannel(interaction.guild.id, channel.id, interaction.guild.name);

      await respond({
        content: `✅ Moderation and verification alerts channel configured to <#${channel.id}>.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'cross_server') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const settings = await db.getGuildSettings(interaction.guild.id);
      if (settings) {
        settings.crossServerEnabled = enabled;
      }
      await respond({
        content: `✅ Cross-server matchmaking has been **${enabled ? 'ENABLED' : 'DISABLED'}** for ${interaction.guild.name}.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'view') {
      const settings = await db.getGuildSettings(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.DARK)
        .setTitle(`🛡️ ${interaction.guild.name} — Destiny Configuration`)
        .addFields(
          { name: 'Matchmaking Portal Channel', value: settings?.matchChannelId ? `<#${settings.matchChannelId}>` : '`Not configured` (use `/setup portal`)', inline: false },
          { name: 'Staff Mod-Log Channel', value: settings?.modLogChannelId ? `<#${settings.modLogChannelId}>` : '`Not configured` (use `/setup modlog`)', inline: false },
          { name: 'Cross-Server Matchmaking', value: settings?.crossServerEnabled !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Minimum Age Requirement', value: `${settings?.minAgeLimit || 18}+`, inline: true }
        )
        .setFooter({ text: 'Destiny Administration Wizard' });

      await respond({ embeds: [embed], ephemeral: true });
      return;
    }
  }
}

/**
 * `/profile` is fully automatic:
 * - New or incomplete profiles open the setup modal immediately.
 * - Complete profiles render the live profile card.
 * - Any supplied options are merged in and the refreshed card is shown.
 */
async function handleProfileCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordUser = interaction.user;
  let user = await db.getUserByDiscordId(discordUser.id, true).catch(() => null);

  const optionAge = interaction.options.getInteger('age');
  const optionGender = interaction.options.getString('gender');
  const optionBio = interaction.options.getString('bio');
  const optionIntent = interaction.options.getString('intent');
  const optionInterests = interaction.options.getString('interests');
  const optionLanguages = interaction.options.getString('languages');
  const hasOptions = [optionAge, optionGender, optionBio, optionIntent, optionInterests, optionLanguages]
    .some((value) => value !== null && value !== undefined);

  // New / incomplete users get the setup modal instantly, no extra button click needed.
  if (!hasOptions && (!user || !isProfileComplete(user))) {
    try {
      await interaction.showModal(buildProfileModal(user));
    } catch (err: any) {
      console.error('[Bot] Failed to open profile modal:', err?.message || err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ Could not open the profile editor. Please try `/profile` again in a moment.',
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
      if (optionIntent) updates.matchIntent = optionIntent;
      if (optionInterests !== null && optionInterests.trim().length > 0) {
        updates.interests = parseList(optionInterests);
      }
      if (optionLanguages !== null && optionLanguages.trim().length > 0) {
        updates.languages = parseList(optionLanguages, 6);
      }

      user = await db.createOrUpdateUser(updates);
    }

    if (!isProfileComplete(user)) {
      await interaction.editReply({
        content:
          '⚠️ Your profile is still incomplete. Age (18+) and gender are required before you can match.\n' +
          'Use `/profile` again to finish setup — it only takes a few seconds.',
      }).catch(() => {});
      return;
    }

    const { attachment } = await buildProfileCard(user, discordUser, interaction.member);

    await interaction.editReply({
      content: '🪐 **Your Destiny Profile** — update anything anytime with `/profile`.',
      files: [attachment],
      components: [createProfileActionRow()],
    });
  } catch (err: any) {
    console.error('[Bot] handleProfileCommand error:', err?.message || err);
    await interaction.editReply({
      content: '⚠️ Something went wrong while loading your profile. Please try again.',
    }).catch(() => {});
  }
}
