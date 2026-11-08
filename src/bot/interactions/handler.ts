import { 
  Interaction, 
  ButtonInteraction, 
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  Message
} from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { matchmakingManager } from '../../core/matchmaking/manager.js';
import { streakService } from '../../core/economy/streaks.js';
import { shopService } from '../../core/economy/shop.js';
import { gameManager } from '../../core/games/manager.js';
import { revealService } from '../../core/moderation/reveal.js';
import { reporterService } from '../../core/moderation/reporter.js';
import { verificationService } from '../../core/moderation/verification.js';
import { handleReputationCheck } from '../../core/moderation/reputation.js';
import { embedService, COLORS } from '../embeds/index.js';
import { ProfileField, Gender, ReportItem, UserProfile } from '../../core/types.js';
import { profileCardGenerator } from '../../core/profile/card-generator.js';

/**
 * Ultra-fast safe defer reply wrapper (<5ms)
 * For buttons and select menus, deferUpdate updates the component container in-place seamlessly.
 * For modals, deferReply prepares an ephemeral acknowledgment.
 */
async function safeDeferReply(interaction: ButtonInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction | ModalSubmitInteraction | any): Promise<boolean> {
  if (interaction.deferred || interaction.replied) return true;
  try {
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      await interaction.deferUpdate();
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return true;
  } catch (err: any) {
    if (err?.code === 10062 || err?.code === 40060) {
      return false; // Token expired or acknowledged already
    }
    console.error('[Bot] safeDeferReply error:', err?.message || err);
    return false;
  }
}

/**
 * Ultra-safe edit reply wrapper for Components V2
 * Always ensures MessageFlags.IsComponentsV2 is applied so Discord allows ContainerBuilder
 */
async function safeEditReply(interaction: ButtonInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction | ModalSubmitInteraction | any, options: any): Promise<void> {
  try {
    const payload = { ...options };

    // If text content was passed without components, convert it to a ContainerBuilder
    if (payload.content && (!payload.components || payload.components.length === 0)) {
      const noticeContainer = new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(payload.content)
        );
      payload.components = [noticeContainer];
      delete payload.content;
    }

    if (payload.components && payload.components.length > 0) {
      payload.flags = payload.flags !== undefined 
        ? (payload.flags | MessageFlags.IsComponentsV2) 
        : MessageFlags.IsComponentsV2;

      // When using Components V2, Discord strictly rejects messages that have legacy embeds or content.
      delete payload.content;
      payload.embeds = [];
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({
        ...payload,
        flags: payload.flags ? (payload.flags | MessageFlags.Ephemeral) : MessageFlags.Ephemeral,
      });
    }
  } catch (err: any) {
    if (err?.code === 10062 || err?.code === 40060) {
      return;
    }
    console.error('[Bot] safeEditReply error:', err?.message || err);
  }
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  // Reputation Verification Button ("I Have Joined discord.gg/eclairs")
  if (interaction.isButton() && interaction.customId === 'destiny_btn_check_reputation') {
    const btn = interaction as ButtonInteraction;
    const ok = await safeDeferReply(btn);
    if (!ok) return;

    const repStatus = await handleReputationCheck(btn.client, btn.user.id);
    if (repStatus.restored) {
      const restoredContainer = embedService.createReputationRestoredContainer();
      await safeEditReply(btn, { components: [restoredContainer] });
      return;
    }

    const stillRestricted = embedService.createLowReputationRestrictedContainer();
    await safeEditReply(btn, { components: [stillRestricted] });
    return;
  }

  // Reputation & Ban Guard for all other interactions
  const activeUser = await db.getUserByDiscordId(interaction.user.id);
  if (activeUser && (activeUser.reputationScore < 10 || activeUser.isBanned)) {
    const repStatus = await handleReputationCheck(interaction.client, interaction.user.id);
    if (repStatus.isRestricted) {
      // Ignore their request completely, show only the discord.gg/eclairs regain message
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const ok = await safeDeferReply(interaction as any);
        if (ok) {
          const container = embedService.createLowReputationRestrictedContainer();
          await safeEditReply(interaction as any, { components: [container] });
        }
      }
      return;
    }
  }

  // =========================================================================
  // 1. MODAL SUBMISSIONS
  // =========================================================================
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_destiny_profile') {
      await handleProfileModalSubmit(interaction);
      return;
    }

    if (interaction.customId === 'modal_destiny_verify') {
      await handleVerifyModalSubmit(interaction);
      return;
    }
  }

  // =========================================================================
  // 2. STRING SELECT MENUS
  // =========================================================================
  if (interaction.isStringSelectMenu()) {
    const select = interaction as StringSelectMenuInteraction;
    const { customId, values, user: discordUser } = select;

    if (customId.startsWith('reveal_fields_')) {
      const ok = await safeDeferReply(select);
      if (!ok) return;

      const roomId = customId.replace('reveal_fields_', '');
      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await safeEditReply(select, { content: '❌ User profile not found.' });
        return;
      }

      const selectedFields = values as ProfileField[];
      const res = await revealService.submitConsent(roomId, user.id, selectedFields);

      if (res.completed) {
        const revealedStr = res.agreedFields.length > 0
          ? res.agreedFields.map((f) => `• \`${f}\``).join('\n')
          : '*No common fields were consented to.*';

        const container = new ContainerBuilder()
          .setAccentColor(COLORS.SUCCESS)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🎉 Mutual Profile Reveal Complete!\n\n` +
              `Both partners have consented to exchange information!\n\n` +
              `**Mutually Agreed Revealed Fields**:\n${revealedStr}\n\n` +
              `🔒 *Any unagreed fields and Discord usernames remain strictly protected.*`
            )
          );

        await safeEditReply(select, { components: [container] });
      } else {
        await safeEditReply(select, { content: res.message });
      }
      return;
    }

    // Wardrobe Theme Selection
    if (customId === 'destiny_select_theme') {
      const ok = await safeDeferReply(select);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await safeEditReply(select, { content: '❌ User profile not found.' });
        return;
      }

      const res = await shopService.equipCardTheme(user, values[0]);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_btn_card_static')
          .setLabel('Preview Updated Card')
          .setStyle(ButtonStyle.Secondary)
      );

      await safeEditReply(select, { content: res.message, components: [row] });
      return;
    }

    // Wardrobe Insignia Badges Selection
    if (customId === 'destiny_select_badges') {
      const ok = await safeDeferReply(select);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await safeEditReply(select, { content: '❌ User profile not found.' });
        return;
      }

      const res = await shopService.setEquippedBadges(user, values);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_btn_card_static')
          .setLabel('Preview Updated Card')
          .setStyle(ButtonStyle.Secondary)
      );

      await safeEditReply(select, { content: res.message, components: [row] });
      return;
    }
  }

  // =========================================================================
  // 2.5 CHANNEL SELECT MENUS (Server Setup)
  // =========================================================================
  if (interaction.isChannelSelectMenu()) {
    const select = interaction as ChannelSelectMenuInteraction;
    if (select.customId === 'destiny_select_admin_channel') {
      const ok = await safeDeferReply(select);
      if (!ok) return;
      await handleSelectAdminChannel(select);
      return;
    }
  }

  // =========================================================================
  // 3. BUTTON INTERACTIONS (Components V2)
  // =========================================================================
  if (interaction.isButton()) {
    const btn = interaction as ButtonInteraction;
    const { customId, user: discordUser } = btn;
    console.log(`[Bot Interaction] Button "${customId}" clicked by ${discordUser.tag} (${discordUser.id})`);

    // --- Profile Setup / Edit Modal Trigger ---
    if (customId === 'destiny_btn_profile') {
      await handleOpenProfileModal(btn);
      return;
    }

    // --- Profile Card View (Static PNG) ---
    if (customId === 'destiny_btn_card_motion' || customId === 'destiny_btn_card_static') {
      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await btn.reply({ content: 'Please setup your profile first with /profile', ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      const userRooms = await db.getUserRooms(user.id);
      let totalMinutes = 0;
      for (const r of userRooms) {
        if (r.startedAt && r.endedAt) {
          const diff = (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 60000;
          if (diff > 0) totalMinutes += diff;
        }
      }
      const hours = Math.floor(totalMinutes / 60);
      const mins = Math.floor(totalMinutes % 60);
      const chatHoursText = hours > 0 || mins > 0 ? `${hours}h ${mins}m` : '0h 00m';

      const avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
      const displayName = btn.member && 'displayName' in btn.member
        ? (btn.member as any).displayName
        : discordUser.displayName || 'Midnight Wolf';

      const stats = {
        sessionsCount: userRooms.length,
        chatHoursText,
        reputationPercent: user.reputationScore ?? 100,
        personaName: displayName,
        avatarUrl,
        timezone: 'UTC+05:30',
      };

      const cardBuffer = await profileCardGenerator.generateCardPng(user, stats);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'destiny_profile.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_btn_profile')
          .setLabel('Edit Profile')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('destiny_btn_wardrobe')
          .setLabel('Wardrobe')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('destiny_btn_start')
          .setLabel('Find Match')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('destiny_btn_wallet')
          .setLabel('Vault')
          .setStyle(ButtonStyle.Secondary)
      );

      await btn.editReply({
        files: [attachment],
        components: [row],
      });
      return;
    }

    // --- Profile Verification Trigger ---
    if (customId === 'destiny_btn_verify' || customId === 'destiny_btn_verify_modal') {
      const user = await db.getUserByDiscordId(discordUser.id, true);
      const isProfileComplete = Boolean(
        user && user.age >= 18 && user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim().length > 0
      );

      if (!user || !isProfileComplete) {
        const ok = await safeDeferReply(btn);
        if (ok) {
          const container = embedService.createProfileRequiredContainer();
          await safeEditReply(btn, { components: [container] });
        }
        return;
      }

      if (user.genderVerified) {
        const ok = await safeDeferReply(btn);
        if (ok) {
          const container = embedService.createAlreadyVerifiedContainer(user);
          await safeEditReply(btn, { components: [container] });
        }
        return;
      }

      if (user.genderVerificationStatus === 'pending') {
        const ok = await safeDeferReply(btn);
        if (ok) {
          const container = embedService.createVerificationPendingContainer();
          await safeEditReply(btn, { components: [container] });
        }
        return;
      }

      const ok = await safeDeferReply(btn);
      if (ok) {
        const container = embedService.createVerificationPromptContainer(user);
        await safeEditReply(btn, { components: [container] });
      }
      return;
    }

    // --- Verification Voice Note Info Button ---
    if (customId === 'destiny_btn_verify_voicenote_info') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      const user = await db.getUserByDiscordId(discordUser.id, true);
      if (!user) {
        const container = embedService.createProfileRequiredContainer();
        await safeEditReply(btn, { components: [container] });
        return;
      }
      const container = embedService.createVoiceNoteInstructionContainer(user);
      await safeEditReply(btn, { components: [container] });
      return;
    }

    // --- Verification Sync Server Role Button ---
    if (customId === 'destiny_btn_verify_sync_role') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleSyncServerRole(btn);
      return;
    }

    // --- Server Setup Buttons ---
    if (customId === 'destiny_btn_setup_set_current') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleSetCurrentAdminChannel(btn);
      return;
    }

    if (customId === 'destiny_btn_setup_lobby_card') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handlePostLobbyCard(btn);
      return;
    }

    if (customId === 'destiny_btn_setup_verify_hub') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handlePostVerifyHub(btn);
      return;
    }

    if (customId === 'destiny_btn_setup_refresh') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleRefreshSetup(btn);
      return;
    }

    if (customId === 'destiny_btn_setup_reset') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleResetSetup(btn);
      return;
    }

    // --- Admin Verification Approve / Reject Buttons (Staff Channel) ---
    if (customId.startsWith('btn_admin_verify_approve_') || customId.startsWith('btn_admin_verify_reject_')) {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      const approve = customId.startsWith('btn_admin_verify_approve_');
      const targetUserId = customId.replace(approve ? 'btn_admin_verify_approve_' : 'btn_admin_verify_reject_', '');
      await handleAdminVerifyAction(btn, approve, targetUserId);
      return;
    }

    // --- Start Matchmaking Button ---
    if (customId === 'destiny_btn_start') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleStartMatchButton(btn);
      return;
    }

    // --- Cancel Queue Button ---
    if (customId === 'destiny_btn_cancel_queue') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let activeRoomId = user?.activeRoomId;
      if (!activeRoomId && user) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }
      if (activeRoomId) {
        const room = await db.getRoomById(activeRoomId);
        if (room && room.status === 'active') {
          const container = embedService.createActiveRoomPromptContainer(room.roomCode);
          await safeEditReply(btn, { components: [container] });
          return;
        }
      }

      if (user) {
        await matchmakingManager.leaveQueue(user.id);
      }

      const leaveContainer = new ContainerBuilder()
        .setAccentColor(COLORS.PRIMARY)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '# ✅ Queue Cancelled\n\nYou have safely left the matchmaking queue.'
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('destiny_btn_start')
              .setLabel('Start Match')
              .setStyle(ButtonStyle.Success)
          )
        );

      await safeEditReply(btn, { components: [leaveContainer] });
      return;
    }

    // --- Cancel Mood / Match Preference Selection ---
    if (customId === 'destiny_btn_cancel_mood') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      const user = await db.getUserByDiscordId(discordUser.id);
      const isProfileComplete = Boolean(
        user && user.age >= 18 && user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim().length > 0
      );
      const container = embedService.createMainMenuContainer(discordUser.displayName || discordUser.username, user, isProfileComplete);
      await safeEditReply(btn, { components: [container] });
      return;
    }

    // --- Dynamic Match Preference Buttons (Mood Selection) ---
    if (customId === 'match_pref_female' || customId === 'match_pref_male' || customId === 'match_pref_any') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      const isProfileComplete = Boolean(
        user && user.age >= 18 && user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim().length > 0
      );

      if (!user || !isProfileComplete) {
        const container = embedService.createProfileRequiredContainer();
        await safeEditReply(btn, { components: [container] });
        return;
      }

      if (user.isBanned) {
        const container = embedService.createAccountRestrictedContainer(user.banReason);
        await safeEditReply(btn, { components: [container] });
        return;
      }

      let activeRoomId = user.activeRoomId;
      if (!activeRoomId) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }
      if (activeRoomId) {
        const room = await db.getRoomById(activeRoomId);
        if (room && room.status === 'active') {
          const container = embedService.createActiveRoomPromptContainer(room.roomCode);
          await safeEditReply(btn, { components: [container] });
          return;
        } else {
          await db.clearActiveRoom(user.id);
          user.activeRoomId = null;
        }
      }

      const prefChoice = customId === 'match_pref_female'
        ? ['female']
        : customId === 'match_pref_male'
          ? ['male']
          : ['any'];

      // Persist chosen mood preference to user profile
      const updatedUser = await db.createOrUpdateUser({
        discordUserId: discordUser.id,
        preferredGender: prefChoice,
      });

      // Join or update queue with this preference
      const queueRes = await matchmakingManager.joinQueue(updatedUser, undefined, prefChoice);
      if (!queueRes.success) {
        await safeEditReply(btn, { content: `⚠️ ${queueRes.message}` });
        return;
      }

      // Instantly trigger match evaluation loop (<5ms)
      matchmakingManager.processMatchCycle().catch(() => {});

      const searchingContainer = embedService.createSearchingContainer(updatedUser);
      await safeEditReply(btn, { components: [searchingContainer] });
      return;
    }

    // --- Wallet & Daily Coins Menu ---
    if (customId === 'destiny_btn_wallet') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleWalletMenu(btn);
      return;
    }

    // --- Wardrobe Menu Trigger ---
    if (customId === 'destiny_btn_wardrobe') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await safeEditReply(btn, { content: 'Please setup your profile first with /profile' });
        return;
      }

      const themeMenu = new StringSelectMenuBuilder()
        .setCustomId('destiny_select_theme')
        .setPlaceholder(`Current Theme: ${(user.cardTheme || 'obsidian').toUpperCase()}`)
        .addOptions(
          { label: 'Obsidian Monochrome (Default)', value: 'obsidian', description: 'Deep obsidian void with dot-matrix hardware texture', default: (user.cardTheme || 'obsidian') === 'obsidian' },
          { label: 'Cyber Damask', value: 'cyber_damask', description: 'Obsidian & high-contrast damask steel micro-lines', default: user.cardTheme === 'cyber_damask' },
          { label: 'Frost Glaze', value: 'frost_glaze', description: 'Frosted titanium aesthetic with cool cyan sheen', default: user.cardTheme === 'frost_glaze' },
          { label: 'Holographic Platinum', value: 'holographic_plat', description: 'Prestige platinum finish with iridescent micro-reflections', default: user.cardTheme === 'holographic_plat' }
        );

      const badgeOptions = [
        { label: 'ID VERIFIED', value: 'ID VERIFIED', description: 'Emerald verified trust badge', default: user.equippedBadges?.includes('ID VERIFIED') },
        { label: '7D STREAK', value: '7D STREAK', description: 'Flame 7-day conversation streak badge', default: user.equippedBadges?.includes('7D STREAK') },
        { label: 'TITAN 1K', value: 'TITAN 1K', description: 'Commemorative Titan supporter badge', default: user.equippedBadges?.includes('TITAN 1K') },
        { label: 'VETERAN', value: 'VETERAN', description: 'Awarded for completing 10+ match conversations', default: user.equippedBadges?.includes('VETERAN') },
        { label: 'KARMA 100%', value: 'KARMA 100%', description: 'Pristine 100% reputation rating', default: user.equippedBadges?.includes('KARMA 100%') },
        { label: 'STAR WANDERER', value: 'STAR WANDERER', description: 'Mark of an explorer across 50+ matches', default: user.equippedBadges?.includes('STAR WANDERER') },
        { label: 'VIP', value: 'VIP', description: 'Destiny VIP patron badge', default: user.equippedBadges?.includes('VIP') },
        { label: 'MYSTIC AURA', value: 'MYSTIC AURA', description: 'Glowing celestial aura rack insignia', default: user.equippedBadges?.includes('MYSTIC AURA') },
      ];

      const badgeMenu = new StringSelectMenuBuilder()
        .setCustomId('destiny_select_badges')
        .setPlaceholder('Equip up to 5 Insignia Badges for your Rack')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(badgeOptions);

      const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(themeMenu);
      const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(badgeMenu);
      const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_btn_card_static')
          .setLabel('Preview Profile Card')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('destiny_btn_shop')
          .setLabel('Shop Cosmetics')
          .setStyle(ButtonStyle.Primary)
      );

      const embed = new EmbedBuilder()
        .setColor(COLORS.DARK)
        .setTitle('Destiny Identity Wardrobe')
        .setDescription(
          `Customize the appearance of your **Destiny Profile Card**.\n\n` +
          `• **Equipped Theme**: \`${(user.cardTheme || 'obsidian').toUpperCase()}\`\n` +
          `• **Active Badges (${user.equippedBadges?.length || 5}/5)**: ${user.equippedBadges && user.equippedBadges.length > 0 ? user.equippedBadges.map((b: string) => `\`[${b}]\``).join(' ') : '\`[ID VERIFIED]\` \`[7D STREAK]\` \`[TITAN 1K]\` \`[VETERAN]\` \`[KARMA 100%]\`'}\n\n` +
          `*Select a new card skin or choose up to 5 rack insignias below.*`
        );

      await safeEditReply(btn, { embeds: [embed], components: [row1, row2, row3] });
      return;
    }

    // --- Shop Menu Trigger ---
    if (customId === 'destiny_btn_shop') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const catalog = await shopService.getCatalog();
      const embed = new EmbedBuilder()
        .setColor(COLORS.GOLD)
        .setTitle('🛍️ Destiny Cosmetic & Skin Emporium')
        .setDescription('Use `/shop buy:<item_id>` or equip items in your `/wardrobe`!');

      embed.addFields(
        catalog.map((item: any) => ({
          name: `${item.icon} ${item.name} (\`${item.id}\`) — ${item.price} DC`,
          value: item.description,
          inline: false,
        }))
      );

      await safeEditReply(btn, { embeds: [embed] });
      return;
    }

    // --- Claim Daily Reward ---
    if (customId === 'destiny_btn_claim_daily') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleClaimDaily(btn);
      return;
    }

    // --- Games Menu ---
    if (customId === 'destiny_btn_games') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleGamesMenu(btn);
      return;
    }

    // --- Quick Games (Coinflip / Dice / Trivia / WYR) ---
    if (customId === 'game_quick_flip') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleQuickFlip(btn);
      return;
    }

    if (customId === 'game_quick_dice') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleQuickDice(btn);
      return;
    }

    if (customId === 'game_quick_trivia') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleQuickTrivia(btn);
      return;
    }

    if (customId === 'game_quick_wyr') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      await handleQuickWYR(btn);
      return;
    }

    // --- Would You Rather Choice ---
    if (customId.startsWith('wyr_')) {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const [, choice, dilemmaId] = customId.split('_');
      const stats = gameManager.voteWouldYouRather(dilemmaId, choice as 'A' | 'B');
      
      const voteContainer = new ContainerBuilder()
        .setAccentColor(COLORS.PRIMARY)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🗳️ Vote Registered!\n\n` +
            `You voted for **Option ${choice}**.\n\n` +
            `• 📊 **Option A:** **${stats.percentA}%**\n` +
            `• 📊 **Option B:** **${stats.percentB}%**\n\n` +
            `*Total community votes recorded: ${stats.totalVotes.toLocaleString()}*`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('game_quick_wyr')
              .setLabel('Next Dilemma')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('destiny_btn_games')
              .setLabel('All Games')
              .setStyle(ButtonStyle.Secondary)
          )
        );

      await safeEditReply(btn, { components: [voteContainer] });
      return;
    }

    // --- Trivia Answer Choice ---
    if (customId.startsWith('triv_')) {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const [, qId, choiceIdxStr] = customId.split('_');
      const choiceIdx = parseInt(choiceIdxStr, 10);
      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await safeEditReply(btn, { content: '❌ Profile not found.' });
        return;
      }

      const evalRes = await gameManager.answerTrivia(user.id, qId, choiceIdx, user.activeRoomId || undefined);
      const trivContainer = new ContainerBuilder()
        .setAccentColor(evalRes.isCorrect ? COLORS.SUCCESS : COLORS.DANGER)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            evalRes.isCorrect
              ? `# 🎯 Correct Answer!\n\nYou won **+${evalRes.dcAwarded} Destiny Coins**! 🪙\n\n*${evalRes.explanation}*`
              : `# ❌ Incorrect Answer\n\nThe correct answer was: **${evalRes.correctOption}**\n\n*${evalRes.explanation}*`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('game_quick_trivia')
              .setLabel('Next Trivia')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('destiny_btn_games')
              .setLabel('All Games')
              .setStyle(ButtonStyle.Secondary)
          )
        );

      await safeEditReply(btn, { components: [trivContainer] });
      return;
    }

    // --- Room Leave Button ---
    if (customId === 'destiny_btn_leave' || customId === 'btn_room_leave') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let roomId = user?.activeRoomId;
      if (!roomId && user) {
        roomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }

      if (user && roomId) {
        const room = await db.getRoomById(roomId);
        await db.endRoom(roomId, 'user_left');

        // Post-Room Mutual Chemistry Card (P4 Feature)
        if (room) {
          const diffMs = Math.max(10000, Date.now() - new Date(room.startedAt).getTime());
          const mins = Math.floor(diffMs / 60000);
          const secs = Math.floor((diffMs % 60000) / 1000);
          const durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

          const [u1Obj, u2Obj] = await Promise.all([
            db.getUserById(room.user1Id).catch(() => null),
            db.getUserById(room.user2Id).catch(() => null),
          ]);

          let u1AvatarUrl: string | undefined = undefined;
          let u2AvatarUrl: string | undefined = undefined;
          const isRevealed = Boolean(room.revealStatusUser1?.consented && room.revealStatusUser2?.consented);
          if (isRevealed) {
            try {
              if (room.user1DiscordId) {
                const discU1 = await btn.client.users.fetch(room.user1DiscordId).catch(() => null);
                if (discU1) u1AvatarUrl = discU1.displayAvatarURL({ extension: 'png', size: 256 });
              }
              if (room.user2DiscordId) {
                const discU2 = await btn.client.users.fetch(room.user2DiscordId).catch(() => null);
                if (discU2) u2AvatarUrl = discU2.displayAvatarURL({ extension: 'png', size: 256 });
              }
            } catch {}
          }

          const recapData = {
            roomCode: room.roomCode,
            durationText,
            chemistryScore: Math.min(99, Math.max(70, Math.floor(75 + mins * 3))),
            xpAwarded: Math.max(150, mins * 30),
            coinsAwarded: Math.max(15, mins * 5),
            user1: {
              pseudonym: room.user1Pseudonym || 'Midnight Wolf',
              avatarMonogram: (room.user1Pseudonym || 'MW').split(' ').map((p: string) => p[0]).join('').substring(0, 2).toUpperCase(),
              destinyId: u1Obj?.destinyId || 'USER-1',
              tier: room.connectionLevel || 'Strangers',
              avatarUrl: u1AvatarUrl,
            },
            user2: {
              pseudonym: room.user2Pseudonym || 'Celestial Fox',
              avatarMonogram: (room.user2Pseudonym || 'CF').split(' ').map((p: string) => p[0]).join('').substring(0, 2).toUpperCase(),
              destinyId: u2Obj?.destinyId || 'USER-2',
              tier: room.connectionLevel || 'Strangers',
              avatarUrl: u2AvatarUrl,
            },
          };

          let recapAttachment: AttachmentBuilder | null = null;
          try {
            const recapBuffer = await profileCardGenerator.generateSessionRecapCard(recapData);
            recapAttachment = new AttachmentBuilder(recapBuffer, { name: 'destiny_session_recap.png' });
          } catch (e) {
            recapAttachment = null;
          }

          const partnerDiscordId = room.user1Id === user.id ? room.user2DiscordId : room.user1DiscordId;
          if (partnerDiscordId) {
            btn.client.users.fetch(partnerDiscordId).then((partner) => {
              const partnerContainer = new ContainerBuilder()
                .setAccentColor(COLORS.DARK)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    '# 🚪 Chat Session Ended\n\nYour anonymous partner has ended the chat session.\nType `start` in DM to find a new match!'
                  )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addActionRowComponents(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('destiny_btn_start')
                      .setLabel('Find New Match')
                      .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                      .setCustomId(`btn_report_room_${room.id}`)
                      .setLabel('Report User')
                      .setStyle(ButtonStyle.Danger)
                  )
                );

              const sendOptions: any = { 
                components: [partnerContainer], 
                flags: [MessageFlags.IsComponentsV2] 
              };
              if (recapAttachment) sendOptions.files = [recapAttachment];

              partner.send(sendOptions).catch(() => {});
            }).catch(() => {});
          }

          const leaveResponseContainer = new ContainerBuilder()
            .setAccentColor(COLORS.DARK)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# 🚪 Session Left\n\nYou have safely left the anonymous chat session.'
              )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('destiny_btn_start')
                  .setLabel('Find New Match')
                  .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`btn_report_room_${room?.id || roomId}`)
                .setLabel('Report User')
                .setStyle(ButtonStyle.Danger)
            )
          );

        const editOptions: any = { components: [leaveResponseContainer] };
        if (recapAttachment) editOptions.files = [recapAttachment];
        await safeEditReply(btn, editOptions);
      }
    } else {
        const noRoomContainer = new ContainerBuilder()
          .setAccentColor(COLORS.DARK)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '# ℹ️ No Active Room\n\nYou are not currently in an active room session.'
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('destiny_btn_start')
                .setLabel('Find Match')
                .setStyle(ButtonStyle.Success)
            )
          );

        await safeEditReply(btn, { components: [noRoomContainer] });
      }
      return;
    }

    // --- Mutual Reveal Consent Trigger (Requester) ---
    if (customId === 'btn_reveal_consent') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let activeRoomId = user?.activeRoomId;
      if (!activeRoomId && user) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }

      if (!user || !activeRoomId) {
        await safeEditReply(btn, { content: '❌ You are not in an active room.' });
        return;
      }

      const room = await db.getRoomById(activeRoomId);
      if (!room || room.status !== 'active') {
        await safeEditReply(btn, { content: '❌ Your chat room is no longer active.' });
        return;
      }

      // Automatically consent to share agreed profile fields
      await revealService.submitConsent(room.id, user.id, ['discordTag', 'age', 'gender', 'interests']);

      // Show waiting container to requester
      const waitingContainer = embedService.createRevealWaitingContainer();
      await safeEditReply(btn, { components: [waitingContainer] });

      // Deliver interactive prompt to partner
      const isUser1 = room.user1Id === user.id;
      const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
      const myPseudonym = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;
      const myAvatar = isUser1 ? room.user1Avatar : room.user2Avatar;

      if (partnerDiscordId) {
        const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
        if (partnerUser) {
          const promptContainer = embedService.createRevealPromptPartnerContainer(myAvatar, myPseudonym);
          await partnerUser.send({
            components: [promptContainer],
            flags: [MessageFlags.IsComponentsV2],
          }).catch((err) => {
            console.warn('[Reveal] Could not deliver prompt to partner:', err?.message);
          });
        }
      }
      return;
    }

    // --- Mutual Reveal Accept (Partner) ---
    if (customId === 'btn_reveal_accept') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let activeRoomId = user?.activeRoomId;
      if (!activeRoomId && user) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }

      if (!user || !activeRoomId) {
        await safeEditReply(btn, { content: '❌ You are not in an active room.' });
        return;
      }

      const room = await db.getRoomById(activeRoomId);
      if (!room || room.status !== 'active') {
        await safeEditReply(btn, { content: '❌ Your chat room is no longer active.' });
        return;
      }

      const consentResult = await revealService.submitConsent(room.id, user.id, ['discordTag', 'age', 'gender', 'interests']);
      if (consentResult.completed) {
        const isUser1 = room.user1Id === user.id;
        const partnerUserId = isUser1 ? room.user2Id : room.user1Id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;

        const [partnerProfile, myProfile] = await Promise.all([
          db.getUserById(partnerUserId),
          db.getUserById(user.id),
        ]);

        // Reveal card for accepting user
        if (partnerProfile && partnerDiscordId) {
          const successForAcceptor = embedService.createRevealSuccessContainer(partnerProfile, partnerDiscordId);
          await safeEditReply(btn, { components: [successForAcceptor] });
        }

        // Deliver reveal card to requester
        if (myProfile && partnerDiscordId) {
          const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partnerUser) {
            const successForRequester = embedService.createRevealSuccessContainer(myProfile, discordUser.id);
            await partnerUser.send({
              components: [successForRequester],
              flags: [MessageFlags.IsComponentsV2],
            }).catch(() => {});
          }
        }
      } else {
        await safeEditReply(btn, { content: '⏳ Waiting for your partner to also consent.' });
      }
      return;
    }

    // --- Mutual Reveal Decline (Partner) ---
    if (customId === 'btn_reveal_decline') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let activeRoomId = user?.activeRoomId;
      if (!activeRoomId && user) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }

      const room = activeRoomId ? await db.getRoomById(activeRoomId) : null;

      // Update declining user's card
      const declinedForPartner = embedService.createRevealDeclinedContainer(false);
      await safeEditReply(btn, { components: [declinedForPartner] });

      // Notify requester politely
      if (room && user) {
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        if (partnerDiscordId) {
          const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partnerUser) {
            const declinedForRequester = embedService.createRevealDeclinedContainer(true);
            await partnerUser.send({
              components: [declinedForRequester],
              flags: [MessageFlags.IsComponentsV2],
            }).catch(() => {});
          }
        }
      }
      return;
    }

    // --- Report Partner / Open Report Menu Button ---
    if (customId.startsWith('btn_report_room_') || customId === 'btn_room_report') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      if (!user) {
        await safeEditReply(btn, { content: '❌ Profile not found.' });
        return;
      }

      let roomId = customId.startsWith('btn_report_room_') 
        ? customId.replace('btn_report_room_', '') 
        : user.activeRoomId;

      if (!roomId) {
        roomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }
      if (!roomId) {
        roomId = (await redis.get(`user:last_room:${user.id}`)) || undefined;
      }

      let room = roomId ? await db.getRoomById(roomId) : null;
      if (!room) {
        room = await db.getLastRoomForUser(user.id);
      }

      if (!room) {
        const noRoomContainer = new ContainerBuilder()
          .setAccentColor(COLORS.DARK)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '# ℹ️ No Chat Session to Report\n\nYou do not have an active or recent chat session to report. Reports can only be submitted after chatting with an anonymous partner.'
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('destiny_btn_start')
                .setLabel('Start Match')
                .setStyle(ButtonStyle.Success)
            )
          );
        await safeEditReply(btn, { components: [noRoomContainer] });
        return;
      }

      const isUser1 = room.user1Id === user.id;
      const partnerPseudonym = isUser1 ? room.user2Pseudonym : room.user1Pseudonym;
      const reportContainer = embedService.createReportMenuContainer(room.id, partnerPseudonym);
      await safeEditReply(btn, { components: [reportContainer] });
      return;
    }

    // --- Cancel Report ---
    if (customId === 'act_report_cancel') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;
      const user = await db.getUserByDiscordId(discordUser.id);
      const isProfileComplete = Boolean(
        user && user.age >= 18 && user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim().length > 0
      );
      const container = embedService.createMainMenuContainer(discordUser.displayName || discordUser.username, user, isProfileComplete);
      await safeEditReply(btn, { components: [container] });
      return;
    }

    // --- Submit Report Category ---
    if (customId.startsWith('act_report_')) {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      if (!user) {
        await safeEditReply(btn, { content: '❌ Profile not found.' });
        return;
      }

      // Format: act_report_${roomId}_${category}
      const parts = customId.split('_');
      // parts[0] = 'act', parts[1] = 'report', parts[2] = roomId, parts[3...] = category
      const roomId = parts[2];
      const category = parts.slice(3).join('_') as ReportItem['category'];

      await reporterService.submitReport(
        user.id,
        category,
        `Report submitted via Discord DM interface (${category})`,
        roomId
      );

      // If room was active, notify partner politely
      const room = roomId ? await db.getRoomById(roomId) : null;
      if (room) {
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        if (partnerDiscordId) {
          const partner = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partner) {
            const partnerNotice = new ContainerBuilder()
              .setAccentColor(COLORS.DARK)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  '# 🚪 Chat Session Ended\n\nThis anonymous room session has been terminated.\nClick **Start Match** to connect with someone new!'
                )
              )
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
              .addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('destiny_btn_start')
                    .setLabel('Find New Match')
                    .setStyle(ButtonStyle.Success)
                )
              );
            await partner.send({ components: [partnerNotice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          }
        }
      }

      const successContainer = embedService.createReportSuccessContainer();
      await safeEditReply(btn, { components: [successContainer] });
      return;
    }
  }
}

/**
 * Opens Discord Modal for Profile Creation or Editing with Ultra-Low Latency (<10ms)
 */
async function handleOpenProfileModal(btn: ButtonInteraction): Promise<void> {
  try {
    const userPromise = db.getUserByDiscordId(btn.user.id).catch(() => null);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 600));
    const user = await Promise.race([userPromise, timeoutPromise]);

    const modal = new ModalBuilder()
      .setCustomId('modal_destiny_profile')
      .setTitle('Destiny — Profile Setup');

    // 1. Age input (Required, min 2, max 2)
    const ageInput = new TextInputBuilder()
      .setCustomId('profile_age')
      .setLabel('Your Age (Must be 18+)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(2)
      .setMaxLength(2)
      .setPlaceholder('18')
      .setRequired(true);

    if (user && user.age >= 18) {
      ageInput.setValue(user.age.toString());
    }

    // 2. Gender input (Required, min 3, max 25)
    const genderInput = new TextInputBuilder()
      .setCustomId('profile_gender')
      .setLabel('Your Gender (Male / Female / Other)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(25)
      .setPlaceholder('Male, Female, Non-binary, etc.')
      .setRequired(true);

    if (user && user.gender && user.gender !== 'prefer_not_to_say') {
      genderInput.setValue(user.gender.slice(0, 25));
    }

    // 3. Interests (Optional, max 150)
    const interestsInput = new TextInputBuilder()
      .setCustomId('profile_interests')
      .setLabel('Interests & Hobbies (Comma separated)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(150)
      .setPlaceholder('Gaming, Anime, Music, Coding, Travel')
      .setRequired(false);

    if (user && user.interests && user.interests.length > 0) {
      interestsInput.setValue(user.interests.join(', ').slice(0, 150));
    }

    // 4. Languages (Optional, max 50)
    const languagesInput = new TextInputBuilder()
      .setCustomId('profile_languages')
      .setLabel('Languages Spoken')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setPlaceholder('English, Spanish, Hindi')
      .setRequired(false);

    if (user && user.languages && user.languages.length > 0) {
      languagesInput.setValue(user.languages.join(', ').slice(0, 50));
    }

    // 5. Bio / Motto (Optional, max 80)
    const bioInput = new TextInputBuilder()
      .setCustomId('profile_bio')
      .setLabel('Profile Motto / Bio (Max 80 chars)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(80)
      .setPlaceholder('Looking for late-night gaming friends & deep talks')
      .setRequired(false);

    if (user && user.bio) {
      bioInput.setValue(user.bio.slice(0, 80));
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(ageInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(genderInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(interestsInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(languagesInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput)
    );

    await btn.showModal(modal);
  } catch (err: any) {
    console.error('[Bot] handleOpenProfileModal error:', err?.message || err);
  }
}

/**
 * Handle Profile Modal Submission and Save to Supabase in Real Time (Components V2)
 */
async function handleProfileModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const ok = await safeDeferReply(interaction);
  if (!ok) return;

  const ageStr = interaction.fields.getTextInputValue('profile_age').trim();
  const rawGender = interaction.fields.getTextInputValue('profile_gender').trim().toLowerCase();
  const interestsStr = interaction.fields.getTextInputValue('profile_interests')?.trim() || '';
  const languagesStr = interaction.fields.getTextInputValue('profile_languages')?.trim() || 'English';
  let bioStr = '';
  try {
    bioStr = interaction.fields.getTextInputValue('profile_bio')?.trim() || '';
  } catch {
    // profile_bio might not be present if opened before update
  }

  const age = parseInt(ageStr, 10);
  if (isNaN(age) || age < 18 || age > 99) {
    await safeEditReply(interaction, {
      content: '🔞 **Age Verification Failed**: You must be at least 18 years old to use Destiny (18-99).'
    });
    return;
  }

  let gender: Gender = 'other';
  if (/^(?:f|female|woman|women|girl)$/i.test(rawGender) || rawGender.includes('female') || rawGender.includes('woman') || rawGender.includes('girl')) {
    gender = 'female';
  } else if (/^(?:m|male|man|men|boy|guy)$/i.test(rawGender) || rawGender.includes('male') || rawGender.includes('man') || rawGender.includes('boy')) {
    gender = 'male';
  } else if (rawGender.includes('non') || rawGender.includes('nb') || rawGender.includes('enby')) {
    gender = 'non_binary';
  } else {
    gender = 'other';
  }

  const interests = interestsStr
    ? interestsStr.split(/[,;\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : [];

  const languages = languagesStr
    ? languagesStr.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    : ['en'];

  const existing = await db.getUserByDiscordId(interaction.user.id);
  const preferredGender: string[] = existing?.preferredGender && existing.preferredGender.length > 0
    ? existing.preferredGender
    : ['any'];

  let destinyId = existing?.destinyId;

  if (!destinyId || destinyId.length !== 6 || !/^[A-Z0-9]{6}$/.test(destinyId)) {
    destinyId = await db.generateUniqueDestinyId();
  }

  const savedUser = await db.createOrUpdateUser({
    discordUserId: interaction.user.id,
    destinyId,
    age,
    gender,
    preferredGender,
    interests,
    languages,
    bio: bioStr || existing?.bio,
  });

  const container = embedService.createProfileCreatedContainer(savedUser);
  await safeEditReply(interaction, { components: [container] });
}

/**
 * Handle Start Matchmaking Button Click (Components V2)
 * Prompts user with buttons to choose their match preference / mood!
 */
async function handleStartMatchButton(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);
  const isProfileComplete = Boolean(
    user &&
    user.age >= 18 &&
    user.gender &&
    user.gender !== 'prefer_not_to_say' &&
    user.gender.trim().length > 0
  );

  if (!user || !isProfileComplete) {
    const container = embedService.createProfileRequiredContainer();
    await safeEditReply(btn, { components: [container] });
    return;
  }

  if (user.isBanned) {
    const container = embedService.createAccountRestrictedContainer(user.banReason);
    await safeEditReply(btn, { components: [container] });
    return;
  }

  let activeRoomId = user.activeRoomId;
  if (!activeRoomId) {
    activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
  }
  if (activeRoomId) {
    const room = await db.getRoomById(activeRoomId);
    if (room && room.status === 'active') {
      const container = embedService.createActiveRoomPromptContainer(room.roomCode);
      await safeEditReply(btn, { components: [container] });
      return;
    } else {
      await db.clearActiveRoom(user.id);
      user.activeRoomId = null;
    }
  }

  const isQueued = await matchmakingManager.isQueued(user.id);
  if (isQueued) {
    const container = embedService.createAlreadyQueuedContainer();
    await safeEditReply(btn, { components: [container] });
    return;
  }

  // Ask user with buttons who they want to talk to today
  const container = embedService.createMatchPreferenceContainer(user);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Handle Coins & Wallet Menu (Components V2)
 */
async function handleWalletMenu(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);
  if (!user) {
    const container = embedService.createProfileRequiredContainer();
    await safeEditReply(btn, { components: [container] });
    return;
  }

  const container = embedService.createWalletContainer(user);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Handle Claiming Daily Reward (Components V2)
 */
async function handleClaimDaily(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);
  if (!user) {
    const container = embedService.createProfileRequiredContainer();
    await safeEditReply(btn, { components: [container] });
    return;
  }

  const claimRes = await streakService.claimDaily(user.id);
  const container = embedService.createDailyClaimResultContainer(
    claimRes.success,
    claimRes.message,
    claimRes.newBalance,
    claimRes.rewardDc,
    claimRes.newStreak
  );

  await safeEditReply(btn, { components: [container] });
}

/**
 * Handle Games Submenu (Components V2)
 */
async function handleGamesMenu(btn: ButtonInteraction): Promise<void> {
  const container = embedService.createGamesMenuContainer();
  await safeEditReply(btn, { components: [container] });
}

/**
 * Quick Coin Flip (Components V2)
 */
async function handleQuickFlip(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);
  if (!user || user.destinyCoins < 10) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_claim_daily')
        .setLabel('Claim Daily (+50 DC)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet')
        .setLabel('View Wallet')
        .setStyle(ButtonStyle.Secondary)
    );

    const container = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '# 🪙 Insufficient Destiny Coins\n\nYou need at least **10 Destiny Coins** to play!\nClaim your free daily reward to get started.'
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);

    await safeEditReply(btn, { components: [container] });
    return;
  }

  const res = await gameManager.playCoinFlip(user.id, 'heads', 10);
  if (!res.success || !res.result) {
    await safeEditReply(btn, { content: `❌ ${res.error || 'Coin flip failed'}` });
    return;
  }

  const updated = await db.getUserById(user.id);
  const won = res.result.isWin;
  const container = embedService.createCoinFlipResultContainer(won, res.result.result, updated?.destinyCoins ?? 0);

  await safeEditReply(btn, { components: [container] });
}

/**
 * Quick Dice Roll (Components V2)
 */
async function handleQuickDice(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);
  if (!user || user.destinyCoins < 10) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_claim_daily')
        .setLabel('Claim Daily (+50 DC)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet')
        .setLabel('View Wallet')
        .setStyle(ButtonStyle.Secondary)
    );

    const container = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '# 🎲 Insufficient Destiny Coins\n\nYou need at least **10 Destiny Coins** to roll!\nClaim your free daily reward to get started.'
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);

    await safeEditReply(btn, { components: [container] });
    return;
  }

  const res = await gameManager.playDice(user.id, 'over', 10);
  if (!res.success || !res.result) {
    await safeEditReply(btn, { content: `❌ ${res.error || 'Dice roll failed'}` });
    return;
  }

  const updated = await db.getUserById(user.id);
  const won = res.result.isWin;
  const outcome = res.result;
  const netChange = won ? outcome.payout - 10 : 10;

  const container = embedService.createDiceResultContainer(
    won,
    outcome.dice1,
    outcome.dice2,
    outcome.sum,
    netChange,
    updated?.destinyCoins ?? 0
  );

  await safeEditReply(btn, { components: [container] });
}

/**
 * Quick Trivia Question (Components V2)
 */
async function handleQuickTrivia(btn: ButtonInteraction): Promise<void> {
  const trivia = gameManager.getTrivia();
  const container = embedService.createTriviaContainer(trivia);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Quick Would You Rather Dilemma (Components V2)
 */
async function handleQuickWYR(btn: ButtonInteraction): Promise<void> {
  const wyr = gameManager.getWouldYouRather();
  const container = embedService.createWYRContainer(wyr);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Open Gender & Identity Verification Modal
 */
async function handleOpenVerifyModal(btn: ButtonInteraction): Promise<void> {
  try {
    const modal = new ModalBuilder()
      .setCustomId('modal_destiny_verify')
      .setTitle('Destiny — Gender Verification');

    const evidenceInput = new TextInputBuilder()
      .setCustomId('verify_evidence')
      .setLabel('Evidence / Proof (Voice note/role/link)')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(5)
      .setMaxLength(500)
      .setPlaceholder('e.g. Sent voice note in this DM, server verified role, or proof link')
      .setRequired(true);

    const notesInput = new TextInputBuilder()
      .setCustomId('verify_notes')
      .setLabel('Additional Notes for Staff (Optional)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(150)
      .setPlaceholder('Optional context for the reviewing admin')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(evidenceInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
    );

    await btn.showModal(modal);
  } catch (err: any) {
    console.error('[Bot] handleOpenVerifyModal error:', err?.message || err);
  }
}

/**
 * Handle Gender Verification Modal Submission
 */
async function handleVerifyModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const ok = await safeDeferReply(interaction);
  if (!ok) return;

  const user = await db.getUserByDiscordId(interaction.user.id, true);
  if (!user) {
    await safeEditReply(interaction, { content: '❌ Profile not found.' });
    return;
  }

  const evidence = interaction.fields.getTextInputValue('verify_evidence').trim();
  const notes = interaction.fields.getTextInputValue('verify_notes')?.trim() || '';

  const fullEvidence = notes ? `${evidence} | Notes: ${notes}` : evidence;
  await verificationService.submitVerification(user.id, fullEvidence);

  const container = embedService.createVerificationSubmittedContainer();
  await safeEditReply(interaction, { components: [container] });
}

/**
 * Handle 1-Click Server Role Verification Sync
 */
async function handleSyncServerRole(btn: ButtonInteraction): Promise<void> {
  const discordUser = btn.user;
  const user = await db.getUserByDiscordId(discordUser.id, true);
  if (!user) {
    const container = embedService.createProfileRequiredContainer();
    await safeEditReply(btn, { components: [container] });
    return;
  }

  if (user.genderVerified) {
    const container = embedService.createAlreadyVerifiedContainer(user);
    await safeEditReply(btn, { components: [container] });
    return;
  }

  let inAnyServer = false;
  let matchedRole: string | null = null;
  let serverName = '';

  for (const guild of btn.client.guilds.cache.values()) {
    const member = await guild.members.fetch(discordUser.id).catch(() => null);
    if (member) {
      inAnyServer = true;
      serverName = guild.name;
      for (const role of member.roles.cache.values()) {
        const rName = role.name.toLowerCase().trim();
        // Female roles
        if (
          rName.includes('female') ||
          rName.includes('auratjaat') ||
          rName.includes('girl') ||
          rName.includes('beauties') ||
          rName.includes('verified qtyyy')
        ) {
          matchedRole = role.name;
          user.gender = 'female';
          break;
        }
        // Male roles
        if (
          rName.includes('male') ||
          rName.includes('mardjaat') ||
          rName.includes('boy')
        ) {
          matchedRole = role.name;
          user.gender = 'male';
          break;
        }
        // General verified
        if (rName === 'verified' || rName.startsWith('verified')) {
          matchedRole = role.name;
          break;
        }
      }
      if (matchedRole) break;
    }
  }

  if (matchedRole) {
    user.genderVerified = true;
    user.genderVerificationStatus = 'verified';
    user.genderVerificationEvidence = `Server Role: "${matchedRole}" in ${serverName}`;
    await db.createOrUpdateUser(user);

    const successContainer = embedService.createRoleSyncSuccessContainer(user, matchedRole, serverName);
    await safeEditReply(btn, { components: [successContainer] });
    return;
  }

  const notFoundContainer = embedService.createRoleSyncNotFoundContainer(inAnyServer, serverName || 'discord.gg/eclairs');
  await safeEditReply(btn, { components: [notFoundContainer] });
}

/**
 * Handle Admin Approve / Reject from Staff Channel
 */
async function handleAdminVerifyAction(btn: ButtonInteraction, approve: boolean, userId: string): Promise<void> {
  const member = btn.member as any;
  const isStaff = member?.permissions?.has?.('ManageGuild') || 
                  member?.permissions?.has?.('Administrator') ||
                  member?.permissions?.has?.('ModerateMembers') ||
                  member?.roles?.cache?.some((r: any) => /mod|admin|staff|owner/i.test(r.name));

  if (!isStaff && btn.user.id !== '971251685773152326') {
    await safeEditReply(btn, { content: '⛔ Only Destiny administrators and staff can review verifications.' });
    return;
  }

  await verificationService.reviewVerification(
    btn.user.tag,
    userId,
    approve,
    approve ? `Approved by staff @${btn.user.tag}` : `Rejected by staff @${btn.user.tag}`
  );

  const targetUser = await db.getUserById(userId);
  const statusText = approve
    ? `✅ **Approved by <@${btn.user.id}>** on ${new Date().toLocaleDateString()}`
    : `❌ **Rejected by <@${btn.user.id}>** on ${new Date().toLocaleDateString()}`;

  const decisionEmbed = embedService.createStaffVerificationDecisionEmbed(targetUser, statusText, approve);
  try {
    await btn.editReply({
      embeds: [decisionEmbed],
      components: []
    });
  } catch {
    const updatedContainer = new ContainerBuilder()
      .setAccentColor(approve ? COLORS.SUCCESS : COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ Verification Review Processed\n\n` +
          `• 👤 **User:** <@${targetUser?.discordUserId || 'User'}>\n` +
          `• 🆔 **Destiny ID:** \`${targetUser?.destinyId || 'N/A'}\`\n` +
          `• ⚧ **Gender:** \`${targetUser?.gender || 'N/A'}\`\n` +
          `• 📋 **Decision:** ${statusText}`
        )
      );
    await safeEditReply(btn, { components: [updatedContainer] });
  }
}

/**
 * Check if an interaction or message author has admin/staff permissions in the guild
 */
export function isGuildAdmin(interactionOrMessage: Interaction | Message): boolean {
  const member = interactionOrMessage.member as any;
  if (!member) return false;

  const authorId = interactionOrMessage instanceof Message ? interactionOrMessage.author.id : interactionOrMessage.user.id;
  // Bot Developer / Master Override
  if (authorId === '971251685773152326') return true;

  // Server Owner
  if (interactionOrMessage.guild?.ownerId === authorId) return true;

  // Discord permissions
  if (member.permissions?.has?.('Administrator') || member.permissions?.has?.('ManageGuild')) {
    return true;
  }

  // Common staff / mod roles
  if (member.roles?.cache?.some?.((r: any) => /admin|owner|manager|moderator|staff/i.test(r.name))) {
    return true;
  }

  return false;
}

/**
 * Handle "Set Current Channel as Bot Channel" button
 */
async function handleSetCurrentAdminChannel(btn: ButtonInteraction): Promise<void> {
  if (!btn.guildId || !btn.channelId) return;

  if (!isGuildAdmin(btn)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('⚠️ Only server administrators with **Manage Server** or **Administrator** permissions can configure Destiny.')
      );
    await safeEditReply(btn, { components: [errorContainer] });
    return;
  }

  await db.setGuildAdminChannel(btn.guildId, btn.channelId, btn.guild?.name);
  const successContainer = embedService.createChannelSetSuccessContainer(btn.channelId, btn.guild?.name || 'Server');
  await safeEditReply(btn, { components: [successContainer] });
}

/**
 * Handle ChannelSelectMenu for picking Destiny Admin Channel
 */
async function handleSelectAdminChannel(select: ChannelSelectMenuInteraction): Promise<void> {
  if (!select.guildId) return;

  if (!isGuildAdmin(select)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('⚠️ Only server administrators with **Manage Server** or **Administrator** permissions can configure Destiny.')
      );
    await safeEditReply(select, { components: [errorContainer] });
    return;
  }

  const selectedChannelId = select.values[0];
  if (!selectedChannelId) return;

  await db.setGuildAdminChannel(select.guildId, selectedChannelId, select.guild?.name);
  const successContainer = embedService.createChannelSetSuccessContainer(selectedChannelId, select.guild?.name || 'Server');
  await safeEditReply(select, { components: [successContainer] });
}

/**
 * Handle "Post Public Lobby Card Here" button
 */
async function handlePostLobbyCard(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.channel) return;

  if (!isGuildAdmin(btn)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('⚠️ Only server administrators can post public lobby cards.')
      );
    await safeEditReply(btn, { components: [errorContainer] });
    return;
  }

  const lobbyContainer = embedService.createServerLobbyCardContainer(btn.guild.name);
  await (btn.channel as any).send({
    components: [lobbyContainer],
    flags: [MessageFlags.IsComponentsV2]
  }).catch(() => {});

  const notice = new ContainerBuilder()
    .setAccentColor(COLORS.SUCCESS)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('✅ **Public Matchmaking Lobby posted successfully in this channel!**')
    );
  await safeEditReply(btn, { components: [notice] });
}

/**
 * Handle "Post Verification Hub Here" button
 */
async function handlePostVerifyHub(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.channel) return;

  if (!isGuildAdmin(btn)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('⚠️ Only server administrators can post verification hubs.')
      );
    await safeEditReply(btn, { components: [errorContainer] });
    return;
  }

  const verifyContainer = embedService.createVerificationPromptContainer();
  await (btn.channel as any).send({
    components: [verifyContainer],
    flags: [MessageFlags.IsComponentsV2]
  }).catch(() => {});

  const notice = new ContainerBuilder()
    .setAccentColor(COLORS.SUCCESS)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('✅ **Gender Verification Hub posted successfully in this channel!**')
    );
  await safeEditReply(btn, { components: [notice] });
}

/**
 * Handle "Refresh Status" button
 */
async function handleRefreshSetup(btn: ButtonInteraction): Promise<void> {
  if (!btn.guildId || !btn.guild) return;

  const settings = await db.getGuildSettings(btn.guildId, true);
  const container = embedService.createServerSetupContainer(btn.guild, settings, btn.channelId);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Handle "Reset Channel Lock" button
 */
async function handleResetSetup(btn: ButtonInteraction): Promise<void> {
  if (!btn.guildId || !btn.guild) return;

  if (!isGuildAdmin(btn)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('⚠️ Only server administrators can reset channel settings.')
      );
    await safeEditReply(btn, { components: [errorContainer] });
    return;
  }

  await db.clearGuildChannels(btn.guildId);
  const container = embedService.createChannelResetSuccessContainer(btn.guild.name);
  await safeEditReply(btn, { components: [container] });
}

/**
 * Post alert into Staff Moderation Channel when a Voice Note is submitted.
 * Prioritizes each server's configured admin/modLog channel!
 */
export async function postStaffVerificationAlert(client: any, user: UserProfile, audioUrl: string): Promise<void> {
  const { embed, components } = embedService.createStaffVerificationReviewEmbed(user, audioUrl);
  const filename = audioUrl.toLowerCase().includes('.mp3') 
    ? 'voice_note.mp3' 
    : audioUrl.toLowerCase().includes('.wav') 
      ? 'voice_note.wav' 
      : 'voice_note.ogg';
  const attachment = new AttachmentBuilder(audioUrl, { name: filename });

  for (const guild of client.guilds.cache.values()) {
    const settings = await db.getGuildSettings(guild.id).catch(() => null);
    let targetChannel: any = null;

    // 1. Prioritize explicitly configured channel
    if (settings?.modLogChannelId) {
      targetChannel = guild.channels.cache.get(settings.modLogChannelId) || 
        await guild.channels.fetch(settings.modLogChannelId).catch(() => null);
    }

    // 2. Fall back to smart channel name matching
    if (!targetChannel) {
      targetChannel = guild.channels.cache.find((c: any) => {
        const name = c.name.toLowerCase();
        return c.isTextBased() && (
          name.includes('destiny') ||
          name.includes('mod-log') ||
          name.includes('modlog') ||
          name.includes('report-den') ||
          name.includes('staff') ||
          name.includes('verification') ||
          name.includes('admin') ||
          name.includes('log')
        );
      });
    }

    if (targetChannel && targetChannel.isTextBased()) {
      await (targetChannel as any).send({
        embeds: [embed],
        components,
        files: [attachment]
      }).catch((err: any) => {
        console.error('[Verification] Failed to send staff verification alert:', err?.message || err);
      });
      return;
    }
  }
}
