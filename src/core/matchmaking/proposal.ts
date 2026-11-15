import { MatchTicket, RoomSession, UserProfile } from '../types.js';
import { db } from '../../database/supabase.js';
import { stateStore } from '../../storage/state-store.js';
import { lockManager } from '../../storage/locks.js';
import { getDiscordClient } from '../../bot/client-registry.js';
import { sendCleanDmPanel } from '../../bot/dm-cleanup.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { COLORS } from '../../bot/embeds/index.js';
import { formatCustomEmojiText, resolveBotEmoji } from '../../bot/custom-emojis.js';
import { v4 as uuidv4 } from 'uuid';

export interface MatchProposal {
  id: string;
  ticketA: MatchTicket;
  ticketB: MatchTicket;
  sharedInterests: string[];
  userAAccepted: boolean;
  userBAccepted: boolean;
  expiresAt: number; // timestamp ms
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export class ProposalManager {
  private activeProposals: Map<string, MatchProposal> = new Map();

  /**
   * Create a new mutual proposal between ticketA and ticketB
   */
  async createProposal(
    ticketA: MatchTicket,
    ticketB: MatchTicket,
    sharedInterests: string[] = []
  ): Promise<MatchProposal | null> {
    const proposalId = `prop_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const proposal: MatchProposal = {
      id: proposalId,
      ticketA,
      ticketB,
      sharedInterests,
      userAAccepted: false,
      userBAccepted: false,
      expiresAt: Date.now() + 60_000, // 60 seconds
      status: 'pending',
    };

    this.activeProposals.set(proposalId, proposal);
    await stateStore.set(`proposal:${proposalId}`, JSON.stringify(proposal), 90);
    await stateStore.set(`user:proposal:${ticketA.userId}`, proposalId, 90);
    await stateStore.set(`user:proposal:${ticketB.userId}`, proposalId, 90);

    // Send proposal DMs to both users
    const client = getDiscordClient();
    if (!client || !client.isReady()) {
      return proposal;
    }

    const [userA, userB] = await Promise.all([
      client.users.fetch(ticketA.discordUserId).catch(() => null),
      client.users.fetch(ticketB.discordUserId).catch(() => null),
    ]);

    if (!userA || !userB) {
      await this.cancelProposal(proposalId, 'unreachable');
      return null;
    }

    const containerA = this.createProposalContainer(proposal, true);
    const containerB = this.createProposalContainer(proposal, false);

    await Promise.allSettled([
      sendCleanDmPanel(userA, { components: [containerA], flags: [MessageFlags.IsComponentsV2] }),
      sendCleanDmPanel(userB, { components: [containerB], flags: [MessageFlags.IsComponentsV2] }),
    ]);

    return proposal;
  }

  createProposalContainer(proposal: MatchProposal, isUserA: boolean): ContainerBuilder {
    const interests = proposal.sharedInterests.length > 0
      ? proposal.sharedInterests.map((i) => `\`${i}\``).join(', ')
      : '*Open Horizons*';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`destiny_proposal_accept_${proposal.id}`)
        .setLabel('Accept Match')
        .setStyle(ButtonStyle.Success)
        .setEmoji(resolveBotEmoji('✨')),
      new ButtonBuilder()
        .setCustomId(`destiny_proposal_pass_${proposal.id}`)
        .setLabel('Pass')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(resolveBotEmoji('✖️'))
    );

    return new ContainerBuilder()
      .setAccentColor(COLORS.DESTINY_PURPLE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          formatCustomEmojiText(
            `# ✨ Potential Anonymous Match Found!\n\n` +
            `Destiny has discovered an eligible connection for you:\n` +
            `• **Shared Interests**: ${interests}\n` +
            `• **Anonymity**: Identities remain 100% private & masked\n\n` +
            `⏳ *You have 60 seconds to accept. Chat begins only when BOTH partners accept!*`
          )
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(row);
  }

  async getProposal(proposalId: string): Promise<MatchProposal | null> {
    let p = this.activeProposals.get(proposalId);
    if (p) return p;
    const raw = await stateStore.get(`proposal:${proposalId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed) {
          this.activeProposals.set(proposalId, parsed);
          return parsed;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  async handleAccept(
    proposalId: string,
    userId: string
  ): Promise<{ status: 'accepted' | 'waiting' | 'expired' | 'invalid'; room?: RoomSession }> {
    return await lockManager.withLock(`lock:proposal:${proposalId}`, async () => {
      const proposal = await this.getProposal(proposalId);
      if (!proposal || proposal.status !== 'pending' || Date.now() > proposal.expiresAt) {
        return { status: 'expired' };
      }

      if (proposal.ticketA.userId === userId) {
        proposal.userAAccepted = true;
      } else if (proposal.ticketB.userId === userId) {
        proposal.userBAccepted = true;
      } else {
        return { status: 'invalid' };
      }

      // If both accepted -> create the room!
      if (proposal.userAAccepted && proposal.userBAccepted) {
        proposal.status = 'accepted';
        this.activeProposals.delete(proposalId);
        await stateStore.del(`proposal:${proposalId}`);
        await stateStore.del(`user:proposal:${proposal.ticketA.userId}`);
        await stateStore.del(`user:proposal:${proposal.ticketB.userId}`);

        const { matchmakingManager } = await import('./manager.js');
        const room = await matchmakingManager.createMatchRoom(
          proposal.ticketA,
          proposal.ticketB,
          proposal.sharedInterests
        );
        return { status: 'accepted', room };
      }

      // Still waiting for partner
      this.activeProposals.set(proposalId, proposal);
      await stateStore.set(`proposal:${proposalId}`, JSON.stringify(proposal), 60);
      return { status: 'waiting' };
    });
  }

  async handlePass(proposalId: string, userId: string): Promise<boolean> {
    return await lockManager.withLock(`lock:proposal:${proposalId}`, async () => {
      const proposal = await this.getProposal(proposalId);
      if (!proposal || proposal.status !== 'pending') return false;

      proposal.status = 'declined';
      this.activeProposals.delete(proposalId);
      await stateStore.del(`proposal:${proposalId}`);
      await stateStore.del(`user:proposal:${proposal.ticketA.userId}`);
      await stateStore.del(`user:proposal:${proposal.ticketB.userId}`);

      const passedIsUserA = proposal.ticketA.userId === userId;
      const partnerTicket = passedIsUserA ? proposal.ticketB : proposal.ticketA;

      // Requeue the partner who was waiting
      const partnerProfile = await db.getUserById(partnerTicket.userId, true);
      if (partnerProfile && !partnerProfile.isBanned) {
        const { matchmakingManager } = await import('./manager.js');
        await matchmakingManager.joinQueue(partnerProfile, partnerTicket.guildId).catch(() => {});

        // Notify partner
        const client = getDiscordClient();
        if (client && client.isReady()) {
          const partnerUser = await client.users.fetch(partnerTicket.discordUserId).catch(() => null);
          if (partnerUser) {
            const notice = new ContainerBuilder()
              .setAccentColor(COLORS.GOLD)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  formatCustomEmojiText(
                    '# 💫 Partner Passed\n\nYour potential match passed or timed out. You have been placed back at the top of the matchmaking queue!'
                  )
                )
              );
            sendCleanDmPanel(partnerUser, { components: [notice], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
          }
        }
      }

      return true;
    });
  }

  async cancelProposal(proposalId: string, reason = 'timeout'): Promise<void> {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    proposal.status = 'expired';
    this.activeProposals.delete(proposalId);
    await stateStore.del(`proposal:${proposalId}`);
    await stateStore.del(`user:proposal:${proposal.ticketA.userId}`);
    await stateStore.del(`user:proposal:${proposal.ticketB.userId}`);
  }
}

export const proposalManager = new ProposalManager();
