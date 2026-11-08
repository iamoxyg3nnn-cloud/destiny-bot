import { db } from '../../database/supabase.js';
import { GenderVerificationStatus } from '../types.js';

export class VerificationService {
  async submitVerification(
    userId: string,
    evidenceText: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await db.getUserById(userId);
    if (!user) return { success: false, message: 'User not found.' };

    if (user.genderVerified) {
      return { success: false, message: 'Your gender identity is already verified with a verified badge.' };
    }

    if (user.genderVerificationStatus === 'pending') {
      return { success: false, message: 'You already have a pending verification request under moderator review.' };
    }

    user.genderVerificationStatus = 'pending';
    user.genderVerificationEvidence = evidenceText;
    await db.createOrUpdateUser(user);

    return {
      success: true,
      message: 'Verification request submitted. Our admin team will review it within 24 hours.',
    };
  }

  async reviewVerification(
    adminId: string,
    userId: string,
    approved: boolean,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await db.getUserById(userId);
    if (!user) return { success: false, message: 'User not found.' };

    user.genderVerified = approved;
    user.genderVerificationStatus = approved ? 'verified' : 'rejected';
    await db.createOrUpdateUser(user);

    await db.logAdminAction(
      adminId,
      approved ? 'APPROVE_VERIFICATION' : 'REJECT_VERIFICATION',
      'USER',
      userId,
      { approved, notes }
    );

    // Notify user in DM via Discord
    try {
      const { bot } = await import('../../bot/index.js');
      if (bot.client && bot.client.isReady() && user.discordUserId) {
        const discordUser = await bot.client.users.fetch(user.discordUserId).catch(() => null);
        if (discordUser) {
          const { embedService, COLORS } = await import('../../bot/embeds/index.js');
          const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = await import('discord.js');
          const notice = approved
            ? embedService.createAlreadyVerifiedContainer(user)
            : new ContainerBuilder()
                .setAccentColor(COLORS.DANGER)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    `# ❌ Verification Update\n\n` +
                    `Your verification request could not be approved at this time.\n\n` +
                    `• **Reason/Notes:** ${notes || 'Evidence was unclear or incomplete.'}\n` +
                    `• **Next Steps:** You may re-apply anytime by clicking **Get Verified** in your profile menu with clearer proof.`
                  )
                );
          await discordUser.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
        }
      }
    } catch {}

    return {
      success: true,
      message: approved ? 'User gender verification approved.' : 'User gender verification rejected.',
    };
  }
}

export const verificationService = new VerificationService();
