import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder
} from 'discord.js';
import { UserProfile, RoomSession, GuildSettings } from '../../core/types.js';

export const COLORS = {
  PRIMARY: 0x5865F2, // Discord Blurple
  DESTINY_PURPLE: 0x9B59B6,
  GOLD: 0xF1C40F,
  SUCCESS: 0x2ECC71,
  DANGER: 0xE74C3C,
  DARK: 0x2C2F33,
};

export class EmbedService {
  // =========================================================================
  // COMPONENTS V2 CONTAINERS (Buttons Embedded Directly Inside the Cards)
  // =========================================================================

  /**
   * Permanent Matchmaking Portal Container (for server channels)
   */
  createMatchmakingPortalContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Find Anonymous Match')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_profile')
        .setLabel('My Profile & Stats')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet')
        .setLabel('Destiny Vault')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DARK)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪐 Destiny — Anonymous Matchmaking Portal\n\n` +
          `Welcome to the **Destiny Anonymous Social Network**! Meet verified people across servers completely anonymously.\n\n` +
          `• 🔒 **100% Privacy-Preserving**: Your Discord tag, username, and avatar are completely hidden.\n` +
          `• ⚡ **Real-Time Matchmaking**: Smart affinity pairing based on shared interests and preferences.\n` +
          `• 🏆 **Leveling & Streaks**: Earn Destiny Coins and level up connection tiers as you chat.\n\n` +
          `*Click **Find Anonymous Match** below or configure your profile to jump in!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Main Menu Container (`destiny`, `menu`, DM greeting)
   */
  createMainMenuContainer(authorName: string, user: UserProfile | null, isProfileComplete: boolean): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(COLORS.DESTINY_PURPLE);

    if (!user || !isProfileComplete) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪐 Destiny — Anonymous Matchmaking\n\n` +
          `Welcome to **Destiny**, **${authorName}**! Meet new people across Discord completely anonymously.\n\n` +
          `⚠️ **Profile Setup Required**\n` +
          `You haven't set up your anonymous profile yet. Click **Setup Profile** below to choose your age, gender, and interests before starting.\n\n` +
          `🔒 *Privacy Notice: Your Discord username, tag, and avatar are never shared.*`
        )
      );
    } else {
      const interestsStr = user.interests.length > 0 
        ? user.interests.map(i => `\`${i}\``).join(', ') 
        : '*None set*';

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪐 Destiny — Anonymous Matchmaking\n\n` +
          `Welcome back, **${authorName}**!\n\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• 🎂 **Age:** \`${user.age}\`  •  ⚧ **Gender:** \`${user.gender}\`${user.genderVerified ? '  🛡️ **[Verified]**' : ''}\n` +
          `• 🪙 **Destiny Coins:** \`${user.destinyCoins.toLocaleString()} DC\`  •  🔥 **Streak:** \`${user.streakCount} days\`\n` +
          `• 🎯 **Interests:** ${interestsStr}\n\n` +
          `*Click **Start Match** or type \`start\` to connect with an anonymous partner!*`
        )
      );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_profile')
        .setLabel(isProfileComplete ? 'Edit Profile' : 'Setup Profile')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify')
        .setLabel(user?.genderVerified ? 'Verified' : 'Get Verified')
        .setEmoji('🛡️')
        .setStyle(user?.genderVerified ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet')
        .setLabel('Coins & Daily')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_games')
        .setLabel('Games')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(mainRow);

    if (user?.activeRoomId) {
      const roomRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('destiny_btn_leave')
          .setLabel('Leave Active Chat')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Danger)
      );
      container.addActionRowComponents(roomRow);
    }

    return container;
  }

  /**
   * Profile Required Container with button inside
   */
  createProfileRequiredContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_profile')
        .setLabel('Setup Profile')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Primary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⚠️ Profile Setup Required\n\n` +
          `You cannot start chatting until you create your anonymous profile!\n\n` +
          `• Click **Setup Profile** below to fill in your age, gender, and preferences.\n` +
          `• It takes only 10 seconds and keeps your Discord identity 100% private.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Profile Created / Saved Container
   */
  createProfileCreatedContainer(savedUser: UserProfile): ContainerBuilder {
    const interestsStr = savedUser.interests.length > 0 
      ? savedUser.interests.map(i => `\`${i}\``).join(', ') 
      : '*Open*';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match Now')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet')
        .setLabel('Coins & Daily')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✅ Anonymous Profile Saved!\n\n` +
          `Your anonymous Destiny identity is active in our global database!\n\n` +
          `• 🆔 **Destiny ID:** \`${savedUser.destinyId}\`\n` +
          `• 🎂 **Age:** \`${savedUser.age}\`  •  ⚧ **Gender:** \`${savedUser.gender}\`\n` +
          `• 🎯 **Interests:** ${interestsStr}\n` +
          `• 🪙 **Destiny Coins:** \`${savedUser.destinyCoins.toLocaleString()} DC\`\n\n` +
          `🔒 *Your Discord username, avatar, and server identity remain 100% anonymous.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Match Preference Container — asks user who they want to talk to today based on their mood
   */
  createMatchPreferenceContainer(user: UserProfile): ContainerBuilder {
    const prefRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('match_pref_female')
        .setLabel('Talk with Girls')
        .setEmoji('👧')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('match_pref_male')
        .setLabel('Talk with Boys')
        .setEmoji('👦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('match_pref_any')
        .setLabel('Anyone / Open to All')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success)
    );

    const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 💫 Who would you like to talk with?\n\n` +
          `Choose your match preference based on your current mood!\n` +
          `You can choose someone new whenever you start a chat.\n\n` +
          `• 🆔 **Your Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Your Gender:** \`${user.gender}\`\n` +
          `• 🎯 **Your Interests:** ${user.interests.length > 0 ? user.interests.join(', ') : '*Open*'}\n\n` +
          `*Tap an option below to enter matchmaking:*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(prefRow, cancelRow);
  }

  /**
   * Searching Queue Container with Cancel button inside
   */
  createSearchingContainer(user: UserProfile): ContainerBuilder {
    const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_queue')
        .setLabel('Cancel Search')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🔍 Searching for an Anonymous Match...\n\n` +
          `You have entered the anonymous matchmaking queue!\n\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Preference:** ${user.preferredGender?.join(', ') || 'Any'}\n` +
          `• 🎯 **Interests:** ${user.interests.length > 0 ? user.interests.join(', ') : 'Open'}\n\n` +
          `*Please keep your DMs open. The moment an anonymous partner is paired, you will receive your connection card here!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(cancelRow);
  }

  /**
   * Already Searching Container with Cancel button inside
   */
  createAlreadyQueuedContainer(): ContainerBuilder {
    const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_queue')
        .setLabel('Cancel Search')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.PRIMARY)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🔍 Already in Queue\n\n` +
          `You are already searching in the matchmaking queue!\n` +
          `We will notify you right here in DM the moment a partner is matched.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(cancelRow);
  }

  /**
   * Active Room Prompt Container with Leave button inside
   */
  createActiveRoomPromptContainer(roomCode: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_leave')
        .setLabel('Leave Current Room')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Danger)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.PRIMARY)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 💬 Already in an Active Room\n\n` +
          `You are already in an ongoing anonymous chat room (**${roomCode}**).\n` +
          `Please exit your current session before queuing for a new match.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Coins & Wallet Menu Container with buttons inside
   */
  createWalletContainer(user: UserProfile): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_claim_daily')
        .setLabel('Claim Daily (+50 DC)')
        .setEmoji('🔥')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_games')
        .setLabel('Play Games')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪙 Destiny Coins Wallet — ${user.destinyId}\n\n` +
          `Your balance and daily reward streaks are saved in real-time in Supabase.\n\n` +
          `• 💰 **Current Balance:** \`${user.destinyCoins.toLocaleString()} DC\`\n` +
          `• 🔥 **Daily Streak:** \`${user.streakCount} days\`\n` +
          `• 🕒 **Last Claim:** ${user.lastDailyClaim ? `<t:${Math.floor(new Date(user.lastDailyClaim).getTime() / 1000)}:R>` : '*Never*'}\n\n` +
          `*Claim your daily reward every 24 hours to build your streak bonus!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Daily Reward Result Container
   */
  createDailyClaimResultContainer(success: boolean, message: string, newBalance: number, rewardDc?: number, newStreak?: number): ContainerBuilder {
    const container = new ContainerBuilder();

    if (success) {
      container
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🎉 Daily Reward Claimed!\n\n` +
            `You received **+${rewardDc} Destiny Coins**! 🪙\n\n` +
            `• 🔥 **Current Streak:** ${newStreak} days\n` +
            `• 💰 **New Balance:** ${newBalance.toLocaleString()} DC`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('destiny_btn_games')
              .setLabel('Play Games')
              .setEmoji('🎮')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('destiny_btn_start')
              .setLabel('Start Match')
              .setEmoji('✨')
              .setStyle(ButtonStyle.Success)
          )
        );
    } else {
      container
        .setAccentColor(COLORS.PRIMARY)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# ⏳ Daily Already Claimed\n\n` +
            `${message}\n\n` +
            `• 💰 **Current Balance:** ${newBalance.toLocaleString()} DC`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('destiny_btn_games')
              .setLabel('Play Games')
              .setEmoji('🎮')
              .setStyle(ButtonStyle.Secondary)
          )
        );
    }

    return container;
  }

  /**
   * Games Arcade Container with Quick Game Buttons inside
   */
  createGamesMenuContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('game_quick_flip')
        .setLabel('Coin Flip (10 DC)')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_quick_dice')
        .setLabel('Dice Roll (10 DC)')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_quick_trivia')
        .setLabel('Trivia Challenge')
        .setEmoji('❓')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('game_quick_wyr')
        .setLabel('Would You Rather')
        .setEmoji('🤔')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎮 Destiny Games Arcade\n\n` +
          `Play instant games with Destiny Coins or test your trivia knowledge!\n\n` +
          `• **🪙 Quick Coin Flip** (Bet 10 DC, 2x payout)\n` +
          `• **🎲 Quick Dice Roll** (Roll higher than 7 to win 20 DC)\n` +
          `• **❓ Random Trivia** (Win +25 DC for correct answers)\n` +
          `• **🤔 Would You Rather** (Vote and see global stats)`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Coin Flip Result Container with buttons inside
   */
  createCoinFlipResultContainer(won: boolean, result: string, newBalance: number): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('game_quick_flip')
        .setLabel('Flip Again (10 DC)')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_games')
        .setLabel('All Games')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(won ? COLORS.SUCCESS : COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${won ? '🎉 Coin Flip: You Won!' : '💀 Coin Flip: You Lost!'}\n\n` +
          `The coin landed on **${result.toUpperCase()}**!\n\n` +
          `${won ? '💰 Won **+10 DC**' : '💸 Lost **-10 DC**'}\n` +
          `• 💰 **New Balance:** **${newBalance.toLocaleString()} DC**`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Dice Result Container with buttons inside
   */
  createDiceResultContainer(won: boolean, dice1: number, dice2: number, sum: number, netChange: number, newBalance: number): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('game_quick_dice')
        .setLabel('Roll Again (10 DC)')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_games')
        .setLabel('All Games')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(won ? COLORS.SUCCESS : COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${won ? '🎲 High Roll: Winner!' : '🎲 Low Roll: Defeat!'}\n\n` +
          `You rolled **[${dice1}] + [${dice2}] = ${sum}** (Over 7 to win)!\n\n` +
          `${won ? `💰 Won **+${netChange} DC**` : '💸 Lost **-10 DC**'}\n` +
          `• 💰 **New Balance:** **${newBalance.toLocaleString()} DC**`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Trivia Challenge Container with option buttons inside
   */
  createTriviaContainer(trivia: { id: string; category: string; question: string; options: string[] }): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>();
    trivia.options.forEach((opt: string, idx: number) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`triv_${trivia.id}_${idx}`)
          .setLabel(opt.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    });

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ❓ Trivia Challenge [${trivia.category}]\n\n` +
          `**${trivia.question}**\n\n` +
          `*Choose your answer below within 30 seconds for +25 DC!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Would You Rather Container with choice buttons inside
   */
  createWYRContainer(wyr: { id: string; optionA: string; optionB: string }): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`wyr_A_${wyr.id}`)
        .setLabel('Option A')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`wyr_B_${wyr.id}`)
        .setLabel('Option B')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.PRIMARY)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🤔 Would You Rather...\n\n` +
          `**Option A:** ${wyr.optionA}\n\n` +
          `— *OR* —\n\n` +
          `**Option B:** ${wyr.optionB}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Connection Established Container with buttons inside
   */
  createMatchFoundContainer(room: RoomSession, isUser1: boolean, iceBreaker: string, sharedInterests: string[] = []): ContainerBuilder {
    const myPersona = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;
    const myAvatar = isUser1 ? room.user1Avatar : room.user2Avatar;
    const partnerPersona = isUser1 ? room.user2Pseudonym : room.user1Pseudonym;
    const partnerAvatar = isUser1 ? room.user2Avatar : room.user1Avatar;

    const interestsStr = sharedInterests.length > 0 
      ? sharedInterests.map((i) => `\`${i}\``).join(', ') 
      : '*Open Horizons*';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_reveal_consent')
        .setLabel('Request Mutual Reveal')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📜'),
      new ButtonBuilder()
        .setCustomId('destiny_btn_leave')
        .setLabel('End Chat')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚪'),
      new ButtonBuilder()
        .setCustomId(`btn_report_room_${room.id}`)
        .setLabel('Report')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚨')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✨ Destiny Connection Established! [${room.roomCode}]\n\n` +
          `You have been matched anonymously with **${partnerAvatar} ${partnerPersona}**!\n\n` +
          `• **Your Persona:** ${myAvatar} **${myPersona}**\n` +
          `• **🌱 Connection Tier:** Strangers (Tier 1)\n` +
          `• **🔒 Privacy Notice:** Discord usernames, IDs, and avatars are hidden.\n` +
          `• **🎯 Shared Interests:** ${interestsStr}\n\n` +
          `**💬 Conversation Starter:**\n> *${iceBreaker}*\n\n` +
          `*All messages typed right here in DM will be sanitized and forwarded in real-time.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Report Category Selection Menu Container
   */
  createReportMenuContainer(roomId: string, partnerPseudonym?: string): ContainerBuilder {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`act_report_${roomId}_harassment`)
        .setLabel('Harassment / Abuse')
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`act_report_${roomId}_inappropriate_content`)
        .setLabel('Inappropriate / NSFW')
        .setEmoji('🔞')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`act_report_${roomId}_identity_leak`)
        .setLabel('Doxxing / Leak')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`act_report_${roomId}_spam`)
        .setLabel('Spam / Scams')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`act_report_${roomId}_underage`)
        .setLabel('Underage Account')
        .setEmoji('👶')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('act_report_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🚨 Report User${partnerPseudonym ? ` (${partnerPseudonym})` : ''}\n\n` +
          `Your safety is our top priority. Please select a reason for reporting your chat partner.\n\n` +
          `• 📸 **Evidence:** The last 15 messages will be securely submitted to moderation.\n` +
          `• 🚫 **Auto-Block:** This user will be permanently blocked from ever matching with you again.\n` +
          `• 📉 **Reputation Impact:** Offenses deduct points from their trust score.\n` +
          `• 🚪 **Room Closure:** If the room is currently active, it will be terminated immediately.\n\n` +
          `*Select a violation category below:*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row1, row2);
  }

  /**
   * Report Submitted & Auto-Blocked Confirmation Container
   */
  createReportSuccessContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Find New Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✅ Report Submitted & User Blocked\n\n` +
          `Thank you for keeping Destiny safe. Your report and chat evidence have been delivered to our moderation desk.\n\n` +
          `• 🔒 **Auto-Block Active:** You two will **never** be paired in matchmaking again.\n` +
          `• 📉 **Reputation Penalized:** The reported user's trust score has been reduced.\n` +
          `• 🛡️ **Your Identity:** Your Discord tag, ID, and profile were never revealed to them.\n\n` +
          `*Whenever you're ready, click below to find a new anonymous partner!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Verification Info & Prompt Container (Triggered via `verify` command in DM or Get Verified button)
   */
  createVerificationPromptContainer(user?: UserProfile | null): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify_voicenote_info')
        .setLabel('Send Voice Note')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify_sync_role')
        .setLabel('Sync Server Role (Instant)')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    const verificationPhrase = user
      ? `"I am ${user.destinyId}, verifying my gender as ${user.gender} on Destiny"`
      : `"I am verifying my gender on Destiny"`;

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ Destiny Gender Verification\n\n` +
          `Get the official **Verified Shield Badge** 🛡️ on your anonymous Destiny profile!\n` +
          `Verified users receive higher matchmaking priority and 100% authenticity trust.\n\n` +
          `### 🌟 Option 1: Send Voice Note in this DM (Instant & Private)\n` +
          `• Press & hold the **Discord Mic icon 🎙️** (or send an audio file / voice message) right here in this DM.\n` +
          `• Say this verification phrase:\n` +
          `> *${verificationPhrase}*\n` +
          `• The bot will automatically capture your audio note and deliver it directly to our moderation team!\n\n` +
          `### ⚡ Option 2: 1-Click Server Role Sync (Instant Approval)\n` +
          `Already verified as Male or Female in **discord.gg/eclairs**?\n` +
          `Click **Sync Server Role** and Destiny will automatically detect your server role and grant your badge without waiting!\n\n` +
          `*Current Profile Status: ${user?.genderVerified ? '✅ **Verified**' : user?.genderVerificationStatus === 'pending' ? '⏳ **Pending Review**' : '⚪ **Unverified**'}*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Voice Note Instructions Container (Explaining how to record)
   */
  createVoiceNoteInstructionContainer(user: UserProfile): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify_sync_role')
        .setLabel('Sync Server Role Instead')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.PRIMARY)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ How to Record Your Verification Voice Note\n\n` +
          `**No text forms needed! Just record directly in this DM:**\n\n` +
          `1. **On Mobile:** Tap and hold the **Microphone icon 🎙️** in your message bar below.\n` +
          `2. **On Desktop:** Click the **Microphone icon 🎙️** or use the **+** button to attach an audio file (\`.ogg\`, \`.mp3\`, \`.wav\`, \`.m4a\`).\n` +
          `3. **Speak clearly into your mic:**\n` +
          `> *"I am ${user.destinyId}, verifying my gender as ${user.gender} on Destiny bot."*\n\n` +
          `As soon as you send your audio note, Destiny will automatically detect it and submit it for staff review!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Voice Note Received Container
   */
  createVoiceNoteReceivedContainer(evidenceUrl: string, user: UserProfile): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ Voice Verification Received!\n\n` +
          `We have successfully captured your voice note!\n\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Claimed Gender:** \`${user.gender}\`\n` +
          `• 🎧 **Audio Note:** Attached below ⬇️ *(Native Player)*\n` +
          `• ⏳ **Status:** Pending Staff Review\n\n` +
          `Our moderation team has been alerted with your recording. You will receive a direct notification right here in DM the moment your badge is approved!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Voice Note Received Rich Embed (Accompanies real audio file attachment)
   */
  createVoiceNoteReceivedEmbed(evidenceUrl: string, user: UserProfile): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('🎙️ Voice Verification Received!')
      .setDescription(
        `We have successfully received your verification voice note!\n\n` +
        `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
        `• ⚧ **Claimed Gender:** \`${user.gender}\`\n` +
        `• 🎧 **Voice Recording:** Attached below ⬇️ *(Press ▶️ to listen)*\n` +
        `• ⏳ **Status:** Pending Staff Review\n\n` +
        `Our moderation team has been notified. You will receive a direct DM notification the moment your badge is approved!`
      )
      .setTimestamp();

    return { embed, components: [row] };
  }

  /**
   * Staff Channel Verification Review Container
   */
  createStaffVerificationReviewContainer(user: UserProfile, audioUrl: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_admin_verify_approve_${user.id}`)
        .setLabel(`Approve (${user.gender})`)
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_admin_verify_reject_${user.id}`)
        .setLabel('Reject')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ New Voice Verification Request\n\n` +
          `A user has submitted a voice verification recording for staff review.\n\n` +
          `• 👤 **User:** <@${user.discordUserId}> (\`${user.discordUserId}\`)\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Claimed Gender:** **${user.gender.toUpperCase()}**\n` +
          `• 🎂 **Age:** ${user.age}\n` +
          `• 🎧 **Voice Recording:** Attached below ⬇️ *(Press ▶️ to Play directly in Discord)*\n\n` +
          `*Listen to the attached voice recording to verify the voice matches the claimed gender, then click Approve or Reject.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Staff Channel Verification Review Embed (Accompanies real audio file attachment)
   */
  createStaffVerificationReviewEmbed(user: UserProfile, audioUrl: string): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_admin_verify_approve_${user.id}`)
        .setLabel(`Approve (${user.gender})`)
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_admin_verify_reject_${user.id}`)
        .setLabel('Reject')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('🎙️ New Voice Verification Request')
      .setDescription(
        `A user has submitted a voice verification recording for staff review.\n\n` +
        `• 👤 **User:** <@${user.discordUserId}> (\`${user.discordUserId}\`)\n` +
        `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
        `• ⚧ **Claimed Gender:** **${user.gender.toUpperCase()}**\n` +
        `• 🎂 **Age:** ${user.age}\n` +
        `• 🎧 **Voice Recording:** Attached below ⬇️ *(Click ▶️ to Play directly in Discord)*\n\n` +
        `*Listen to the attached voice recording to verify their voice matches their claimed gender, then click Approve or Reject.*`
      )
      .setTimestamp();

    return { embed, components: [row] };
  }

  /**
   * Staff Verification Decision Embed (Updated after staff clicks Approve or Reject)
   */
  createStaffVerificationDecisionEmbed(targetUser: UserProfile | null, decisionText: string, approved: boolean): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(approved ? COLORS.SUCCESS : COLORS.DANGER)
      .setTitle('🎙️ Verification Review Processed')
      .setDescription(
        `• 👤 **User:** <@${targetUser?.discordUserId || 'User'}>\n` +
        `• 🆔 **Destiny ID:** \`${targetUser?.destinyId || 'N/A'}\`\n` +
        `• ⚧ **Gender:** \`${targetUser?.gender || 'N/A'}\`\n` +
        `• 📋 **Decision:** ${decisionText}`
      )
      .setTimestamp();
  }

  /**
   * Server Role Sync Success Container
   */
  createRoleSyncSuccessContainer(user: UserProfile, roleName: string, guildName: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✨ Instant Verification Approved!\n\n` +
          `We detected your verified role **${roleName}** in **${guildName}**!\n\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Verified Gender:** \`${user.gender}\`  🛡️\n` +
          `• 🌟 **Verified Badge:** Active on your profile\n\n` +
          `*You are officially verified! Your profile now has higher matching priority and the verified shield badge.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Server Role Sync Not Found Container
   */
  createRoleSyncNotFoundContainer(inServer: boolean, guildName: string = 'discord.gg/eclairs'): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify_voicenote_info')
        .setLabel('Send Voice Note Instead')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    const text = inServer
      ? `# ℹ️ No Verified Gender Role Found\n\n` +
        `We checked your account in **${guildName}**, but did not detect a recognized verified gender role (e.g. Female, Male, Verified).\n\n` +
        `• **What to do:** You can get verified by server staff in the server, or simply record a quick **Voice Note** right here in this DM!`
      : `# ⚠️ Not a Server Member\n\n` +
        `We could not find your account in our official Discord server!\n\n` +
        `• **Server Link:** [discord.gg/eclairs](https://discord.gg/eclairs)\n` +
        `• **Quick Alternative:** You do not need to join if you prefer to stay in DMs — simply press the mic button below and send a **Voice Note**!`;

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Server Setup & Admin Console Container
   */
  createServerSetupContainer(guild: { id: string; name: string }, settings: GuildSettings | null, currentChannelId?: string): ContainerBuilder {
    const activeChannel = settings?.matchChannelId || settings?.modLogChannelId;
    const isCurrentSet = currentChannelId && activeChannel === currentChannelId;

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_set_current')
        .setLabel(isCurrentSet ? 'Channel Set Here' : 'Set This Channel as Bot Channel')
        .setEmoji(isCurrentSet ? '✅' : '📌')
        .setStyle(isCurrentSet ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(Boolean(isCurrentSet)),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_lobby_card')
        .setLabel('Post Public Lobby')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_verify_hub')
        .setLabel('Post Verification Hub')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary)
    );

    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('destiny_select_admin_channel')
      .setPlaceholder('📂 Or select another channel from this server...')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_refresh')
        .setLabel('Refresh Status')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_reset')
        .setLabel('Reset Channel Lock')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!activeChannel)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⚙️ Destiny — Server Setup & Admin Console\n\n` +
          `Welcome to the **Destiny** admin control panel for **${guild.name}**!\n` +
          `Designate a specific channel for Destiny so admins can interact with the bot and all bot activity stays in that channel.\n\n` +
          `### 📊 Current Server Configuration\n` +
          `• 📌 **Designated Bot Channel:** ${activeChannel ? `<#${activeChannel}>` : '`❌ None (Unrestricted)`'}\n` +
          `• 🛡️ **Verification & Mod Logs:** ${settings?.modLogChannelId ? `<#${settings.modLogChannelId}>` : activeChannel ? `<#${activeChannel}>` : '`❌ None (Default Search)`'}\n` +
          `• 🌐 **Matching Network:** **Global Cross-Server Active** ✅\n` +
          `• 🔒 **Privacy Mode:** **100% Anonymous DM Relay** ✨\n\n` +
          `### 🛠️ Quick Actions:\n` +
          `1. Click **Set This Channel as Bot Channel** (or pick from dropdown) to lock all bot interactions here.\n` +
          `2. Click **Post Public Lobby** to send the interactive matchmaking card for members.\n` +
          `3. Click **Post Verification Hub** to post the instant role sync & voice verification card!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row1, row2 as any, row3);
  }

  /**
   * Public Server Lobby Container (Placed in dedicated Destiny channel)
   */
  createServerLobbyCardContainer(guildName: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_profile')
        .setLabel('My Profile')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_verify_prompt')
        .setLabel('Get Verified')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_wallet_daily')
        .setLabel('Daily Coins')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪐 Welcome to Destiny — ${guildName}\n\n` +
          `Connect with members and users across Discord in safe, anonymous 1-on-1 conversations!\n\n` +
          `• 🎭 **100% Anonymous:** Random pseudonyms and avatars generated for every match.\n` +
          `• 🛡️ **Identity Protected:** Real Discord usernames are never revealed unless both users agree.\n` +
          `• ⚡ **Mood & Criteria Based:** Find partners who match your vibe.\n` +
          `• 🪙 **Economy & Streaks:** Earn daily coins and build connection streaks!\n\n` +
          `*Click **Start Match** below to pair with someone new right now!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Channel Set Confirmation Container
   */
  createChannelSetSuccessContainer(channelId: string, guildName: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_lobby_card')
        .setLabel('Post Public Lobby')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_verify_hub')
        .setLabel('Post Verification Hub')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_refresh')
        .setLabel('Setup Menu')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✅ Destiny Channel Configured!\n\n` +
          `Destiny is now officially locked to <#${channelId}> in **${guildName}**!\n\n` +
          `• 📌 **Admin Commands & Interactions:** Only in <#${channelId}>\n` +
          `• 🛡️ **Verification Alerts & Logs:** Sent directly here\n` +
          `• 🧹 **Clean Server Policy:** Commands invoked in other channels will be redirected here\n\n` +
          `*Admins can return to this setup anytime by typing \`setup\` or clicking **Setup Menu** below.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Channel Reset Confirmation Container
   */
  createChannelResetSuccessContainer(guildName: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_set_current')
        .setLabel('Set Current Channel')
        .setEmoji('📌')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('destiny_btn_setup_refresh')
        .setLabel('Setup Menu')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.PRIMARY)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🔄 Destiny Channel Lock Removed\n\n` +
          `The designated channel lock for **${guildName}** has been cleared.\n` +
          `Admins can re-lock Destiny to a channel anytime using \`setup\` or the button below.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Channel Redirect Notice Container (When commands invoked in other channels)
   */
  createChannelRedirectContainer(designatedChannelId: string, authorName: string): ContainerBuilder {
    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 📍 Destiny is Configured in <#${designatedChannelId}>\n\n` +
          `Hey **${authorName}**! To keep this server clean and organized, Destiny commands run exclusively in <#${designatedChannelId}>.\n\n` +
          `👉 Head over to <#${designatedChannelId}> or DM Destiny directly to match privately!`
        )
      );
  }

  /**
   * Profile Already Verified Container
   */
  createAlreadyVerifiedContainer(user: UserProfile): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🛡️ Profile Officially Verified!\n\n` +
          `Your Destiny anonymous profile is already verified and in good standing!\n\n` +
          `• 🆔 **Destiny ID:** \`${user.destinyId}\`\n` +
          `• ⚧ **Verified Gender:** \`${user.gender}\`  🛡️\n` +
          `• 🌟 **Badge:** Displayed automatically to your chat partners\n\n` +
          `*You are all set! Click below to find an anonymous match.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Verification Request Pending Review Container
   */
  createVerificationPendingContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⏳ Verification Request Pending Review\n\n` +
          `You have an active verification request currently under review by our administration team.\n\n` +
          `• ⏱️ **Review Window:** Submissions are usually reviewed within 24 hours.\n` +
          `• 🔔 **Notification:** You will be alerted right here in DM once our staff reviews your proof.\n` +
          `• 💬 **Meanwhile:** You can continue matching and chatting normally!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Verification Request Successfully Submitted Container
   */
  createVerificationSubmittedContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 📩 Verification Request Submitted!\n\n` +
          `Your verification request has been securely delivered to the Destiny Admin Desk.\n\n` +
          `• 🛡️ **What's Next:** A moderator will review your submission.\n` +
          `• 🔔 **Status Updates:** We will notify you here in DM the moment your verified badge is granted.\n\n` +
          `*Thank you for helping keep Destiny authentic and trustworthy!*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Low Reputation Banned / Restricted Container
   */
  createLowReputationRestrictedContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Join discord.gg/eclairs')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.gg/eclairs')
        .setEmoji('🪐'),
      new ButtonBuilder()
        .setCustomId('destiny_btn_check_reputation')
        .setLabel('I Have Joined (Restore Reputation)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔄')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⛔ Destiny Access Restricted — Low Reputation\n\n` +
          `Your reputation has dropped below **10%**. You are restricted from using Destiny.\n\n` +
          `✨ **Regain your reputation by joining for forever:**\n` +
          `👉 **https://discord.gg/eclairs**\n\n` +
          `⚠️ *Notice: If you leave the server, your reputation will immediately go back to below 10.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Reputation Restored Container
   */
  createReputationRestoredContainer(): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_start')
        .setLabel('Start Match')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('destiny_btn_cancel_mood')
        .setLabel('Main Menu')
        .setEmoji('🪐')
        .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ✨ Reputation Restored!\n\n` +
          `Welcome to **Eclairs**! Your server membership has been verified, and your reputation score has been restored to **100%**.\n\n` +
          `• 🔓 **Status:** Active & Unrestricted\n` +
          `• ⭐ **Reputation Score:** 100%\n\n` +
          `⚠️ *Remember: If you leave discord.gg/eclairs, your reputation will automatically drop below 10 and your account will be restricted again.*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Account Restricted Container
   */
  createAccountRestrictedContainer(reason?: string): ContainerBuilder {
    return new ContainerBuilder()
      .setAccentColor(COLORS.DANGER)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⛔ Account Restricted\n\n` +
          `Your Destiny account is currently suspended.\n` +
          `**Reason:** ${reason || 'Policy violation'}`
        )
      );
  }

  /**
   * Server Privacy Redirect Container (Directs user to DM)
   */
  createDMRedirectContainer(authorName: string, botId?: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open Direct Message')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${botId || '1568212916304617557'}`)
        .setEmoji('💬')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🪐 Destiny — 100% Private in Direct Messages\n\n` +
          `Hey **${authorName}**! Destiny operates with zero server footprint directly in your **Direct Messages**.\n\n` +
          `• I have sent you a private message to get started.\n` +
          `• Or click **Open Direct Message** below to chat anonymously without anyone in this server knowing!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Prompt sent to partner asking if they want to reveal identities
   */
  createRevealPromptPartnerContainer(senderAvatar: string, senderPseudonym: string): ContainerBuilder {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_reveal_accept')
        .setLabel('Accept & Reveal')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨'),
      new ButtonBuilder()
        .setCustomId('btn_reveal_decline')
        .setLabel('Keep Anonymous')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 📜 Mutual Reveal Requested!\n\n` +
          `Your chat partner **${senderAvatar} ${senderPseudonym}** has requested a mutual identity reveal!\n\n` +
          `• Real Discord profiles are **only revealed if you both accept**.\n` +
          `• If you prefer to stay anonymous, your identity remains 100% hidden.\n\n` +
          `*Would you like to reveal each other's profiles, or continue chatting anonymously?*`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Sent to requester letting them know the prompt was delivered
   */
  createRevealWaitingContainer(): ContainerBuilder {
    return new ContainerBuilder()
      .setAccentColor(COLORS.GOLD)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⏳ Reveal Request Sent\n\n` +
          `You have requested a mutual identity reveal.\n` +
          `A private prompt has been delivered to your chat partner.\n\n` +
          `*If they accept, your profiles will be revealed here. If they prefer to stay anonymous, the chat continues safely without revealing.*`
        )
      );
  }

  /**
   * Sent to both users when mutual reveal is accepted!
   */
  createRevealSuccessContainer(partnerProfile: UserProfile, partnerDiscordId: string): ContainerBuilder {
    const interestsStr = partnerProfile.interests && partnerProfile.interests.length > 0
      ? partnerProfile.interests.map(i => `\`${i}\``).join(', ')
      : '*Not specified*';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_leave')
        .setLabel('End Chat')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚪')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎉 Mutual Identity Revealed!\n\n` +
          `You and your partner both agreed to reveal your real profiles!\n\n` +
          `• **Discord:** <@${partnerDiscordId}>\n` +
          `• **Destiny ID:** \`${partnerProfile.destinyId}\`\n` +
          `• **Age:** ${partnerProfile.age}\n` +
          `• **Gender:** ${partnerProfile.gender}\n` +
          `• **Interests:** ${interestsStr}\n` +
          `• **Reputation:** ⭐ ${partnerProfile.reputationScore}%\n\n` +
          `🎁 **+100 Connection XP Awarded!** You can continue chatting right here in DM or add each other directly on Discord.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  /**
   * Sent when reveal is declined
   */
  createRevealDeclinedContainer(isRequester: boolean): ContainerBuilder {
    const text = isRequester
      ? `# 🔒 Partner Preferred Anonymity\n\nYour chat partner chose to keep chatting anonymously for now.\nYour real identity remains completely protected! Keep enjoying the conversation.`
      : `# 🔒 Anonymity Preserved\n\nYou chose to keep chatting anonymously. Your real identity remains completely protected!`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('destiny_btn_leave')
        .setLabel('End Chat')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚪')
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DARK)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  // =========================================================================
  // LEGACY EMBEDS (Preserved for backward compatibility & testing)
  // =========================================================================

  createMatchFoundEmbed(room: RoomSession, isUser1: boolean, iceBreaker: string, sharedInterests: string[] = []): EmbedBuilder {
    const partnerPersona = isUser1 ? room.user2Pseudonym : room.user1Pseudonym;
    const partnerAvatar = isUser1 ? room.user2Avatar : room.user1Avatar;
    const myPersona = isUser1 ? room.user1Pseudonym : room.user2Pseudonym;

    return new EmbedBuilder()
      .setColor(COLORS.DESTINY_PURPLE)
      .setTitle(`✨ Destiny Connection Established! [${room.roomCode}]`)
      .setDescription(
        `You have been matched anonymously with **${partnerAvatar} ${partnerPersona}**!\n\n` +
        `Your anonymous persona is **${isUser1 ? room.user1Avatar : room.user2Avatar} ${myPersona}**.`
      )
      .setFooter({ text: 'Destiny • Privacy First Matchmaking' });
  }

  createProfileEmbed(user: UserProfile): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(`🪐 Destiny Anonymous Profile — ${user.destinyId}`)
      .setDescription(`Your global anonymous identity.`);
  }

  createRelayMessageContainer(
    senderPseudonym: string,
    senderAvatar: string,
    content: string,
    isPinned: boolean = false
  ): ContainerBuilder {
    const text = content && content.trim().length > 0 ? content.slice(0, 4000) : '*[Sent attachment]*';
    return new ContainerBuilder()
      .setAccentColor(isPinned ? COLORS.GOLD : COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${senderAvatar} ${senderPseudonym}**${isPinned ? ' 📌 [PINNED]' : ''}\n\n${text}`
        )
      );
  }

  createRelayMessageEmbed(senderPseudonym: string, senderAvatar: string, content: string, isPinned: boolean = false): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(isPinned ? COLORS.GOLD : COLORS.DARK)
      .setAuthor({
        name: `${senderAvatar} ${senderPseudonym}${isPinned ? ' 📌 [PINNED]' : ''}`,
      })
      .setTimestamp();

    if (content && content.trim().length > 0) {
      embed.setDescription(content.slice(0, 4000));
    } else {
      embed.setDescription('*[Sent attachment]*');
    }

    return embed;
  }

  createRevealActionRow(): ActionRowBuilder<ButtonBuilder> {
    const consentBtn = new ButtonBuilder()
      .setCustomId('btn_reveal_consent')
      .setLabel('Request Mutual Reveal')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📜');

    const leaveBtn = new ButtonBuilder()
      .setCustomId('destiny_btn_leave')
      .setLabel('End Chat')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🚪');

    return new ActionRowBuilder<ButtonBuilder>().addComponents(consentBtn, leaveBtn);
  }
}

export const embedService = new EmbedService();
