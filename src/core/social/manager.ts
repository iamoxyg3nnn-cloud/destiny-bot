import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SeparatorBuilder,
  Client,
  MessageFlags
} from 'discord.js';
import { UserProfile, ReputationAccolades, PraiseTag, DestinyFriend } from '../types.js';
import { stateStore } from '../../storage/state-store.js';
import { db } from '../../database/supabase.js';
import { formatCustomEmojiText, resolveBotEmoji } from '../../bot/custom-emojis.js';
import { COLORS } from '../../bot/embeds/index.js';
import { blockerService } from '../moderation/blocker.js';
import { sendCleanDmPanel } from '../../bot/dm-cleanup.js';
import { anonymizer } from '../anonymizer.js';
import { voiceManager } from '../voice/manager.js';

export const PRAISE_TAG_LABELS: Record<PraiseTag, { label: string; emoji: string }> = {
  great_listener: { label: 'Great Listener', emoji: '🎧' },
  hilarious: { label: 'Hilarious', emoji: '😂' },
  respectful: { label: 'Respectful', emoji: '🤝' },
  insightful: { label: 'Insightful', emoji: '💡' }
};

export class SocialManager {
  /**
   * Creates the post-match wrap-up container for session feedback.
   */
  createSessionWrapUpContainer(partnerDestinyId: string, partnerUserId: string, roomId: string): ContainerBuilder {
    const reconnectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`destiny_reconnect_${partnerUserId}_${roomId}`)
        .setLabel('Would Talk Again')
        .setEmoji(resolveBotEmoji('⭐'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Find Match')
        .setEmoji(resolveBotEmoji('✨'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`btn_report_room_${roomId}`)
        .setLabel('Report')
        .setEmoji(resolveBotEmoji('🚨'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('destiny_dismiss_wrapup')
        .setLabel('Dismiss')
        .setEmoji(resolveBotEmoji('👋'))
        .setStyle(ButtonStyle.Secondary)
    );

    const praiseRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`destiny_praise_great_listener_${partnerUserId}_${roomId}`)
        .setLabel('Great Listener')
        .setEmoji(resolveBotEmoji('🎧'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`destiny_praise_hilarious_${partnerUserId}_${roomId}`)
        .setLabel('Hilarious')
        .setEmoji(resolveBotEmoji('😂'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`destiny_praise_respectful_${partnerUserId}_${roomId}`)
        .setLabel('Respectful')
        .setEmoji(resolveBotEmoji('🤝'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`destiny_praise_insightful_${partnerUserId}_${roomId}`)
        .setLabel('Insightful')
        .setEmoji(resolveBotEmoji('💡'))
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          formatCustomEmojiText(`# 🌟 Session Wrap-Up with **${partnerDestinyId}**\n\n`) +
          `Your session has concluded! Leave peer accolades or cast an anonymous second-chance vote:\n\n` +
          `• **⭐ Second Chance Matching:** If you both click **[Would Talk Again]** within 24h, you'll be mutually reconnected!\n` +
          `• **🏆 Anonymous Accolades:** Award your partner a verified reputation badge below.\n\n` +
          `-# 🔒 100% Anonymous • Votes and praise are never individually revealed.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(reconnectRow, praiseRow);
  }

  /**
   * Awards an anonymous praise tag to a partner's profile.
   */
  async addAccolade(
    fromUserId: string,
    targetUserId: string,
    tag: PraiseTag,
    roomId?: string
  ): Promise<{ success: boolean; message: string }> {
    if (fromUserId === targetUserId) {
      return { success: false, message: 'You cannot award accolades to yourself!' };
    }

    if (roomId) {
      const alreadyPraisedKey = `praise:${roomId}:${fromUserId}:${tag}`;
      const hasPraised = await stateStore.get(alreadyPraisedKey);
      if (hasPraised) {
        return { success: false, message: 'You have already awarded this accolade for this session!' };
      }
      await stateStore.set(alreadyPraisedKey, 'true', 86400 * 2);
    }

    const key = `user:accolades:${targetUserId}:${tag}`;
    const currentCountStr = (await stateStore.get(key)) || '0';
    const nextCount = parseInt(currentCountStr, 10) + 1;
    await stateStore.set(key, String(nextCount), 86400 * 365);

    // Increment reputation score by +5 in database (capped at 100)
    const target = await db.getUserById(targetUserId).catch(() => null);
    if (target) {
      const newScore = Math.min(100, (target.reputationScore ?? 100) + 5);
      await db.createOrUpdateUser({ discordUserId: target.discordUserId, reputationScore: newScore }).catch(() => {});
    }

    const tagMeta = PRAISE_TAG_LABELS[tag];
    return {
      success: true,
      message: `✨ Awarded **${tagMeta.emoji} ${tagMeta.label}** to your partner's verified Destiny profile!`,
    };
  }

  /**
   * Retrieves verified reputation accolades for a user.
   */
  async getAccolades(userId: string): Promise<ReputationAccolades> {
    const [gl, hl, rs, ins] = await Promise.all([
      stateStore.get(`user:accolades:${userId}:great_listener`),
      stateStore.get(`user:accolades:${userId}:hilarious`),
      stateStore.get(`user:accolades:${userId}:respectful`),
      stateStore.get(`user:accolades:${userId}:insightful`),
    ]);

    return {
      greatListener: gl ? parseInt(gl, 10) : 0,
      hilarious: hl ? parseInt(hl, 10) : 0,
      respectful: rs ? parseInt(rs, 10) : 0,
      insightful: ins ? parseInt(ins, 10) : 0,
    };
  }

  /**
   * Casts a secret second-chance reconnect vote.
   */
  async castReconnectVote(
    votingUserId: string,
    targetUserId: string,
    roomId: string
  ): Promise<{ isMutual: boolean; votingUser: UserProfile; targetUser: UserProfile } | null> {
    const votingUser = await db.getUserById(votingUserId).catch(() => null);
    const targetUser = await db.getUserById(targetUserId).catch(() => null);
    if (!votingUser || !targetUser) return null;

    await stateStore.set(`reconnect:vote:${roomId}:${votingUserId}`, 'true', 86400);

    const partnerVote = (await stateStore.get(`reconnect:vote:${roomId}:${targetUserId}`)) === 'true';
    if (partnerVote) {
      await stateStore.set(`reconnect:mutual:${roomId}`, 'true', 86400);
      return { isMutual: true, votingUser, targetUser };
    }

    return { isMutual: false, votingUser, targetUser };
  }

  /**
   * Creates the celebration card when a mutual second-chance reconnect is triggered.
   */
  createMutualReconnectContainer(partnerDestinyId: string, partnerUserId: string): ContainerBuilder {
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`destiny_friend_add_${partnerUserId}`)
        .setLabel('Add to Friends')
        .setEmoji(resolveBotEmoji('👥'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`destiny_reconnect_chat_${partnerUserId}`)
        .setLabel('Start Chat')
        .setEmoji(resolveBotEmoji('💬'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`destiny_reconnect_voice_${partnerUserId}`)
        .setLabel('Start Voice')
        .setEmoji(resolveBotEmoji('🎙️'))
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          formatCustomEmojiText(`# 🎉 It's a Mutual Match!\n\n`) +
          `Both you and **${partnerDestinyId}** voted **[Would Talk Again]**!\n\n` +
          `Destiny has confirmed your mutual connection. Choose an action below to stay in touch:\n\n` +
          `• **👥 Add to Friends:** Keep each other on your anonymous Destiny Friends list\n` +
          `• **💬 Start Chat:** Open a direct 1-on-1 private DM chat room\n` +
          `• **🎙️ Start Voice:** Spin up an ephemeral private voice call\n\n` +
          `-# Your real Discord username remains hidden unless both agreed to reveal.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(actionRow);
  }

  /**
   * Sends an anonymous Destiny friend request.
   */
  async sendFriendRequest(
    sender: UserProfile,
    targetDestinyId: string
  ): Promise<{ success: boolean; message: string; receiver?: UserProfile }> {
    if (sender.destinyId.toLowerCase() === targetDestinyId.toLowerCase()) {
      return { success: false, message: 'You cannot add yourself as a friend!' };
    }

    const receiver = await db.getUserByDestinyId(targetDestinyId).catch(() => null);
    if (!receiver) {
      return { success: false, message: `Could not find any user with Destiny ID \`${targetDestinyId}\`.` };
    }

    const isBlocked = await blockerService.isBlocked(sender.id, receiver.id);
    if (isBlocked) {
      return { success: false, message: 'Unable to send friend request to this user.' };
    }

    const alreadyFriends = await this.areFriends(sender.id, receiver.id);
    if (alreadyFriends) {
      return { success: false, message: `You and **${receiver.destinyId}** are already Destiny friends!` };
    }

    // Check pending
    const pendingSent = await stateStore.sMembers(`user:friend_requests_sent:${sender.id}`);
    if (pendingSent.includes(receiver.id)) {
      return { success: false, message: 'Friend request is already pending.' };
    }

    // Check if receiver already sent one to sender (auto-accept!)
    const incomingFromReceiver = await stateStore.sMembers(`user:friend_requests_received:${sender.id}`);
    if (incomingFromReceiver.includes(receiver.id)) {
      await this.acceptFriendRequest(sender, receiver.id);
      return {
        success: true,
        message: `🎉 **${receiver.destinyId}** also sent you a request! You are now Destiny friends!`,
        receiver,
      };
    }

    await stateStore.sAdd(`user:friend_requests_sent:${sender.id}`, receiver.id);
    await stateStore.sAdd(`user:friend_requests_received:${receiver.id}`, sender.id);

    return {
      success: true,
      message: `📩 Anonymous friend request sent to **${receiver.destinyId}**!`,
      receiver,
    };
  }

  /**
   * Accepts an incoming friend request.
   */
  async acceptFriendRequest(
    acceptingUser: UserProfile,
    senderUserId: string
  ): Promise<{ success: boolean; message: string; sender?: UserProfile }> {
    const sender = await db.getUserById(senderUserId).catch(() => null);
    if (!sender) {
      return { success: false, message: 'User profile no longer exists.' };
    }

    await stateStore.sAdd(`user:friends:${acceptingUser.id}`, sender.id);
    await stateStore.sAdd(`user:friends:${sender.id}`, acceptingUser.id);

    await stateStore.sRem(`user:friend_requests_received:${acceptingUser.id}`, sender.id);
    await stateStore.sRem(`user:friend_requests_sent:${sender.id}`, acceptingUser.id);

    const now = String(Date.now());
    await stateStore.set(`friendship:since:${acceptingUser.id}:${sender.id}`, now, 86400 * 365);
    await stateStore.set(`friendship:since:${sender.id}:${acceptingUser.id}`, now, 86400 * 365);

    return {
      success: true,
      message: `🎉 You and **${sender.destinyId}** are now Destiny friends! Use \`/friends list\` to view your friends.`,
      sender,
    };
  }

  /**
   * Declines an incoming friend request.
   */
  async declineFriendRequest(decliningUserId: string, senderUserId: string): Promise<boolean> {
    await stateStore.sRem(`user:friend_requests_received:${decliningUserId}`, senderUserId);
    await stateStore.sRem(`user:friend_requests_sent:${senderUserId}`, decliningUserId);
    return true;
  }

  /**
   * Removes a Destiny friend.
   */
  async removeFriend(userId: string, targetDestinyId: string): Promise<{ success: boolean; message: string }> {
    const target = await db.getUserByDestinyId(targetDestinyId).catch(() => null);
    if (!target) {
      return { success: false, message: `Could not find any user with Destiny ID \`${targetDestinyId}\`.` };
    }

    await stateStore.sRem(`user:friends:${userId}`, target.id);
    await stateStore.sRem(`user:friends:${target.id}`, userId);

    return {
      success: true,
      message: `Friend **${target.destinyId}** has been removed from your Destiny friends list.`,
    };
  }

  /**
   * Verifies if two users are Destiny friends.
   */
  async areFriends(user1Id: string, user2Id: string): Promise<boolean> {
    const friends = await stateStore.sMembers(`user:friends:${user1Id}`);
    return friends.includes(user2Id);
  }

  /**
   * Fetches all friends for a given user.
   */
  async getFriends(userId: string): Promise<DestinyFriend[]> {
    const friendIds = await stateStore.sMembers(`user:friends:${userId}`);
    if (friendIds.length === 0) return [];

    const result: DestinyFriend[] = [];
    for (const fid of friendIds) {
      const profile = await db.getUserById(fid).catch(() => null);
      if (profile) {
        const sinceStr = await stateStore.get(`friendship:since:${userId}:${fid}`);
        result.push({
          userId: profile.id,
          destinyId: profile.destinyId,
          discordUserId: profile.discordUserId,
          since: sinceStr ? parseInt(sinceStr, 10) : Date.now(),
        });
      }
    }
    return result;
  }

  /**
   * Sends the friend request notification DM to the receiver with Accept/Decline buttons.
   */
  async notifyFriendRequest(client: Client, sender: UserProfile, receiver: UserProfile): Promise<void> {
    try {
      const discordUser = await client.users.fetch(receiver.discordUserId).catch(() => null);
      if (!discordUser) return;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`destiny_friend_accept_${sender.id}`)
          .setLabel('Accept')
          .setEmoji(resolveBotEmoji('✅'))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`destiny_friend_decline_${sender.id}`)
          .setLabel('Decline')
          .setEmoji(resolveBotEmoji('❌'))
          .setStyle(ButtonStyle.Secondary)
      );

      const container = new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(`# 👥 New Destiny Friend Request!\n\n`) +
            `**${sender.destinyId}** has sent you an anonymous Destiny friend request!\n\n` +
            `• Interests: ${sender.interests.length > 0 ? sender.interests.join(', ') : 'Open'}\n` +
            `• Verified Accolades: View on their profile\n\n` +
            `Accepting will add each other to your private \`/friends list\` so you can start 1-on-1 chats and speed calls anytime.`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(row);

      await sendCleanDmPanel(discordUser, { components: [container], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
    } catch (e: any) {
      console.warn('[SocialManager] notifyFriendRequest error:', e?.message || e);
    }
  }

  /**
   * Starts a direct 1-on-1 private chat session between two Destiny friends or reconnected partners.
   */
  async startDirectChat(
    client: Client,
    user1: UserProfile,
    user2: UserProfile
  ): Promise<{ success: boolean; message: string }> {
    if (user1.id === user2.id) {
      return { success: false, message: 'You cannot start a chat with yourself!' };
    }

    const isBlocked = await blockerService.isBlocked(user1.id, user2.id);
    if (isBlocked) {
      return { success: false, message: 'Unable to start a chat with this user.' };
    }

    const [active1, active2] = await Promise.all([
      stateStore.get(`user:active_room:${user1.id}`),
      stateStore.get(`user:active_room:${user2.id}`),
    ]);
    if (active1) {
      return { success: false, message: 'You are already in an active room! End your current session first with `/cancel match`.' };
    }
    if (active2) {
      return { success: false, message: `**${user2.destinyId}** is currently in another room. Please try again later!` };
    }

    const roomCode = anonymizer.generateRoomCode();
    const personaA = anonymizer.generatePersona(user1.id, roomCode);
    const personaB = anonymizer.generatePersona(user2.id, roomCode);

    const room = await db.createRoom({
      roomCode,
      user1Id: user1.id,
      user2Id: user2.id,
      user1DiscordId: user1.discordUserId,
      user2DiscordId: user2.discordUserId,
      user1Pseudonym: user1.destinyId,
      user2Pseudonym: user2.destinyId,
      user1Avatar: personaA.avatarEmoji,
      user2Avatar: personaB.avatarEmoji,
      status: 'active',
      startedAt: new Date().toISOString(),
      revealStatusUser1: { consented: false, revealedFields: [] },
      revealStatusUser2: { consented: false, revealedFields: [] },
    });

    await Promise.all([
      stateStore.set(`user:active_room:${user1.id}`, room.id, 86400),
      stateStore.set(`user:active_room:${user2.id}`, room.id, 86400),
    ]);

    const createDirectCard = (partnerDestinyId: string) =>
      new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(
              `# 💬 Private Chat Connected with **${partnerDestinyId}**!\n\n` +
              `You are now connected in a private 1-on-1 direct chat.\n` +
              `Simply type any message directly in this DM to chat anonymously!\n\n` +
              `-# 🔒 Safe & Anonymous • Use /cancel match or the Leave button below to exit anytime.`
            )
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('destiny_btn_leave')
              .setLabel('Leave Chat')
              .setEmoji(resolveBotEmoji('🚪'))
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`btn_report_room_${room.id}`)
              .setLabel('Report User')
              .setEmoji(resolveBotEmoji('🚨'))
              .setStyle(ButtonStyle.Danger)
          )
        );

    const discordUser1 = await client.users.fetch(user1.discordUserId).catch(() => null);
    const discordUser2 = await client.users.fetch(user2.discordUserId).catch(() => null);

    if (discordUser1) {
      await sendCleanDmPanel(discordUser1, {
        components: [createDirectCard(user2.destinyId)],
        flags: [MessageFlags.IsComponentsV2],
      }).catch(() => {});
    }

    if (discordUser2) {
      await sendCleanDmPanel(discordUser2, {
        components: [createDirectCard(user1.destinyId)],
        flags: [MessageFlags.IsComponentsV2],
      }).catch(() => {});
    }

    return { success: true, message: `💬 Direct chat opened with **${user2.destinyId}**! Check your DMs.` };
  }

  /**
   * Starts an ephemeral private speed voice call between two Destiny friends or reconnected partners.
   */
  async startDirectCall(
    client: Client,
    user1: UserProfile,
    user2: UserProfile
  ): Promise<{ success: boolean; message: string }> {
    if (user1.id === user2.id) {
      return { success: false, message: 'You cannot start a call with yourself!' };
    }

    const isBlocked = await blockerService.isBlocked(user1.id, user2.id);
    if (isBlocked) {
      return { success: false, message: 'Unable to start a call with this user.' };
    }

    const [active1, active2] = await Promise.all([
      stateStore.get(`user:active_room:${user1.id}`),
      stateStore.get(`user:active_room:${user2.id}`),
    ]);
    if (active1) {
      return { success: false, message: 'You are already in an active room! End your current session first with `/cancel match`.' };
    }
    if (active2) {
      return { success: false, message: `**${user2.destinyId}** is currently in another session. Please try again later!` };
    }

    const vcResult = await voiceManager.createVoiceMatchRoom(client, user1, user2);
    if (!vcResult) {
      return { success: false, message: 'Could not create a voice room at this moment. Please try again shortly!' };
    }

    const { ECLAIRS_INVITE_URL } = await import('../moderation/reputation.js');
    const vcNotice = (partnerDestinyId: string) =>
      new ContainerBuilder()
        .setAccentColor(COLORS.DESTINY_PURPLE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(
              `# 🎙️ Speed Voice Call Ready!\n\n` +
              `Your private call with **${partnerDestinyId}** has been prepared!\n\n` +
              `• ⏱️ **Duration:** \`${vcResult.durationMins} Minutes\` (timer starts when both connect)\n` +
              `• 🏰 **Host Server:** ${vcResult.isEclairsFallback ? '🌟 Official Eclairs Hub (`discord.gg/eclairs`)' : `🏰 **${vcResult.guild.name}**`}\n` +
              `• 🔊 **Voice Channel:** <#${vcResult.channel.id}>\n\n` +
              (vcResult.isEclairsFallback
                ? `> ⚠️ **First Time in Eclairs?** Click **[🏰 Join Eclairs Hub]** first so Discord lets you connect to the voice channel!\n\n`
                : '') +
              `Click **🎙️ Join Voice Channel** below to enter your private room!\n\n` +
              `-# 🔒 2-person ephemeral room • Interactive dashboard with Icebreakers, +5m Extend & Reveal inside.`
            )
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('🎙️ Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${vcResult.guild.id}/${vcResult.channel.id}`),
            ...(vcResult.isEclairsFallback
              ? [
                  new ButtonBuilder()
                    .setLabel('🏰 Join Eclairs Hub')
                    .setStyle(ButtonStyle.Link)
                    .setURL(ECLAIRS_INVITE_URL),
                ]
              : [])
          )
        );

    const discordUser1 = await client.users.fetch(user1.discordUserId).catch(() => null);
    const discordUser2 = await client.users.fetch(user2.discordUserId).catch(() => null);

    if (discordUser1) {
      await sendCleanDmPanel(discordUser1, {
        components: [vcNotice(user2.destinyId)],
        flags: [MessageFlags.IsComponentsV2],
      }).catch(() => {});
    }

    if (discordUser2) {
      await sendCleanDmPanel(discordUser2, {
        components: [vcNotice(user1.destinyId)],
        flags: [MessageFlags.IsComponentsV2],
      }).catch(() => {});
    }

    return { success: true, message: `🎙️ Speed voice call spawned with **${user2.destinyId}**! Check your DMs.` };
  }
}

export const socialManager = new SocialManager();
