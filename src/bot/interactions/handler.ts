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
  Message,
  PermissionFlagsBits
} from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { matchmakingManager } from '../../core/matchmaking/manager.js';
import { revealService } from '../../core/moderation/reveal.js';
import { reporterService } from '../../core/moderation/reporter.js';
import { verificationService } from '../../core/moderation/verification.js';
import { ECLAIRS_GUILD_IDS, handleReputationCheck, isReputationRestriction } from '../../core/moderation/reputation.js';
import { embedService, COLORS } from '../embeds/index.js';
import { ProfileField, ReportItem, UserProfile } from '../../core/types.js';
import {
  buildProfileCard,
  createProfileActionRow,
  isProfileComplete,
} from '../profile-view.js';
import { buildProfileModal, normalizeGender, parseList } from '../profile-modal.js';
import { refreshBotPresence } from '../presence-manager.js';
import { createRevealResultContainer, resolveRevealPair } from '../reveal-view.js';
import { pickIcebreaker } from '../icebreakers.js';
import { handleCommand } from '../commands/definitions.js';
import { sendCleanDmPanel } from '../dm-cleanup.js';

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
    const components = Array.isArray(payload.components) ? payload.components : [];
    let hasV2Container = components.some((component: any) => component instanceof ContainerBuilder || component?.type === 17);

    if (hasV2Container) {
      // Components V2 disallows legacy content/embeds alongside containers.
      payload.flags = payload.flags !== undefined
        ? (payload.flags | MessageFlags.IsComponentsV2)
        : MessageFlags.IsComponentsV2;
      delete payload.content;
      delete payload.embeds;
    } else if (payload.content && components.length === 0 && (!payload.embeds || payload.embeds.length === 0)) {
      // Text-only replies are rendered as a simple V2 notice container.
      const noticeContainer = new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(payload.content)
        );
      payload.components = [noticeContainer];
      payload.flags = payload.flags !== undefined
        ? (payload.flags | MessageFlags.IsComponentsV2)
        : MessageFlags.IsComponentsV2;
      delete payload.content;
      hasV2Container = true;
    }

    const isLegacyComponentMessage = Boolean(
      interaction.isMessageComponent?.() &&
      !interaction.message?.flags?.has(MessageFlags.IsComponentsV2)
    );
    if (hasV2Container && isLegacyComponentMessage && (interaction.deferred || interaction.replied)) {
      await interaction.followUp({
        ...payload,
        flags: payload.flags | MessageFlags.Ephemeral,
      });
      return;
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
  // Gracefully acknowledge buttons and menus posted by older bot versions.
  // These component IDs remain in already-published Discord messages.
  const retiredButtonIds = new Set([
    'destiny_btn_wallet',
    'destiny_btn_wallet_daily',
    'destiny_btn_claim_daily',
    'destiny_btn_shop',
    'destiny_btn_wardrobe',
  ]);
  const retiredSelectIds = new Set(['destiny_select_theme', 'destiny_select_badges']);
  const retiredMessage = 'This control is no longer available. Use /match to start an anonymous chat or /profile to manage your profile.';
  if (interaction.isButton() && retiredButtonIds.has(interaction.customId)) {
    await interaction.reply({ content: retiredMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  if (interaction.isStringSelectMenu() && retiredSelectIds.has(interaction.customId)) {
    await interaction.reply({ content: retiredMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  // Slash commands are routed to the command controller.
  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
    return;
  }

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

    const account = await db.getUserByDiscordId(btn.user.id, true);
    if (account?.isBanned && !isReputationRestriction(account)) {
      await safeEditReply(btn, {
        content: 'Your account is currently restricted by Destiny moderation. Please contact the moderators if you believe this is a mistake.',
      });
      return;
    }

    const stillRestricted = embedService.createLowReputationRestrictedContainer();
    await safeEditReply(btn, { components: [stillRestricted] });
    return;
  }

  // Reputation & Ban Guard for all other interactions
  const activeUser = await db.getUserByDiscordId(interaction.user.id, true);
  if (activeUser && (activeUser.reputationScore < 10 || activeUser.isBanned)) {
    const repStatus = await handleReputationCheck(interaction.client, interaction.user.id);
    if (repStatus.isRestricted) {
      // Ignore their request completely, show only the discord.gg/eclairs regain message
      if (interaction.isRepliable()) {
        const ok = await safeDeferReply(interaction as any);
        if (ok) {
          const moderationBan = activeUser.isBanned && !isReputationRestriction(activeUser);
          if (moderationBan) {
            await safeEditReply(interaction as any, {
              content: 'Your account is currently restricted by Destiny moderation. Please contact the moderators if you believe this is a mistake.',
            });
          } else {
            const container = embedService.createLowReputationRestrictedContainer();
            await safeEditReply(interaction as any, { components: [container] });
          }
        }
      }
      return;
    }
  }

  // =========================================================================
  // GUILD INTERACTION REDIRECT GUARD: Destiny runs 100% in DMs
  // Any user button or select menu clicked in a server channel is redirected
  // directly to their private DMs to preserve total anonymity and avoid channel clutter.
  // =========================================================================
  if (interaction.guild && (interaction.isButton() || interaction.isStringSelectMenu())) {
    const customId = (interaction as any).customId || '';
    const isAdminAction =
      customId.startsWith('destiny_admin_') ||
      customId.startsWith('destiny_channel_') ||
      customId.startsWith('destiny_select_admin_channel') ||
      customId.startsWith('destiny_btn_setup_') ||
      customId.startsWith('btn_admin_verify_');

    if (!isAdminAction) {
      try {
        const user = await db.getUserByDiscordId(interaction.user.id, true);
        const isProfileComplete = Boolean(
          user &&
          user.age >= 18 &&
          user.gender &&
          user.gender !== 'prefer_not_to_say' &&
          user.gender.trim().length > 0
        );
        const authorDisplayName = interaction.user.displayName || interaction.user.username;
        const menuContainer = embedService.createMainMenuContainer(authorDisplayName, user, isProfileComplete);

        await sendCleanDmPanel(interaction.user, {
          components: [menuContainer],
          flags: [MessageFlags.IsComponentsV2]
        });

        await (interaction as any).reply({
          content: '🔒 **Destiny operates 100% privately in DMs.** I have delivered your Destiny console directly to your Direct Messages!',
          flags: [MessageFlags.Ephemeral]
        });
      } catch {
        await (interaction as any).reply({
          content: '⚠️ Please enable **Allow direct messages from server members** in your Discord Privacy Settings so Destiny can chat with you privately.',
          flags: [MessageFlags.Ephemeral]
        });
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
      const room = await db.getRoomById(roomId).catch(() => null);
      const res = await revealService.submitConsent(roomId, user.id, selectedFields);

      if (res.completed) {
        // Both partners consented — show what was actually shared, not just the
        // list of field names. The payloads are already filtered by the reveal
        // service so unagreed fields can never leak.
        const { mine, partner } = resolveRevealPair(room, user.id, res);

        const container = createRevealResultContainer(partner, res.agreedFields);
        await safeEditReply(select, { components: [container] });

        // Deliver the matching reveal card to the partner as well.
        if (room) {
          const isUser1 = room.user1Id === user.id;
          const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
          if (partnerDiscordId) {
            const partnerUser = await select.client.users.fetch(partnerDiscordId).catch(() => null);
            if (partnerUser) {
              const successForPartner = createRevealResultContainer(mine, res.agreedFields);
              await sendCleanDmPanel(partnerUser, {
                components: [successForPartner],
                flags: [MessageFlags.IsComponentsV2],
              }).catch(() => {});
            }
          }
        }
      } else {
        await safeEditReply(select, { content: res.message });

        // Prompt the partner to consent if they have not done so yet.
        if (room && room.status === 'active') {
          const isUser1 = room.user1Id === user.id;
          const partnerConsented = isUser1
            ? room.revealStatusUser2?.consented
            : room.revealStatusUser1?.consented;

          if (!partnerConsented) {
            const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
            const myPseudonym = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;
            const myAvatar = isUser1 ? room.user1Avatar : room.user2Avatar;

            if (partnerDiscordId) {
              const partnerUser = await select.client.users.fetch(partnerDiscordId).catch(() => null);
              if (partnerUser) {
                const promptContainer = embedService.createRevealPromptPartnerContainer(myAvatar, myPseudonym);
                await sendCleanDmPanel(partnerUser, {
                  components: [promptContainer],
                  flags: [MessageFlags.IsComponentsV2],
                }).catch(() => {});
              }
            }
          }
        }
      }
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
    if (customId === 'destiny_btn_profile' || customId === 'destiny_btn_setup_profile') {
      await handleOpenProfileModal(btn);
      return;
    }

    // --- Profile Card View (Static PNG) ---
    if (customId === 'destiny_btn_card_static') {
      const user = await db.getUserByDiscordId(discordUser.id);
      if (!user) {
        await btn.reply({ content: 'Please set up your profile first with `/profile`.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      const ok = await safeDeferReply(btn);
      if (!ok) return;

      try {
        const { attachment } = await buildProfileCard(user, discordUser, btn.member);

        await btn.editReply({
          content: '📸 **Your Destiny profile card** — tap **Edit Profile** to make changes.',
          files: [attachment],
          components: [createProfileActionRow()],
        });
      } catch (err: any) {
        console.error('[Bot] Profile card render error:', err?.message || err);
        await safeEditReply(btn, { content: '⚠️ Could not render your card right now. Please try again.' });
      }
      return;
    }

    // --- Profile Verification Trigger ---
    if (customId === 'destiny_btn_verify' || customId === 'destiny_btn_verify_modal' || customId === 'destiny_btn_verify_prompt') {
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

    // --- Return to Main Menu ---
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

    // --- Conversation Icebreaker ---
    if (customId === 'destiny_btn_icebreaker') {
      const ok = await safeDeferReply(btn);
      if (!ok) return;

      const user = await db.getUserByDiscordId(discordUser.id, true);
      let activeRoomId = user?.activeRoomId;
      if (!activeRoomId && user) {
        activeRoomId = (await redis.get(`user:active_room:${user.id}`)) || undefined;
      }

      const room = activeRoomId ? await db.getRoomById(activeRoomId).catch(() => null) : null;
      const inRoom = Boolean(room && room.status === 'active');
      const prompt = pickIcebreaker();

      const container = embedService.createIcebreakerContainer(prompt, inRoom);
      await safeEditReply(btn, { components: [container] });

      if (inRoom && room && user) {
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;
        if (partnerDiscordId) {
          const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partnerUser) {
            const partnerPrompt = embedService.createIcebreakerContainer(prompt, true);
            await sendCleanDmPanel(partnerUser, {
              components: [partnerPrompt],
              flags: [MessageFlags.IsComponentsV2],
            }).catch(() => {});
          }
        }
      }
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

        // The conversation just ended — reflect it in the rotating presence.
        refreshBotPresence();

        if (room) {
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

              sendCleanDmPanel(partner, sendOptions).catch(() => {});
            }).catch(() => {});
          }
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
        await safeEditReply(btn, editOptions);
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

      // Automatically consent to share agreed profile fields. This is an implicit
      // consent, so it may only narrow what the user already agreed to.
      const consentResult = await revealService.submitConsent(
        room.id,
        user.id,
        ['discordTag', 'destinyId', 'age', 'gender', 'interests'],
        'narrow'
      );

      const isUser1 = room.user1Id === user.id;
      const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;

      if (consentResult.completed) {
        // The partner had already consented — resolve the reveal right away.
        const { mine, partner } = resolveRevealPair(room, user.id, consentResult);
        await safeEditReply(btn, { components: [createRevealResultContainer(partner, consentResult.agreedFields)] });

        if (partnerDiscordId) {
          const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partnerUser) {
            await sendCleanDmPanel(partnerUser, {
              components: [createRevealResultContainer(mine, consentResult.agreedFields)],
              flags: [MessageFlags.IsComponentsV2],
            }).catch(() => {});
          }
        }
        return;
      }

      // Show waiting container to requester
      const waitingContainer = embedService.createRevealWaitingContainer();
      await safeEditReply(btn, { components: [waitingContainer] });

      // Deliver interactive prompt to partner
      const myPseudonym = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;
      const myAvatar = isUser1 ? room.user1Avatar : room.user2Avatar;

      if (partnerDiscordId) {
        const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
        if (partnerUser) {
          const promptContainer = embedService.createRevealPromptPartnerContainer(myAvatar, myPseudonym);
          await sendCleanDmPanel(partnerUser, {
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

      const consentResult = await revealService.submitConsent(
        room.id,
        user.id,
        ['discordTag', 'destinyId', 'age', 'gender', 'interests'],
        'narrow'
      );
      if (consentResult.completed) {
        const isUser1 = room.user1Id === user.id;
        const partnerDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;

        // Only the mutually agreed fields are shown to each side.
        const { mine, partner } = resolveRevealPair(room, user.id, consentResult);

        // Reveal card for accepting user
        await safeEditReply(btn, { components: [createRevealResultContainer(partner, consentResult.agreedFields)] });

        // Deliver reveal card to requester
        if (partnerDiscordId) {
          const partnerUser = await btn.client.users.fetch(partnerDiscordId).catch(() => null);
          if (partnerUser) {
            const successForRequester = createRevealResultContainer(mine, consentResult.agreedFields);
            await sendCleanDmPanel(partnerUser, {
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
            await sendCleanDmPanel(partnerUser, {
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

      const reportResult = await reporterService.submitReport(
        user.id,
        category,
        `Report submitted via Discord DM interface (${category})`,
        roomId
      );

      if (!reportResult.success || !reportResult.reportId) {
        await safeEditReply(btn, {
          content: reportResult.message || 'The report could not be saved. Please try again.',
        });
        return;
      }

      // Reports are submitted in DMs, so they have no reliable originating
      // guild. Route them to the first explicitly configured private mod-log
      // in the trusted global staff communities (same policy as verification).
      const reportDelivered = await postStaffReportAlert(btn.client, reportResult.reportId);

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
            await sendCleanDmPanel(partner, { components: [partnerNotice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          }
        }
      }

      const successContainer = embedService.createReportSuccessContainer(reportDelivered, reportResult.message);
      await safeEditReply(btn, { components: [successContainer] });
      return;
    }
  }
}

/**
 * Opens the shared profile setup / edit modal.
 */
async function handleOpenProfileModal(btn: ButtonInteraction): Promise<void> {
  try {
    const user = await db.getUserByDiscordId(btn.user.id).catch(() => null);
    await btn.showModal(buildProfileModal(user));
  } catch (err: any) {
    console.error('[Bot] handleOpenProfileModal error:', err?.message || err);
  }
}

/**
 * Handle Profile Modal Submission, persist the profile and render the card
 * automatically — no follow-up button click required.
 */
async function handleProfileModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const ok = await safeDeferReply(interaction);
  if (!ok) return;

  const ageStr = interaction.fields.getTextInputValue('profile_age').trim();
  const rawGender = interaction.fields.getTextInputValue('profile_gender').trim();
  const getOptionalField = (id: string): string => {
    try {
      return interaction.fields.getTextInputValue(id)?.trim() || '';
    } catch {
      return '';
    }
  };
  const interestsStr = getOptionalField('profile_interests');
  const languagesStr = getOptionalField('profile_languages');
  const bioStr = getOptionalField('profile_bio');

  const age = parseInt(ageStr, 10);
  if (!/^\\d{2}$/.test(ageStr) || !Number.isInteger(age) || age < 18 || age > 99) {
    await safeEditReply(interaction, {
      content: '🔞 **Age Verification Failed**: You must be at least 18 years old to use Destiny (18-99). Use `/profile` to try again.',
    });
    return;
  }

  const gender = normalizeGender(rawGender);
  const interests = parseList(interestsStr)
    .map((interest) => interest.toLowerCase());

  // Ticket locks use the database UUID. For first-time signup, use a
  // Discord-scoped bootstrap lock until the profile row has been created.
  const profileBefore = await db.getUserByDiscordId(interaction.user.id, true);
  const profileLockId = profileBefore?.id || `discord:${interaction.user.id}`;

  // Serialize profile changes with match reservation so a stale ticket cannot
  // be reserved while the user is editing age or compatibility fields.
  const savedUser = await matchmakingManager.withTicketLock(profileLockId, async () => {
    const existing = await db.getUserByDiscordId(interaction.user.id, true);
    if (profileBefore && existing?.id !== profileBefore.id) {
      throw new Error('Profile changed while the edit form was open. Please reopen /profile.');
    }
    const languages = languagesStr
      ? parseList(languagesStr, 6)
      : (existing?.languages && existing.languages.length > 0 ? existing.languages : ['en']);

    const preferredGender: string[] = existing?.preferredGender && existing.preferredGender.length > 0
      ? existing.preferredGender
      : ['any'];

    let destinyId = existing?.destinyId;
    if (!destinyId || destinyId.length !== 6 || !/^[A-Z0-9]{6}$/.test(destinyId)) {
      destinyId = await db.generateUniqueDestinyId();
    }

    return db.createOrUpdateUser({
      discordUserId: interaction.user.id,
      destinyId,
      age,
      gender,
      preferredGender,
      interests,
      languages,
      bio: bioStr,
    });
  });

  try {
    const { attachment } = await buildProfileCard(savedUser, interaction.user, interaction.member);

    await interaction.editReply({
      content:
        `✅ **Profile saved!** Your anonymous Destiny ID is \`${savedUser.destinyId}\`.\n` +
        `Update anything anytime with \`/profile\`, then tap **Find Match** when you are ready.`,
      files: [attachment],
      components: [createProfileActionRow()],
    });
  } catch (err: any) {
    console.error('[Bot] Profile card render error after save:', err?.message || err);
    const container = embedService.createProfileCreatedContainer(savedUser);
    await safeEditReply(interaction, { components: [container] });
  }
}

/**
 * Handle Start Matchmaking Button Click (Components V2)
 * Prompts user with buttons to choose their match preference / mood!
 */
async function handleStartMatchButton(btn: ButtonInteraction): Promise<void> {
  const user = await db.getUserByDiscordId(btn.user.id);

  if (!user || !isProfileComplete(user)) {
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

  const queueRes = await matchmakingManager.joinQueue(user, btn.guildId || undefined);
  if (!queueRes.success) {
    await safeEditReply(btn, { content: `⚠️ ${queueRes.message}` });
    return;
  }

  matchmakingManager.processMatchCycle().catch(() => {});
  const container = embedService.createSearchingContainer(user);
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
  const submission = await verificationService.submitVerification(user.id, fullEvidence);
  if (!submission.success) {
    await safeEditReply(interaction, { content: `⚠️ ${submission.message}` });
    return;
  }

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

  // Only configured Eclairs communities are trusted sources for role sync.
  for (const guildId of ECLAIRS_GUILD_IDS) {
    const guild = btn.client.guilds.cache.get(guildId) || await btn.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;
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
  // Verification actions are privileged moderation operations. Do not trust
  // role names ("admin", "mod", etc.) or buttons copied into unrelated servers.
  const trustedGuild = Boolean(btn.guildId && ECLAIRS_GUILD_IDS.includes(btn.guildId));
  const isStaff = trustedGuild && Boolean(
    btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    btn.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    btn.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  );

  if (!isStaff && btn.user.id !== '971251685773152326') {
    await safeEditReply(btn, { content: '⛔ Verification reviews are restricted to authorized Eclairs community moderators.' });
    return;
  }

  const review = await verificationService.reviewVerification(
    btn.user.tag,
    userId,
    approve,
    approve ? `Approved by staff @${btn.user.tag}` : `Rejected by staff @${btn.user.tag}`
  );
  if (!review.success) {
    await safeEditReply(btn, { content: `⚠️ ${review.message}` });
    return;
  }

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

  // Actual Discord permissions only. Role names are user-configurable and
  // must never be treated as proof of administrator authority.
  if (
    member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    member.permissions?.has?.(PermissionFlagsBits.ManageGuild)
  ) {
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
 * Deliver a saved safety report to the configured private moderation channel
 * in the trusted global staff communities. Reports originate in DMs, so a
 * per-user source guild cannot be inferred safely.
 */
export async function postStaffReportAlert(client: any, reportId: string): Promise<boolean> {
  const report = await db.getReportById(reportId).catch((error) => {
    console.error('[Reports] Could not reload saved report for staff delivery:', error?.message || error);
    return null;
  });
  if (!report) return false;

  // Reports are submitted in DMs, so there is no reliable source guild.
  // Use only the configured mod-log in Destiny's trusted global staff servers.
  // The configured channel may also be a public portal channel, so this alert
  // intentionally contains no identities, descriptions, or chat excerpts.
  const alert = new ContainerBuilder()
    .setAccentColor(COLORS.DANGER)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🚨 New Destiny Safety Report\n\n` +
        `A new report is waiting for moderator review.\n\n` +
        `• **Report ID:** \`${report.id}\`\n` +
        `• **Status:** ${report.status || 'pending'}\n\n` +
        `Open the protected Destiny moderation dashboard to review the report details and chat evidence. This channel alert intentionally excludes user identities and conversation content.`
      )
    );

  for (const guildId of ECLAIRS_GUILD_IDS) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const settings = await db.getGuildSettings(guild.id, true).catch((error) => {
      console.warn(`[Reports] Could not load moderation-channel settings for trusted guild ${guild.id}:`, error?.message || error);
      return null;
    });
    if (!settings?.modLogChannelId) continue;

    const channel: any = guild.channels.cache.get(settings.modLogChannelId) ||
      await guild.channels.fetch(settings.modLogChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function' || typeof channel.permissionsFor !== 'function') {
      console.warn(`[Reports] Configured moderation channel is unavailable in trusted guild ${guild.id}.`);
      continue;
    }

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
    const canSend = Boolean(
      botPermissions?.has(PermissionFlagsBits.ViewChannel) &&
      botPermissions?.has(PermissionFlagsBits.SendMessages)
    );
    if (!canSend) {
      console.warn(`[Reports] Destiny lacks View Channel or Send Messages in the configured moderation channel for guild ${guild.id}.`);
      continue;
    }

    try {
      await channel.send({
        components: [alert],
        flags: [MessageFlags.IsComponentsV2],
        allowedMentions: { parse: [] },
      });
      console.log(`[Reports] Delivered privacy-safe report alert ${report.id} to the configured moderation channel in guild ${guild.id}.`);
      return true;
    } catch (error: any) {
      console.error(`[Reports] Failed to deliver report alert ${report.id} in guild ${guild.id}:`, error?.message || error);
    }
  }

  console.warn(`[Reports] Report ${report.id} was saved, but no configured trusted moderation channel accepted the notification.`);
  return false;
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

  // Verification evidence is sensitive. Never guess a destination from a
  // channel name: require an explicitly configured, private moderation log.
  for (const guildId of ECLAIRS_GUILD_IDS) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const settings = await db.getGuildSettings(guild.id).catch(() => null);
    if (!settings?.modLogChannelId) {
      console.warn(`[Verification] No private moderation log is configured for trusted guild ${guild.id}; evidence was not posted.`);
      continue;
    }

    const targetChannel = guild.channels.cache.get(settings.modLogChannelId) ||
      await guild.channels.fetch(settings.modLogChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased() || !('permissionsFor' in targetChannel)) {
      console.warn(`[Verification] Configured moderation channel is unavailable in guild ${guild.id}.`);
      continue;
    }

    // Fail closed when @everyone can view the channel or its permissions
    // cannot be determined. A moderator must configure a genuinely private log.
    const everyoneCanView = targetChannel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
    if (everyoneCanView !== false) {
      console.warn(`[Verification] Refusing to post private evidence to a channel visible to @everyone in guild ${guild.id}.`);
      continue;
    }

    try {
      await (targetChannel as any).send({
        embeds: [embed],
        components,
        files: [attachment],
      });
      return;
    } catch (error: any) {
      console.error('[Verification] Failed to send private staff verification alert:', error?.message || error);
    }
  }
}
