import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags
} from 'discord.js';
import { db } from '../../database/supabase.js';
import { redis } from '../../redis/client.js';
import { matchmakingManager } from '../../core/matchmaking/manager.js';
import { embedService, COLORS } from '../embeds/index.js';
import { streakService } from '../../core/economy/streaks.js';
import { walletService } from '../../core/economy/wallet.js';
import { shopService } from '../../core/economy/shop.js';
import { gameManager } from '../../core/games/manager.js';
import { reporterService } from '../../core/moderation/reporter.js';
import { blockerService } from '../../core/moderation/blocker.js';
import { revealService } from '../../core/moderation/reveal.js';
import { ProfileField } from '../../core/types.js';
import { profileCardGenerator } from '../../core/profile/card-generator.js';

export const slashCommands = [
  // 1. /match
  new SlashCommandBuilder()
    .setName('match')
    .setDescription('Join the anonymous matchmaking queue to meet someone new')
    .addStringOption((opt) =>
      opt
        .setName('gender_preference')
        .setDescription('Preferred partner gender')
        .setRequired(false)
        .addChoices(
          { name: 'Any Gender', value: 'any' },
          { name: 'Male', value: 'male' },
          { name: 'Female', value: 'female' },
          { name: 'Non-Binary', value: 'non_binary' }
        )
    )
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
    .setDescription('View your anonymous Destiny ID and profile stats card')
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
    ),

  // 5. /coins
  new SlashCommandBuilder()
    .setName('coins')
    .setDescription('Check your Destiny Coins balance and recent transaction history'),

  // 6. /daily
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your 24h daily Destiny Coins streak reward'),

  // 7. /games
  new SlashCommandBuilder()
    .setName('games')
    .setDescription('Play games for fun or bet Destiny Coins')
    .addSubcommand((sub) =>
      sub
        .setName('coinflip')
        .setDescription('Flip a coin (2x payout)')
        .addStringOption((opt) =>
          opt
            .setName('choice')
            .setDescription('Heads or Tails')
            .setRequired(true)
            .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
        )
        .addIntegerOption((opt) => opt.setName('bet').setDescription('Amount of DC to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('blackjack')
        .setDescription('Play a round of classic Blackjack against the dealer')
        .addIntegerOption((opt) => opt.setName('bet').setDescription('Amount of DC to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('dice')
        .setDescription('Roll 2d6 dice (predict under 7, exact 7, or over 7)')
        .addStringOption((opt) =>
          opt
            .setName('prediction')
            .setDescription('Under 7 (2.3x), Exact 7 (5.8x), Over 7 (2.3x)')
            .setRequired(true)
            .addChoices(
              { name: 'Under 7 (2.3x)', value: 'under' },
              { name: 'Exact 7 (5.8x)', value: 'seven' },
              { name: 'Over 7 (2.3x)', value: 'over' }
            )
        )
        .addIntegerOption((opt) => opt.setName('bet').setDescription('Amount of DC to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('slots')
        .setDescription('Spin the 3-reel slot machine (up to 200x Jackpot!)')
        .addIntegerOption((opt) => opt.setName('bet').setDescription('Amount of DC to bet').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('truthordare')
        .setDescription('Get a curated anonymous-safe Truth or Dare prompt')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Truth or Dare')
            .setRequired(false)
            .addChoices({ name: 'Truth', value: 'truth' }, { name: 'Dare', value: 'dare' })
        )
    )
    .addSubcommand((sub) =>
      sub.setName('wouldyourather').setDescription('Get a thought-provoking dilemma with global voting stats')
    )
    .addSubcommand((sub) =>
      sub.setName('trivia').setDescription('Answer a trivia question to win 25 Destiny Coins')
    )
    .addSubcommand((sub) =>
      sub.setName('compatibility').setDescription('Take the 5-question compatibility quiz with your partner')
    ),

  // 8. /shop
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase cosmetic titles, badges, and reveal tokens')
    .addStringOption((opt) =>
      opt.setName('buy').setDescription('Item ID to purchase').setRequired(false)
    ),

  // 9. /report
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

  // 12. /wardrobe
  new SlashCommandBuilder()
    .setName('wardrobe')
    .setDescription('Equip unlocked profile card themes and customize your 5-slot insignia rack'),

  // 13. /icebreaker
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
 * Main Interaction Handler for all Discord Slash Commands
 */
export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Immediately defer reply to avoid Discord 3-second timeout on network DB operations
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
  }

  const respond = async (opts: any): Promise<any> => {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(opts).catch(console.error);
    }
    return await interaction.reply(opts).catch(console.error);
  };

  const { commandName, user: discordUser } = interaction;

  // Resolve user account in Supabase
  let user = await db.getUserByDiscordId(discordUser.id);
  if (!user) {
    user = await db.createOrUpdateUser({
      discordUserId: discordUser.id,
      age: 18,
      gender: 'prefer_not_to_say',
    });
  }

  // 1. MATCH
  if (commandName === 'match') {
    const genderPref = interaction.options.getString('gender_preference');
    const interestsStr = interaction.options.getString('interests');

    if (genderPref) user.preferredGender = [genderPref];
    if (interestsStr) user.interests = interestsStr.split(',').map((s) => s.trim().toLowerCase());

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
        `• **Gender Preference**: \`${user.preferredGender.join(', ')}\`\n` +
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
    await interaction.deferReply({ ephemeral: true });

    if (user.activeRoomId) {
      const room = await db.getRoomById(user.activeRoomId);
      await db.endRoom(user.activeRoomId, 'user_left');
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

  // 3. PROFILE
  if (commandName === 'profile') {
    const age = interaction.options.getInteger('age');
    const gender = interaction.options.getString('gender') as any;
    const bio = interaction.options.getString('bio');
    const intent = interaction.options.getString('intent');

    if (age || gender || bio !== null || intent) {
      if (age) user.age = age;
      if (gender) user.gender = gender;
      if (bio !== null) user.bio = bio;
      if (intent) user.matchIntent = intent;
      user = await db.createOrUpdateUser(user);
    }

    await interaction.deferReply({ ephemeral: false });

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
    const displayName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member as any).displayName
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
        .setLabel('Destiny Vault')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      files: [attachment],
      components: [row],
    });
    return;
  }

  // 4. COINS
  if (commandName === 'coins') {
    const balance = await walletService.getBalance(user.id);
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('🪙 Destiny Coins (DC) Vault')
      .setDescription(`Your current available balance: **${balance.toLocaleString()} DC**`)
      .addFields(
        { name: '💡 Earn More', value: 'Use `/daily` for streak rewards, or win games using `/games`!', inline: false },
        { name: '🛍️ Cosmetic Shop', value: 'Use `/shop` to purchase exclusive titles and badges.', inline: false }
      );

    await respond({ embeds: [embed], ephemeral: true });
    return;
  }

    // 5. DAILY
  if (commandName === 'daily') {
    const result = await streakService.claimDaily(user.id);
    const embed = new EmbedBuilder()
      .setColor(result.success ? COLORS.SUCCESS : COLORS.GOLD)
      .setTitle(result.success ? '🔥 Daily Reward Claimed!' : '⏳ Daily Cooldown Active')
      .setDescription(result.message)
      .addFields(
        { name: 'Current Balance', value: `**${result.newBalance.toLocaleString()} DC**`, inline: true },
        { name: 'Streak Level', value: `**${result.newStreak} Days** 🔥`, inline: true }
      );

    await respond({ embeds: [embed], ephemeral: true });
    return;
  }

    // 6. GAMES
  if (commandName === 'games') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'coinflip') {
      const choice = interaction.options.getString('choice') as any;
      const bet = interaction.options.getInteger('bet') || 10;
      const res = await gameManager.playCoinFlip(user.id, choice, bet);

      if (!res.success || !res.result) {
        await respond({ content: `❌ ${res.error}`, ephemeral: true });
        return;
      }

      const r = res.result;
      const embed = new EmbedBuilder()
        .setColor(r.isWin ? COLORS.SUCCESS : COLORS.DANGER)
        .setTitle(`🪙 Coin Flip — ${r.isWin ? 'You Won!' : 'Better Luck Next Time!'}`)
        .setDescription(
          `You picked **${r.choice.toUpperCase()}**.\n` +
          `The coin landed on **${r.result.toUpperCase()}**!\n\n` +
          `• **Bet**: ${r.bet} DC\n` +
          `• **Payout**: **${r.payout} DC**`
        )
        .setFooter({ text: `Provably Fair Server Seed: ${r.serverSeed.substring(0, 12)}...` });

      await respond({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'slots') {
      const bet = interaction.options.getInteger('bet') || 10;
      const res = await gameManager.playSlots(user.id, bet);

      if (!res.success || !res.result) {
        await respond({ content: `❌ ${res.error}`, ephemeral: true });
        return;
      }

      const s = res.result;
      const embed = new EmbedBuilder()
        .setColor(s.isWin ? COLORS.GOLD : COLORS.DARK)
        .setTitle(`🎰 Destiny Slots — ${s.jackpot ? '💥 MEGA JACKPOT 💥' : (s.isWin ? 'Winner!' : 'No Match')}`)
        .setDescription(
          `## [ ${s.reels.join('  |  ')} ]\n\n` +
          `• **Bet**: ${s.bet} DC\n` +
          `• **Multiplier**: ${s.multiplier}x\n` +
          `• **Payout**: **${s.payout} DC**`
        );

      await respond({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'truthordare') {
      const type = interaction.options.getString('type') as any;
      const prompt = gameManager.getTruthOrDare(type);
      const embed = new EmbedBuilder()
        .setColor(COLORS.DESTINY_PURPLE)
        .setTitle(`${prompt.type === 'truth' ? '🔍 Truth' : '⚡ Dare'} (${prompt.level.toUpperCase()})`)
        .setDescription(`> **"${prompt.content}"**`)
        .setFooter({ text: 'Answer in chat with your partner!' });

      await respond({ embeds: [embed] });
      return;
    }

    if (sub === 'wouldyourather') {
      const dilemma = gameManager.getWouldYouRather();
      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('🤔 Would You Rather?')
        .setDescription(
          `**A:** ${dilemma.optionA}\n\n*— OR —*\n\n` +
          `**B:** ${dilemma.optionB}`
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`wyr_A_${dilemma.id}`).setLabel('Option A').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`wyr_B_${dilemma.id}`).setLabel('Option B').setStyle(ButtonStyle.Secondary)
      );

      await respond({ embeds: [embed], components: [row] });
      return;
    }

    if (sub === 'trivia') {
      const q = gameManager.getTrivia();
      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`🧠 Trivia Duel — ${q.category} (${q.difficulty.toUpperCase()})`)
        .setDescription(
          `### ${q.question}\n\n` +
          q.options.map((opt, i) => `**${i + 1}.** ${opt}`).join('\n')
        )
        .setFooter({ text: 'First correct answer wins +25 Destiny Coins!' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        q.options.map((_opt, i) =>
          new ButtonBuilder()
            .setCustomId(`triv_${q.id}_${i}`)
            .setLabel(`${i + 1}`)
            .setStyle(ButtonStyle.Secondary)
        )
      );

      await respond({ embeds: [embed], components: [row] });
      return;
    }

    await respond({ content: 'Game mode ready! Select a game option from /games', ephemeral: true });
    return;
  }

  // 7. REVEAL
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

  // 10. SHOP
  if (commandName === 'shop') {
    const buyItemId = interaction.options.getString('buy');

    if (buyItemId) {
      const res = await shopService.purchaseItem(user.id, buyItemId);
      await respond({ content: res.message, ephemeral: true });
      return;
    }

    const catalog = await shopService.getCatalog();
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('🛍️ Destiny Cosmetic & Title Emporium');

    if (catalog.length === 0) {
      embed.setDescription('The Destiny Shop currently has no items in stock. Real cosmetics added by the administration will appear here!');
    } else {
      embed.setDescription('Use `/shop buy:<item_id>` to purchase items!');
      embed.addFields(
        catalog.map((item: any) => ({
          name: `${item.icon} ${item.name} (\`${item.id}\`) — ${item.price} DC`,
          value: item.description,
          inline: false,
        }))
      );
    }

    await respond({ embeds: [embed], ephemeral: true });
    return;
  }

    // 11. SETTINGS
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

  // 12. WARDROBE
  if (commandName === 'wardrobe') {
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
        .setEmoji('📸')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_shop')
        .setLabel('Shop Cosmetics')
        .setEmoji('🛍️')
        .setStyle(ButtonStyle.Primary)
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.DARK)
      .setTitle('👔 Destiny Identity Wardrobe')
      .setDescription(
        `Customize the appearance of your **Destiny Profile Card**.\n\n` +
        `• **Equipped Theme**: \`${(user.cardTheme || 'obsidian').toUpperCase()}\`\n` +
        `• **Active Badges (${user.equippedBadges?.length || 5}/5)**: ${user.equippedBadges && user.equippedBadges.length > 0 ? user.equippedBadges.map((b: string) => `\`[${b}]\``).join(' ') : '\`[ID VERIFIED]\` \`[7D STREAK]\` \`[TITAN 1K]\` \`[VETERAN]\` \`[KARMA 100%]\`'}\n\n` +
        `*Select a new card skin or choose up to 5 rack insignias below.*`
      );

    await respond({ embeds: [embed], components: [row1, row2, row3], ephemeral: true });
    return;
  }

  // 13. ICEBREAKER
  if (commandName === 'icebreaker') {
    const ICEBREAKERS = [
      'If you could instantly become a master at any skill tonight, what would you choose?',
      'What is a weird habit or ritual you have that you think nobody else does?',
      'If you could step into the world of any anime, movie, or game for 24 hours, where are you going?',
      'What is the best piece of advice you have ever heard that actually changed how you live?',
      'What is a song or album that feels like a core memory to you?',
      'If your life had a soundtrack, what genre would dominate it right now?',
      'What is something you are secretly proud of that you do not get to brag about often?',
      'Would you rather explore the depths of the ocean or the furthest edges of space?',
      'What is the most spontaneous thing you have ever done that turned out amazing?',
      'If you could talk to your future self 10 years from now, what single question would you ask?'
    ];
    const picked = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];

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

        const promptEmbed = new EmbedBuilder()
          .setColor(COLORS.DESTINY_PURPLE)
          .setTitle('🎲 Curated Icebreaker Prompt')
          .setDescription(`> **"${picked}"**`)
          .setFooter({ text: 'Answer in chat with your partner!' });

        if (partnerUser) {
          await partnerUser.send({ embeds: [promptEmbed] }).catch(() => {});
        }
        await respond({ embeds: [promptEmbed], ephemeral: false });
        return;
      }
    }

    const soloEmbed = new EmbedBuilder()
      .setColor(COLORS.DESTINY_PURPLE)
      .setTitle('🎲 Daily Icebreaker Question')
      .setDescription(`> **"${picked}"**\n\n*Join a chat room to share your answer with someone new!*`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Find Match')
        .setStyle(ButtonStyle.Success)
    );

    await respond({ embeds: [soloEmbed], components: [row], ephemeral: true });
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

