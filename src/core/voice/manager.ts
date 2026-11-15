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
import { ECLAIRS_GUILD_IDS, ECLAIRS_INVITE_URL } from '../moderation/reputation.js';
import { formatCustomEmojiText, resolveBotEmoji } from '../../bot/custom-emojis.js';
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

export const MAX_VOICE_EXTENSIONS = 3; // Maximum 3 extensions (+15 mins) to prevent channel hoarding

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
      .setLabel('Icebreaker')
      .setEmoji(resolveBotEmoji('🎲'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('destiny_vc_extend')
      .setLabel('Extend +5m')
      .setEmoji(resolveBotEmoji('⏳'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('destiny_vc_reveal')
      .setLabel('Reveal Profile')
      .setEmoji(resolveBotEmoji('🎭'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('destiny_vc_leave')
      .setLabel('Leave & Block')
      .setEmoji(resolveBotEmoji('🚨'))
      .setStyle(ButtonStyle.Danger)
  );

  const durationStr = `${String(durationMins).padStart(2, '0')}:00`;

  return new ContainerBuilder()
    .setAccentColor(COLORS.DESTINY_PURPLE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        formatCustomEmojiText(`# 🎙️ Blind Speed Voice Session\n\n`) +
        `**Matched Pair:** \`${user1Handle}\` ⟷ \`${user2Handle}\`\n\n` +
        `⏱️ **Session Duration:** \`${durationMins}m\` ┃ 🏰 **Host:** ${isEclairsFallback ? '🌟 Eclairs Hub' : `🏰 **${guildName}**`} ┃ 👥 **Limit:** 2\n\n` +
        `\`00:00 ━━━━🔘──────── ${durationStr}\`\n\n` +
        `### 📋 Session Rules & Controls\n` +
        `• **🎲 Icebreaker**: Get an instant question to start the conversation\n` +
        `• **⏳ Extend**: Mutual vote to add +5 minutes to this call (max 3 times)\n` +
        `• **🎭 Reveal**: Mutual agreement to exchange real Discord tags\n` +
        `• **🚨 Leave & Block**: Instant panic exit — kicks partner & blocks them permanently\n\n` +
        `-# 🔒 Ephemeral Voice Channel • Automatically deleted when both leave or time expires.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(row);
}

export class VoiceManager {
  private singleDisconnectTimers = new Map<string, NodeJS.Timeout>();

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
            // Validate category permission if specified
            let validCatId = categoryId;
            if (categoryId && localGuild.channels?.cache) {
              const catChan = localGuild.channels.cache.get(categoryId);
              if (!catChan || catChan.type !== ChannelType.GuildCategory) {
                validCatId = null;
              }
            }
            return {
              guild: localGuild,
              categoryId: validCatId,
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
    try {
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
      await stateStore.set(`voice:room:${roomId}:extensions`, '0', 86400);
      await stateStore.set(`voice:channel:${channel.id}:room_id`, roomId, 86400);

      // Track active voice sessions for both users
      await stateStore.set(`user:active_voice_room:${user1.id}`, roomId, 86400);
      await stateStore.set(`user:active_voice_room:${user2.id}`, roomId, 86400);
      await stateStore.set(`user:active_room:${user1.id}`, roomId, 86400);
      await stateStore.set(`user:active_room:${user2.id}`, roomId, 86400);

      // 3-Minute Abandonment Sweeper: auto-deletes if both users never connect
      setTimeout(async () => {
        try {
          const startedAt = await stateStore.get(`voice:room:${roomId}:started_at`);
          if (!startedAt) {
            const freshChannel = client.channels.cache.get(channel.id) as VoiceChannel | undefined;
            if (freshChannel) {
              const abandonCard = new ContainerBuilder()
                .setAccentColor(COLORS.DANGER)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    formatCustomEmojiText(
                      `# ⏱️ Session Canceled Due to Inactivity\n\n` +
                      `Both participants did not connect within **3 minutes**.\n` +
                      `This temporary voice room has been automatically closed.\n\n` +
                      `-# Run /find match to search again whenever you are ready!`
                    )
                  )
                );
              await freshChannel.send({ components: [abandonCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
              await this.deleteVoiceRoom(client, roomId, channel.id);
            }
          }
        } catch (err: any) {
          console.warn('[VoiceManager] Abandonment check error:', err?.message || err);
        }
      }, 3 * 60 * 1000);

      return { channel, guild, isEclairsFallback, durationMins, roomId };
    } catch (err: any) {
      console.error('[VoiceManager] Failed to create voice match room channel:', err?.message || err);
      return null;
    }
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

    const u1 = await stateStore.get(`voice:room:${roomId}:user1`);
    const u2 = await stateStore.get(`voice:room:${roomId}:user2`);

    // Edge Case: Unauthorized 3rd-party user attempts to join
    if (newState.channelId === channelId && newState.member && !newState.member.user.bot) {
      if (newState.member.id !== u1 && newState.member.id !== u2) {
        await newState.disconnect('Unauthorized: Destiny 1-on-1 private voice session').catch(() => {});
        return;
      }
    }

    const connectedNonBots = channel.members.filter((m) => !m.user.bot).size;

    // Both connected -> start the timer!
    if (connectedNonBots >= 2) {
      // Clear any pending single-disconnect grace timer
      if (this.singleDisconnectTimers.has(roomId)) {
        clearTimeout(this.singleDisconnectTimers.get(roomId)!);
        this.singleDisconnectTimers.delete(roomId);
      }

      const startedAt = await stateStore.get(`voice:room:${roomId}:started_at`);
      if (!startedAt) {
        const now = Date.now();
        const durationMinsStr = await stateStore.get(`voice:room:${roomId}:duration_minutes`);
        const durationMins = durationMinsStr ? parseInt(durationMinsStr, 10) : 5;
        await stateStore.set(`voice:room:${roomId}:started_at`, String(now), 86400);
        await stateStore.set(`voice:room:${roomId}:expires_at`, String(now + durationMins * 60 * 1000), 86400);

        const startCard = new ContainerBuilder()
          .setAccentColor(COLORS.SUCCESS)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              formatCustomEmojiText(
                `# 🎉 Both Partners Connected!\n\n` +
                `Your **${durationMins}-minute** speed voice call has officially started. Enjoy your conversation!\n\n` +
                `• **Status:** Active Call\n` +
                `• **Duration:** \`${durationMins}:00 Minutes\`\n` +
                `• **Controls:** Use the dashboard above for Icebreakers, +5m Extension, or Reveal\n\n` +
                `\`00:00 ━━━━🔘──────── ${String(durationMins).padStart(2, '0')}:00\``
              )
            )
          );

        await channel.send({
          components: [startCard],
          flags: [MessageFlags.IsComponentsV2],
        }).catch(() => {});

        // Arm the call expiry watcher
        this.scheduleExpiryCheck(channel.client, roomId, channel.id);
      }
    }

    // Edge Case: 1 partner disconnected during an active call (WiFi glitch or tab close)
    if (connectedNonBots === 1) {
      const startedAt = await stateStore.get(`voice:room:${roomId}:started_at`);
      if (startedAt && !this.singleDisconnectTimers.has(roomId)) {
        const dcCard = new ContainerBuilder()
          .setAccentColor(COLORS.GOLD)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              formatCustomEmojiText(
                `⚠️ **Partner Disconnected**\n\n` +
                `Your match partner left or disconnected. Waiting **90 seconds** for them to rejoin...\n\n` +
                `-# If they do not return, the room will close automatically.`
              )
            )
          );
        await channel.send({ components: [dcCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});

        const timer = setTimeout(async () => {
          this.singleDisconnectTimers.delete(roomId);
          try {
            const freshChan = channel.guild.channels.cache.get(channel.id) as VoiceChannel | undefined;
            if (freshChan && freshChan.members.filter((m) => !m.user.bot).size < 2) {
              const timeoutCard = new ContainerBuilder()
                .setAccentColor(COLORS.DANGER)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    formatCustomEmojiText(
                      `# ⏱️ Session Concluded\n\n` +
                      `Your partner did not return within 90 seconds. The session has ended.\n\n` +
                      `-# Run /find match to search again.`
                    )
                  )
                );
              await freshChan.send({ components: [timeoutCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
              await this.deleteVoiceRoom(channel.client, roomId, channel.id);
            }
          } catch {}
        }, 90_000);

        this.singleDisconnectTimers.set(roomId, timer);
      }
    }

    // Both left -> schedule cleanup in 30 seconds!
    if (connectedNonBots === 0) {
      if (this.singleDisconnectTimers.has(roomId)) {
        clearTimeout(this.singleDisconnectTimers.get(roomId)!);
        this.singleDisconnectTimers.delete(roomId);
      }

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
   * Watches expiration timer and gracefully terminates call when timer runs out.
   */
  scheduleExpiryCheck(client: Client, roomId: string, channelId: string): void {
    const checkExpiry = async () => {
      try {
        const expiresAtStr = await stateStore.get(`voice:room:${roomId}:expires_at`);
        if (!expiresAtStr) return; // Room concluded or deleted
        const expiresAt = parseInt(expiresAtStr, 10);
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          const ch = client.channels.cache.get(channelId) as VoiceChannel | undefined;
          if (ch) {
            const expireContainer = new ContainerBuilder()
              .setAccentColor(COLORS.GOLD)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  formatCustomEmojiText(
                    `# ⏱️ Speed Call Concluded!\n\n` +
                    `Your scheduled voice time has ended. Thank you for connecting with Destiny!\n\n` +
                    `-# Ephemeral room is closing now. Run /find match to meet someone new.`
                  )
                )
              );
            await ch.send({ components: [expireContainer], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          }
          await this.deleteVoiceRoom(client, roomId, channelId);
        } else {
          // Re-arm check for when time actually expires (max 15 seconds)
          setTimeout(checkExpiry, Math.min(remaining, 15_000));
        }
      } catch (err: any) {
        console.warn('[VoiceManager] scheduleExpiryCheck error:', err?.message || err);
      }
    };

    setTimeout(checkExpiry, 10_000);
  }

  /**
   * Extends the voice call duration by 5 minutes upon mutual agreement (capped at 3 extensions).
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

    // Check maximum extension limit
    const extCountStr = (await stateStore.get(`voice:room:${roomId}:extensions`)) || '0';
    const extCount = parseInt(extCountStr, 10);
    if (extCount >= MAX_VOICE_EXTENSIONS) {
      return { 
        success: false, 
        message: 'Maximum call extensions reached (30 minutes total). Reveal profiles to add each other as friends!' 
      };
    }

    await stateStore.set(`voice:room:${roomId}:extend:${votingUserId}`, 'true', 86400);

    const u1Ext = (await stateStore.get(`voice:room:${roomId}:extend:${u1}`)) === 'true';
    const u2Ext = (await stateStore.get(`voice:room:${roomId}:extend:${u2}`)) === 'true';

    if (u1Ext && u2Ext) {
      const expiresAtStr = await stateStore.get(`voice:room:${roomId}:expires_at`);
      const currentExpiry = expiresAtStr ? parseInt(expiresAtStr, 10) : Date.now();
      const newExpiry = Math.max(currentExpiry, Date.now()) + 5 * 60 * 1000;
      await stateStore.set(`voice:room:${roomId}:expires_at`, String(newExpiry), 86400);
      await stateStore.set(`voice:room:${roomId}:extensions`, String(extCount + 1), 86400);

      // Reset votes for potential further extensions
      await stateStore.del(`voice:room:${roomId}:extend:${u1}`);
      await stateStore.del(`voice:room:${roomId}:extend:${u2}`);

      const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (channel && channel.isTextBased()) {
        const extendCard = new ContainerBuilder()
          .setAccentColor(COLORS.SUCCESS)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              formatCustomEmojiText(`⏳ **Both partners agreed! +5 Minutes added to your voice session.** (Extension ${extCount + 1}/${MAX_VOICE_EXTENSIONS})\n\n-# Continue talking and have fun!`)
            )
          );
        await channel.send({ components: [extendCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
      }
      return { success: true, message: 'Both partners agreed! 5 minutes added.' };
    }

    const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel && channel.isTextBased()) {
      const waitCard = new ContainerBuilder()
        .setAccentColor(COLORS.GOLD)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(`⏳ A partner voted to extend. Waiting for the other partner to click **[Extend +5m]**...`)
          )
        );
      await channel.send({ components: [waitCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
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
        const revealCard = new ContainerBuilder()
          .setAccentColor(COLORS.SUCCESS)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              formatCustomEmojiText(
                `# 🎭 Mutual Profile Reveal Confirmed!\n\n` +
                `Both partners have consented to reveal their identities:\n\n` +
                `• **${destiny1}** is <@${u1}>\n` +
                `• **${destiny2}** is <@${u2}>\n\n` +
                `*You may now add each other as Discord friends!*`
              )
            )
          );
        await channel.send({ components: [revealCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
      }
      return { success: true, message: 'Profiles revealed to both users.' };
    }

    const channel = client.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel && channel.isTextBased()) {
      const requestCard = new ContainerBuilder()
        .setAccentColor(COLORS.PRIMARY)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            formatCustomEmojiText(`🎭 A partner requested a mutual identity reveal. Waiting for the other partner to click **[Reveal Profile]**...`)
          )
        );
      await channel.send({ components: [requestCard], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
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
   * Deletes a voice room and cleans up associated runtime state idempotently.
   */
  async deleteVoiceRoom(client: Client, roomId: string, channelId: string): Promise<void> {
    const alreadyDeleted = await stateStore.get(`voice:room:${roomId}:deleted`);
    if (alreadyDeleted) return;
    await stateStore.set(`voice:room:${roomId}:deleted`, 'true', 3600);

    if (this.singleDisconnectTimers.has(roomId)) {
      clearTimeout(this.singleDisconnectTimers.get(roomId)!);
      this.singleDisconnectTimers.delete(roomId);
    }

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
      const u1 = await stateStore.get(`voice:room:${roomId}:user1`);
      const u2 = await stateStore.get(`voice:room:${roomId}:user2`);
      const destiny1 = await stateStore.get(`voice:room:${roomId}:destiny1`);
      const destiny2 = await stateStore.get(`voice:room:${roomId}:destiny2`);

      let p1: UserProfile | null = null;
      let p2: UserProfile | null = null;

      if (u1) {
        p1 = await db.getUserByDiscordId(u1).catch(() => null);
        if (p1) {
          await stateStore.del(`user:active_voice_room:${p1.id}`);
          await stateStore.del(`user:active_room:${p1.id}`);
        }
      }
      if (u2) {
        p2 = await db.getUserByDiscordId(u2).catch(() => null);
        if (p2) {
          await stateStore.del(`user:active_voice_room:${p2.id}`);
          await stateStore.del(`user:active_room:${p2.id}`);
        }
      }

      // Deliver post-session wrap-up card (Second-Chance voting & Peer Accolades)
      if (p1 && p2 && u1 && u2 && destiny1 && destiny2) {
        try {
          const isBlocked = await blockerService.isBlocked(p1.id, p2.id);
          if (!isBlocked) {
            const { socialManager } = await import('../social/manager.js');
            const { sendCleanDmPanel } = await import('../../bot/dm-cleanup.js');
            const user1Discord = await client.users.fetch(u1).catch(() => null);
            const user2Discord = await client.users.fetch(u2).catch(() => null);
            if (user1Discord) {
              const card1 = socialManager.createSessionWrapUpContainer(destiny2, p2.id, roomId);
              await sendCleanDmPanel(user1Discord, { components: [card1], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
            }
            if (user2Discord) {
              const card2 = socialManager.createSessionWrapUpContainer(destiny1, p1.id, roomId);
              await sendCleanDmPanel(user2Discord, { components: [card2], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
            }
          }
        } catch (wrapUpErr: any) {
          console.warn('[VoiceManager] Wrap-up delivery failed:', wrapUpErr?.message || wrapUpErr);
        }
      }

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
      await stateStore.del(`voice:room:${roomId}:extensions`);
      await stateStore.del(`voice:channel:${channelId}:room_id`);
    }
  }

  /**
   * Sweeps orphaned ephemeral voice channels from crashes or past sessions.
   */
  async sweepOrphanedVoiceChannels(client: Client): Promise<number> {
    let swept = 0;
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) continue;
      if (!guild.channels?.cache) continue;
      const allChannels = Array.from(guild.channels.cache.values());
      const destinyVoiceChannels = allChannels.filter(
        (c: any) => c.type === ChannelType.GuildVoice && typeof c.name === 'string' && c.name.startsWith('🪐・destiny-')
      );
      for (const ch of destinyVoiceChannels) {
        const voiceChan = ch as VoiceChannel;
        const nonBotMembers = voiceChan.members ? Array.from(voiceChan.members.values()).filter((m: any) => !m.user?.bot).length : 0;
        const createdAt = voiceChan.createdTimestamp || 0;
        const isOld = now - createdAt > 20 * 60 * 1000; // Older than 20 mins
        if (nonBotMembers === 0 && isOld) {
          const roomId = await stateStore.get(`voice:channel:${voiceChan.id}:room_id`);
          if (roomId) {
            await this.deleteVoiceRoom(client, roomId, voiceChan.id);
          } else {
            await voiceChan.delete('Sweeping orphaned Destiny voice pod').catch(() => {});
          }
          swept += 1;
        }
      }
    }
    if (swept > 0) {
      console.log(`[VoiceManager] Swept ${swept} orphaned voice channels.`);
    }
    return swept;
  }
}

export const voiceManager = new VoiceManager();
