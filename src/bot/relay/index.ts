import { Client, Message, MessageFlags, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { sanitizer } from '../../core/sanitizer.js';
import { embedService, COLORS } from '../embeds/index.js';
import { progressionService } from '../../core/progression/levels.js';

export class MessageRelayService {
  /**
   * Process incoming Discord message from DM or designated room channel
   */
  async handleIncomingMessage(client: Client, message: Message): Promise<boolean> {
    // Ignore bot messages
    if (message.author.bot) return false;

    // We focus on private DM conversations or dedicated thread channels
    if (message.guild !== null) return false;

    const authorDiscordId = message.author.id;
    const authorUser = await db.getUserByDiscordId(authorDiscordId, true);
    if (!authorUser) return false;

    let activeRoomId = authorUser.activeRoomId;
    if (!activeRoomId) {
      activeRoomId = (await redis.get(`user:active_room:${authorUser.id}`)) || undefined;
    }
    if (!activeRoomId) return false;

    const room = await db.getRoomById(activeRoomId);
    if (!room || room.status !== 'active') return false;

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

    // 3. Save message record in Supabase
    const savedMsg = await db.saveMessage({
      roomId: room.id,
      senderUserId: authorUser.id,
      senderPseudonym,
      sanitizedContent: sanitized.sanitizedText,
      attachmentsMeta: cleanAttachments,
      isPinned: false,
      flaggedForModeration: !sanitized.isClean,
      moderationReason: sanitized.violations.join(', ') || undefined,
    });

    // 4. Update room connection XP and check for Tier Level-Up
    const prevLevel = room.connectionLevel;
    const { newXp, level: currentLevel } = await db.updateRoomXP(room.id, 2);

    if (currentLevel !== prevLevel) {
      room.connectionLevel = currentLevel;
      // Award 25 DC milestone bonus to both participants
      const partnerUserId = isUser1 ? room.user2Id : room.user1Id;
      const ref1 = `levelup:${room.id}:${currentLevel}:${authorUser.id}`;
      const ref2 = `levelup:${room.id}:${currentLevel}:${partnerUserId}`;
      Promise.all([
        db.executeCoinTransaction(authorUser.id, 25, 'room_milestone', ref1, { level: currentLevel, roomId: room.id }),
        db.executeCoinTransaction(partnerUserId, 25, 'room_milestone', ref2, { level: currentLevel, roomId: room.id }),
      ]).catch(() => {});

      const tierData = progressionService.getTierFromXp(newXp);
      const levelUpEmbed = new EmbedBuilder()
        .setColor(COLORS.GOLD)
        .setTitle(`🎉 Connection Evolved: ${currentLevel.toUpperCase()}!`)
        .setDescription(
          `Your conversation has evolved to **${currentLevel}** (${newXp} XP)!\n\n` +
          `✨ **+25 Destiny Coins** granted to both of you!\n` +
          `🔓 **Unlocked Perks**: ${tierData.perks.join(', ')}`
        )
        .setFooter({ text: 'Keep chatting to unlock higher tiers & deeper reveals!' });

      message.author.send({ embeds: [levelUpEmbed] }).catch(() => {});
      client.users.fetch(recipientDiscordId).then((u) => u.send({ embeds: [levelUpEmbed] })).catch(() => {});
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
