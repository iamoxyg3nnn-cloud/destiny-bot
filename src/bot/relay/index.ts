import { Client, Message, MessageFlags, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { sanitizer } from '../../core/sanitizer.js';
import { embedService, COLORS } from '../embeds/index.js';
import { progressionService } from '../../core/progression/levels.js';
import { lockManager } from '../../redis/locks.js';
import { RoomSession, UserProfile } from '../../core/types.js';

export class MessageRelayService {
  /**
   * Process incoming Discord message from DM or designated room channel
   */
  async handleIncomingMessage(client: Client, message: Message): Promise<boolean> {
    // Ignore bot messages
    if (message.author.bot) return false;

    // We focus on private DM conversations or designated thread channels
    if (message.guild !== null) return false;

    const authorDiscordId = message.author.id;
    const authorUser = await db.getUserByDiscordId(authorDiscordId, true);
    if (!authorUser) return false;

    const activeRoomId = authorUser.activeRoomId ||
      (await redis.get(`user:active_room:${authorUser.id}`)) || undefined;
    if (!activeRoomId) return false;

    const room = await db.getRoomById(activeRoomId);
    if (!room || room.status !== 'active') return false;
    if (authorUser.activeRoomId !== room.id) {
      console.warn('[Relay] Refusing message because the sender no longer points to this active room.');
      return false;
    }
    if (room.user1Id !== authorUser.id && room.user2Id !== authorUser.id) {
      console.warn('[Relay] Refusing message from a user who is not a room participant.');
      return false;
    }

    // Serialize delivery/persistence with every room-ending path. Re-read both
    // rows after acquiring the lock so a stale pre-lock snapshot cannot relay
    // after a leave, moderation action, or inactivity close.
    return await lockManager.withLock(`lock:room:${room.id}`, async () => {
      const latestUser = await db.getUserById(authorUser.id, true);
      const latestRoom = await db.getRoomById(room.id);
      if (
        !latestUser ||
        !latestRoom ||
        latestRoom.status !== 'active' ||
        latestUser.activeRoomId !== latestRoom.id ||
        (latestRoom.user1Id !== latestUser.id && latestRoom.user2Id !== latestUser.id)
      ) {
        return false;
      }

      const partnerId = latestRoom.user1Id === latestUser.id
        ? latestRoom.user2Id
        : latestRoom.user1Id;
      const partner = await db.getUserById(partnerId, true);
      if (!partner || latestUser.isBanned || partner.isBanned) {
        console.warn(`[Relay] Refusing message in room ${latestRoom.id}: a participant is missing or moderation-restricted.`);
        return false;
      }

      return this.deliverToRoom(client, message, latestUser, latestRoom);
    });
  }

  private async deliverToRoom(
    client: Client,
    message: Message,
    authorUser: UserProfile,
    room: RoomSession
  ): Promise<boolean> {
    // Rate limit check: max 5 messages per 3s
    const rateLimit = await redis.checkRateLimit(`relay:${authorUser.id}`, 5, 3);
    if (!rateLimit.allowed) {
      await message.reply('⚠️ Slow down! You are sending messages too quickly.');
      return true;
    }

    // Determine sender vs recipient
    const isUser1 = room.user1Id === authorUser.id;
    const senderPseudonym = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;
    const senderAvatar = isUser1 ? room.user1Avatar : room.user2Avatar;
    let recipientDiscordId = isUser1 ? room.user2DiscordId : room.user1DiscordId;

    if (!recipientDiscordId) {
      const recipientUser = await db.getUserById(isUser1 ? room.user2Id : room.user1Id);
      if (recipientUser) {
        recipientDiscordId = recipientUser.discordUserId;
      }
    }

    if (!recipientDiscordId) {
      await message.reply('⚠️ Could not locate recipient for this chat room.').catch(() => {});
      return false;
    }

    // 1. Sanitize text content
    const sanitized = sanitizer.sanitize(message.content);
    if (!sanitized.sanitizedText && message.attachments.size === 0) {
      await message.reply('⚠️ Message cannot be empty or only contain disallowed content.');
      return true;
    }

    // 2. Sanitize attachments
    const rawAttachments = Array.from(message.attachments.values()).map((a) => ({
      url: a.url,
      name: a.name,
      size: a.size,
      contentType: a.contentType || undefined,
    }));
    const cleanAttachments = sanitizer.sanitizeAttachments(rawAttachments);
    if (!sanitized.sanitizedText && cleanAttachments.length === 0) {
      await message.reply('⚠️ Your message contained no text or supported attachments. Allowed files: images, video, audio and PDF up to 10 MB.');
      return true;
    }

    // 5. Deliver to recipient Discord DM
    try {
      let recipientUser = client.users.cache.get(recipientDiscordId);
      if (!recipientUser) {
        recipientUser = await client.users.fetch(recipientDiscordId);
      }

      const relayContainer = embedService.createRelayMessageContainer(
        senderPseudonym,
        senderAvatar,
        sanitized.sanitizedText
      );

      if (cleanAttachments.length > 0) {
        const files = cleanAttachments.map((a) => new AttachmentBuilder(a.url, { name: a.name || 'attachment' }));
        const relayEmbed = embedService.createRelayMessageEmbed(
          senderPseudonym,
          senderAvatar,
          sanitized.sanitizedText
        );
        await recipientUser.send({
          embeds: [relayEmbed],
          files,
        });
      } else {
        await recipientUser.send({
          components: [relayContainer],
          flags: [MessageFlags.IsComponentsV2],
        });
      }

    // Persist only after Discord accepts delivery so history and XP do not
    // claim a message was delivered when the recipient's DMs are closed.
    try {
      await db.saveMessage({
        roomId: room.id,
        senderUserId: authorUser.id,
        senderPseudonym,
        sanitizedContent: sanitized.sanitizedText,
        attachmentsMeta: cleanAttachments,
        isPinned: false,
        flaggedForModeration: !sanitized.isClean,
        moderationReason: sanitized.violations.join(', ') || undefined,
      });
    } catch (error) {
      console.error('[Relay] Message was delivered but could not be persisted:', error);
      await message.reply('⚠️ Your message was delivered, but chat history could not be saved. Please try again later.').catch(() => {});
      return true;
    }

    // Advance room inactivity tracking even when the separate XP/reward path
    // fails. Cleanup must never end a conversation because an XP RPC failed.
    try {
      const touched = await db.touchRoomActivity(room.id);
      if (!touched) console.warn(`[Relay] Room ${room.id} was no longer active after message persistence.`);
    } catch (activityError) {
      console.error('[Relay] Could not update room activity timestamp:', activityError);
    }

    // Award connection XP after the message has been delivered and recorded.
    try {
      const prevLevel = room.connectionLevel;
      const { newXp, level: currentLevel } = await db.updateRoomXP(room.id, 2);
      if (currentLevel !== prevLevel) {
        room.connectionLevel = currentLevel;
        const partnerUserId = isUser1 ? room.user2Id : room.user1Id;
        const ref1 = `levelup:${room.id}:${currentLevel}:${authorUser.id}`;
        const ref2 = `levelup:${room.id}:${currentLevel}:${partnerUserId}`;
        const rewards = await Promise.all([
          db.executeCoinTransaction(authorUser.id, 25, 'room_milestone', ref1, { level: currentLevel, roomId: room.id }),
          db.executeCoinTransaction(partnerUserId, 25, 'room_milestone', ref2, { level: currentLevel, roomId: room.id }),
        ]);
        const rewardsGranted = rewards.every((reward) => reward.success);
        if (!rewardsGranted) console.error('[Relay] One or more connection milestone rewards failed:', rewards);

        const tierData = progressionService.getTierFromXp(newXp);
        const levelUpEmbed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle(`🎉 Connection Evolved: ${currentLevel.toUpperCase()}!`)
          .setDescription(
            `Your conversation has evolved to **${currentLevel}** (${newXp} XP)!\n\n` +
            (rewardsGranted ? '✨ **+25 Destiny Coins** granted to both of you!\n' : '⚠️ Your milestone reward is being checked by the system.\n') +
            `🔓 **Unlocked Perks**: ${tierData.perks.join(', ')}`
          )
          .setFooter({ text: 'Keep chatting to unlock higher tiers & deeper reveals!' });

        await message.author.send({ embeds: [levelUpEmbed] }).catch(() => {});
        await client.users.fetch(recipientDiscordId).then((u) => u.send({ embeds: [levelUpEmbed] })).catch(() => {});
      }
    } catch (error) {
      console.error('[Relay] Connection XP update failed:', error);
    }

      // Acknowledge reaction on original message
      await message.react('✨').catch(() => {});
      return true;
    } catch (err: any) {
      console.warn(`[Relay] DM delivery failed to user ${recipientDiscordId}:`, err?.message);
      await message.reply(
        '⚠️ Delivery failed: Your chat partner’s direct messages are closed or restricted. They may need to enable DMs to continue chatting.'
      ).catch(() => {});
      return false;
    }
  }
}

export const messageRelayService = new MessageRelayService();
