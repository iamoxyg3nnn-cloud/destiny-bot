import { db } from '../../database/supabase.js';
import { lockManager } from '../../storage/locks.js';

export class VerificationService {
  async submitVerification(
    userId: string,
    evidenceText: string
  ): Promise<{ success: boolean; message: string }> {
    const evidence = typeof evidenceText === 'string' ? evidenceText.trim() : '';
    if (!userId || evidence.length < 5 || evidence.length > 2000) {
      return { success: false, message: 'Verification evidence must contain 5–2,000 characters.' };
    }

    return lockManager.withLock(`lock:verification:${userId}`, async () => {
      const user = await db.getUserById(userId, true);
      if (!user) return { success: false, message: 'User not found.' };

      if (user.age < 18 || !user.gender || user.gender === 'prefer_not_to_say') {
        return { success: false, message: 'Complete your 18+ profile and select a gender before requesting verification.' };
      }
      if (user.genderVerified) {
        return { success: false, message: 'Your gender identity is already verified with a verified badge.' };
      }
      if (user.genderVerificationStatus === 'pending') {
        return { success: false, message: 'You already have a pending verification request under moderator review.' };
      }

      await db.createOrUpdateUser({
        discordUserId: user.discordUserId,
        genderVerificationStatus: 'pending',
        genderVerificationEvidence: evidence,
      });

      return {
        success: true,
        message: 'Verification request submitted. Our admin team will review it within 24 hours.',
      };
    });
  }

  async reviewVerification(
    adminId: string,
    userId: string,
    approved: boolean,
    notes?: string
  ): Promise<{ success: boolean; message: string; auditWarning?: boolean; user?: import('../types.js').UserProfile }> {
    if (typeof approved !== 'boolean') {
      return { success: false, message: 'A valid approve/reject decision is required.' };
    }

    const outcome = await lockManager.withLock(`lock:verification:${userId}`, async () => {
      const user = await db.getUserById(userId, true);
      if (!user) return { success: false as const, message: 'User not found.' };
      if (user.genderVerificationStatus !== 'pending') {
        return { success: false as const, message: 'This user has no pending verification request to review.' };
      }

      const updatedUser = await db.createOrUpdateUser({
        discordUserId: user.discordUserId,
        genderVerified: approved,
        genderVerificationStatus: approved ? 'verified' : 'rejected',
        genderVerificationEvidence: null,
      });
      let auditWarning = false;
      try {
        await db.logAdminAction(
          adminId,
          approved ? 'APPROVE_VERIFICATION' : 'REJECT_VERIFICATION',
          'USER',
          userId,
          { approved, notes }
        );
      } catch (error: any) {
        auditWarning = true;
        console.error('[Verification] Decision saved but audit log failed:', error?.message || error);
      }

      return {
        success: true as const,
        message: approved ? 'User gender verification approved.' : 'User gender verification rejected.',
        user: updatedUser || user,
        auditWarning,
      };
    });

    if (!outcome.success) return outcome;

    // Notification delivery is secondary; it must not roll back a recorded
    // moderation decision or make the verification review report a failure.
    try {
      // Cloudflare Worker requests do not share the long-lived Discord client
      // process; persist the moderation decision there and leave notifications
      // to the bot runner.
      if (process.env.CLOUDFLARE_WORKER === '1') return { success: true, message: outcome.message };
      const { bot } = await import('../../bot/index.js');
      if (bot.client?.isReady() && outcome.user.discordUserId) {
        const discordUser = await bot.client.users.fetch(outcome.user.discordUserId).catch(() => null);
        if (discordUser) {
          const { embedService, COLORS } = await import('../../bot/embeds/index.js');
          const { formatCustomEmojiText } = await import('../../bot/custom-emojis.js');
          const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = await import('discord.js');
          const notice = approved
            ? embedService.createAlreadyVerifiedContainer(outcome.user)
            : new ContainerBuilder()
                .setAccentColor(COLORS.DANGER)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    formatCustomEmojiText(`# ❌ Verification Update\n\n`) +
                    `Your verification request could not be approved at this time.\n\n` +
                    `• **Reason/Notes:** ${(notes || 'Evidence was unclear or incomplete.').slice(0, 1000)}\n` +
                    `• **Next Steps:** You may re-apply anytime by clicking **Get Verified** in your profile menu with clearer proof.`
                  )
                );
          await discordUser.send({ components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch((error) => {
            console.warn('[Verification] Decision saved but DM notification failed:', error?.message || error);
          });
        }
      }
    } catch (error: any) {
      console.warn('[Verification] Decision saved but notification setup failed:', error?.message || error);
    }

    return { success: true, message: outcome.message };
  }
}

export const verificationService = new VerificationService();
