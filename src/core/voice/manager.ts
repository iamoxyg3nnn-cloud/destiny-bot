import { 
  Client, 
  Guild, 
  VoiceChannel, 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SeparatorBuilder, 
  MessageFlags,
  VoiceState
} from 'discord.js';
import { UserProfile } from '../types.js';
import { stateStore } from '../../storage/state-store.js';
import { db } from '../../database/supabase.js';
import { ECLAIRS_GUILD_IDS, ECLAIRS_GUILD_ID, ECLAIRS_INVITE_URL } from '../moderation/reputation.js';
import { formatCustomEmojiText } from '../../bot/custom-emojis.js';
import { COLORS } from '../../bot/embeds/index.js';
import { blockerService } from '../moderation/blocker.js';

export const ICEBREAKER_TOPICS = [
  "What's an unpopular opinion you will defend to the death?",
  "If you could wake up tomorrow as a master of any skill, what would it be?",
  "What is the most ridiculous rabbit hole you've fallen down on YouTube or Wikipedia?",
  "What's the best concert, festival, or trip you've ever experienced?",
  "Are you more of an over-thinker or an impulsive decision-maker?",
  "If you were given $50,000 to spend in 24 hours with no investments allowed, what would you do?",
  "What was your absolute favorite childhood movie or video game?",
  "What is a small, everyday thing that never fails to put you in a good mood?",
  "What's the weirdest food combination you genuinely enjoy?",
  "If you could have dinner with any historical figure, who would it be and why?",
  "What's a piece of advice you received that actually changed how you think?",
  "Are you an early bird, a night owl, or an exhausted pigeon?",
  "What's a book, show, or game that you wish you could experience for the first time again?",
  "If you had to live in another decade or era, which one would you pick?",
  "What is your go-to comfort meal when having a rough day?"
];

export function getRandomIcebreakerTopic(): string {
  const index = Math.floor(Math.random() * ICEBREAKER_TOPICS.length);
  return ICEBREAKER_TOPICS[index];
}

export function createVoiceDashboardContainer(
  user1Handle: string,
  user2Handle: string,
  durationMins: number = 5,
  isEclairsFallback: boolean = false,
  guildName: string = 'Destiny Voice'
): ContainerBuilder {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('destiny_vc_icebreaker')
      .setLabel('🎲 Icebreaker')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('destiny_vc_extend')
      .setLabel('⏳ Extend +5m')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('destiny_vc_reveal')
      .setLabel('🎭 Reveal Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('destiny_vc_leave')
      .setLabel('🚨 Leave & Block')
      .setStyle(ButtonStyle.Danger)
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.DESTINY_PURPLE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        formatCustomEmojiText(`# 🎙️ Blind Speed Voice Session\n\n`) +
        `Welcome **${user1Handle}** and **${user2Handle}**!\n` +
        `• **Session Timer:** ⏱️ **${durationMins}:00 Minutes** (starts once both connect)\n` +
        `• **Host Server:** ${isEclairsFallback ? '🌟 Official Eclairs Hub (`discord.gg/eclairs`)' : `🏰 **${guildName}**`}\n\n` +
        `### 📋 Session Rules & Controls\n` +
        `1. **Be Respectful:** Zero tolerance for toxicity, ear-rape, or harassment.\n` +
        `2. **Stay Anonymous or Reveal:** Use **[🎭 Reveal Profile]** if both agree to share real Discord tags.\n` +
        `3. **Need More Time?** Click **[⏳ Extend +5m]** at any point before time expires.\n` +
        `4. **Safety Panic Button:** Click **[🚨 Leave & Block]** to instantly end the call and delete the room.\n\n` +
        `-# Ephemeral Voice Channel • Automatically deleted when both leave.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(row);
}

export class VoiceManager {
  /**
   * Resolves whether to spawn in the local community server or fall back to Eclairs.
   */
  async resolveVoiceGuild(
    client: Client,
    preferredGuildId?: string,
    user1DiscordId?: string,
    user2DiscordId?: string
  ): Promise<{ guild: Guild; categoryId?: string | null; isEclairsFallback: boolean; durationMins: number } | null> {
    // 1. Try local server if specified and both users are members
    if (preferredGuildId) {
      const isVoiceEnabled = (await stateStore.get(`guild:${preferredGuildId}:voice_enabled`)) === 'true';
      const categoryId = await stateStore.get(`guild:${preferredGuildId}:voice_category_id`);
      const durationMinsStr = await stateStore.get(`guild:${preferredGuildId}:voice_duration_minutes`);
      const durationMins = durationMinsStr ? parseInt(durationMinsStr, 10) : 5;

      const localGuild = client.guilds.cache.get(preferredGuildId);
      if (
        isVoiceEnabled &&
        localGuild &&
        (localGuild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels) ||
         localGuild.members.me?.permissions.has(PermissionFlagsBits.Administrator))
      ) {
        if (user1DiscordId && user2DiscordId) {
          const m1 = await localGuild.members.fetch(user1DiscordId).catch(() => null);
          const m2 = await localGuild.members.fetch(user2DiscordId).catch(() => null);
          if (m1 && m2) {
            return {
              guild: localGuild,
              categoryId,
              isEclairsFallback: false,
              durationMins: Number.isFinite(durationMins) && durationMins > 0 ? durationMins : 5,
            };
          }
        }
      }
    }

    // 2. Fallback to Eclairs Central Hub
    for (const gid of ECLAIRS_GUILD_IDS) {
      let g = client.guilds.cache.get(gid);
      if (!g) {
        g = (await client.guilds.fetch(gid).catch(() => null)) as Guild | undefined;
      }
      if (
        g &&
        (g.members.me?.permissions.has(PermissionFlagsBits.ManageChannels) ||
         g.members.me?.permissions.has(PermissionFlagsBits.Administrator))
      ) {
        const cat = g.channels.cache.find(
          (c) =>
            c.type === ChannelType.GuildCategory &&
            (c.name.toLowerCase().includes('voice') ||
             c.name.toLowerCase().includes('vc') ||
             c.name.toLowerCase().includes('private'))
        );
        return {
          guild: g,
          categoryId: cat?.id || null,
          isEclairsFallback: true,
          durationMins: 5,
        };
      }
    }

    return null;
  }

  /**
   * Creates an ephemeral private voice room for the matched pair.
   */
  async createVoiceMatchRoom(
    client: Client,
    user1: UserProfile,
    user2: UserProfile,
    preferredGuildId?: string
  ): Promise<{ channel: VoiceChannel; guild: Guild; isEclairsFallback: boolean; durationMins: number; roomId: string } | null> {
    const resolved = await this.resolveVoiceGuild(client, preferredGuildId, user1.discordUserId, user2.discordUserId);
    if (!resolved) {
      console.error('[VoiceManager] Could not resolve voice guild for users:', user1.discordUserId, user2.discordUserId);
      return null;
    }

    const { guild, categoryId, isEclairsFallback, durationMins } = resolved;
    const roomId = `vroom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    const channel = await guild.channels.create({
      name: `🪐・destiny-${roomCode}`,
      type: ChannelType.GuildVoice,
      parent: categoryId || undefined,
      userLimit: 2,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        {
          id: client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: user1.discordUserId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: user2.discordUserId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    const dashboard = createVoiceDashboardContainer(
      user1.destinyId,
      user2.destinyId,
      durationMins,
      isEclairsFallback,
      guild.name
    );

    await channel.send({
      components: [dashboard],
      flags: [MessageFlags.IsComponentsV2],
    }).catch(console.error);

    await stateStore.set(`voice:room:${roomId}:channel_id`, channel.id, 86400);
    await stateStore.set(`voice:room:${roomId}:guild_id`, guild.id, 86400);
    await stateStore.set(`voice:room:${roomId}:user1`, user1.discordUserId, 86400);
    await stateStore.set(`voice:room:${roomId}:user2`, user2.discordUserId, 86400);
    await stateStore.set(`voice:room:${roomId}:destiny1`, user1.destinyId, 86400);
    await stateStore.set(`voice:room:${roomId}:destiny2`, user2.destinyId, 86400);
    await stateStore.set(`voice:room:${roomId}:created_at`, String(Date.now()), 86400);
    await stateStore.set(`voice:room:${roomId}:duration_minutes`, String(durationMins), 86400);
    await stateStore.set(`voice:channel:${channel.id}:room_id`, roomId, 86400);

    return { channel, guild, isEclairsFallback, durationMins, roomId };
  }

  /**
   * Tracks user joins & leaves inside Destiny voice pods.
   */
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const channelId = newState.channelId || oldState.channelId;
    if (!channelId) return;

    const roomId = await stateStore.get(`voice:channel:${channelId}:room_id`);
    if (!roomId) return;

    const channel = (newState.channel || oldState.channel) as VoiceChannel | null;
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    const connectedNonBots = channel.members.filter((m) => !m.user.bot).size;

    // Both connected -> start the timer!
    if (connectedNonBots >= 2) {
      const startedAt = await stateStore.get(`voice:room:${roomId}:started_at`);
      if (!startedAt) {
        const now = Date.now();
        const durationMinsStr = await stateStore.get(`voice:room:${roomId}:duration_minutes`);
        const durationMins = durationMinsStr ? parseInt(durationMinsStr, 10) : 5;
        await stateStore.set(`voice:room:${roomId}:started_at`, String(now), 86400);
        await stateStore.set(`voice:room:${roomId}:expires_at`, String(now + durationMins * 60 * 1000), 86400);

        await channel.send({
          content: formatCustomEmojiText(
            `🎉 **Both partners connected!** Your **${durationMins}-minute** speed voice call has officially started. Enjoy your conversation!`
          ),
        }).catch(() => {});
      }
    }

    // Both left -> schedule cleanup in 30 seconds!
    if (connectedNonBots === 0) {
      setTimeout(async () => {
        try {
          const freshChannel = channel.guild.channels.cache.get(channel.id) as VoiceChannel | undefined;
          if (freshChannel && freshChannel.members.filter((m) => !m.user.bot).size === 0) {
            await this.deleteVoiceRoom(channel.client, roomId, channel.id);
          }
        } catch {}
      }, 30_000);
    }
  }

  /**
   * Extends the voice call duration by 5 minutes upon mutual agreement.
   */
  async handleExtendVoiceCall(
    client: Client,
    channelId: string,
    votingUserId: string
  ): Promise<{ success: boolean; message: string }> {
    const roomId = await stateStore.get(`voice:channel:${channelId}:room_id`);
    if (!roomId) return { success: false, message: 'Voice room not found.' };

    const u1 = await stateStore.get(`voice:room:${roomId}:user1`);
    const u2 = await stateStore.get(`voice:room:${roomId}:user2`);
    if (votingUserId !== u1 && votingUserId !== u2) {
      return { success: false, message: 'You are not a participant in this voice session.' };
    }

    await stateStore.set(`voice:room:${roomId}:extend:${votingUserId}`, 'true', 86400);

    const u1Ext = (await stateStore.get(`voice:room:${roomId}:extend:${u1}`)) === 'true';
    const u2Ext = (await stateStore.get(`voice:room:${roomId}:extend:${u2}`)) === 'true';

    if (u1Ext && u2Ext) {
      const expiresAtStr = await stateStore.get(`voice:room:${roomId}:expires_at`);
      const currentExpiry = expiresAtStr ? parseInt(expiresAtStr, 10) : Date.now();
      const newExpiry = Math.max(currentExpiry, Date.now()) + 5 * 60 * 1000;
      await stateStore.set(`voice:room:${roomId}:expires_at`, String(newExpiry), 86400);

      // Reset votes for potential further extensions
      await stateStore.del(`voice:room:${roomId}:extend:${u1}`);
      await stateStore.del(`voice:room:${roomId}:extend:${u2}`);

      const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (channel && channel.isTextBased()) {
        await channel.send({
          content: formatCustomEmojiText(`⏳ **Both partners agreed! +5 Minutes added to your voice session.**`),
        }).catch(() => {});
      }
      return { success: true, message: 'Both partners agreed! 5 minutes added.' };
    }

    const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel && channel.isTextBased()) {
      await channel.send({
        content: formatCustomEmojiText(`⏳ A partner voted to extend. Waiting for the other partner to click **[Extend +5m]**...`),
      }).catch(() => {});
    }

    return { success: true, message: 'Extension vote registered. Waiting for partner.' };
  }

  /**
   * Handles mutual profile reveal in a voice session.
   */
  async handleRevealVoiceCall(
    client: Client,
    channelId: string,
    votingUserId: string
  ): Promise<{ success: boolean; message: string }> {
    const roomId = await stateStore.get(`voice:channel:${channelId}:room_id`);
    if (!roomId) return { success: false, message: 'Voice room not found.' };

    const u1 = await stateStore.get(`voice:room:${roomId}:user1`);
    const u2 = await stateStore.get(`voice:room:${roomId}:user2`);
    const destiny1 = (await stateStore.get(`voice:room:${roomId}:destiny1`)) || 'destiny#0001';
    const destiny2 = (await stateStore.get(`voice:room:${roomId}:destiny2`)) || 'destiny#0002';

    if (votingUserId !== u1 && votingUserId !== u2) {
      return { success: false, message: 'You are not a participant in this voice session.' };
    }

    await stateStore.set(`voice:room:${roomId}:reveal:${votingUserId}`, 'true', 86400);

    const u1Rev = (await stateStore.get(`voice:room:${roomId}:reveal:${u1}`)) === 'true';
    const u2Rev = (await stateStore.get(`voice:room:${roomId}:reveal:${u2}`)) === 'true';

    if (u1Rev && u2Rev) {
      const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (channel && channel.isTextBased()) {
        await channel.send({
          content: formatCustomEmojiText(
            `# 🎭 Mutual Profile Reveal Confirmed!\n\n` +
            `Both partners have consented to reveal their identities:\n` +
            `• **${destiny1}** is <@${u1}>\n` +
            `• **${destiny2}** is <@${u2}>\n\n` +
            `*You may now add each other as Discord friends!*`
          ),
        }).catch(() => {});
      }
      return { success: true, message: 'Profiles revealed to both users.' };
    }

    const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel && channel.isTextBased()) {
      await channel.send({
        content: formatCustomEmojiText(`🎭 A partner requested a mutual identity reveal. Waiting for the other partner to click **[Reveal Profile]**...`),
      }).catch(() => {});
    }

    return { success: true, message: 'Reveal request submitted. Waiting for partner.' };
  }

  /**
   * Emergency panic exit: disconnects both members, deletes room, blocks partner.
   */
  async handleEmergencyLeave(
    client: Client,
    channelId: string,
    reportingUserId: string
  ): Promise<{ success: boolean; message: string }> {
    const roomId = await stateStore.get(`voice:channel:${channelId}:room_id`);
    if (!roomId) return { success: false, message: 'Voice room not found.' };

    const u1 = await stateStore.get(`voice:room:${roomId}:user1`);
    const u2 = await stateStore.get(`voice:room:${roomId}:user2`);
    const targetUserId = reportingUserId === u1 ? u2 : u1;

    if (targetUserId) {
      const reportingProfile = await db.getUserByDiscordId(reportingUserId);
      const targetProfile = await db.getUserByDiscordId(targetUserId);
      if (reportingProfile && targetProfile) {
        await blockerService.blockUser(reportingProfile.id, targetProfile.id).catch(() => {});
      }
    }

    await this.deleteVoiceRoom(client, roomId, channelId);

    return {
      success: true,
      message: '🚨 Voice session terminated immediately. Your partner has been blocked and the channel deleted.',
    };
  }

  /**
   * Deletes a voice room and cleans up associated runtime state.
   */
  async deleteVoiceRoom(client: Client, roomId: string, channelId: string): Promise<void> {
    try {
      const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (channel) {
        for (const member of channel.members.values()) {
          await member.voice?.disconnect('Destiny voice session concluded').catch(() => {});
        }
        await channel.delete('Destiny voice session concluded').catch(() => {});
      }
    } catch (e: any) {
      console.warn('[VoiceManager] deleteVoiceRoom error:', e?.message || e);
    } finally {
      await stateStore.del(`voice:room:${roomId}:channel_id`);
      await stateStore.del(`voice:room:${roomId}:guild_id`);
      await stateStore.del(`voice:room:${roomId}:user1`);
      await stateStore.del(`voice:room:${roomId}:user2`);
      await stateStore.del(`voice:room:${roomId}:destiny1`);
      await stateStore.del(`voice:room:${roomId}:destiny2`);
      await stateStore.del(`voice:room:${roomId}:created_at`);
      await stateStore.del(`voice:room:${roomId}:started_at`);
      await stateStore.del(`voice:room:${roomId}:expires_at`);
      await stateStore.del(`voice:room:${roomId}:duration_minutes`);
      await stateStore.del(`voice:channel:${channelId}:room_id`);
    }
  }
}

export const voiceManager = new VoiceManager();
