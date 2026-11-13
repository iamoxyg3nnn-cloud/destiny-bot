import { formatCustomEmojiText } from './custom-emojis.js';
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import { embedService, COLORS } from './embeds/index.js';
import { ProfileField, RoomSession, UserProfile } from '../core/types.js';

/**
 * The reveal payload shape produced by the reveal service. It only ever
 * contains the fields that BOTH partners explicitly agreed to exchange.
 */
export type RevealPayload = Partial<UserProfile> & { discordTag?: string };

export interface RevealPair {
  /** Revealed payload belonging to the user who triggered the interaction. */
  mine: RevealPayload;
  /** Revealed payload belonging to the other participant. */
  partner: RevealPayload;
}

/**
 * Splits a reveal result into the payload owned by the current user and the
 * payload owned by their partner. The reveal service always returns the
 * payloads keyed by room slot (user1 / user2), so we map them onto the
 * perspective of the caller.
 */
export function resolveRevealPair(
  room: Pick<RoomSession, 'user1Id' | 'user2Id'> | null | undefined,
  userId: string,
  result: { user1Data?: RevealPayload; user2Data?: RevealPayload }
): RevealPair {
  // Without a room we cannot tell the slots apart, so we fall back to the
  // caller's own slot (user1) and let the caller fall back to a safe card.
  const isUser1 = room ? room.user1Id === userId : true;

  return {
    mine: (isUser1 ? result.user1Data : result.user2Data) ?? {},
    partner: (isUser1 ? result.user2Data : result.user1Data) ?? {},
  };
}

/**
 * Builds the "reveal complete" card showing exactly what was shared.
 * Falls back to a generic summary card when nothing ended up being shared.
 */
export function createRevealResultContainer(
  revealed: RevealPayload,
  agreedFields: ProfileField[] = []
): ContainerBuilder {
  if (!revealed || Object.keys(revealed).length === 0) {
    return createRevealEmptyContainer(agreedFields);
  }

  return embedService.createRevealSuccessContainer(revealed);
}

/**
 * Fallback card used when no fields ended up being shared.
 */
export function createRevealEmptyContainer(agreedFields: ProfileField[] = []): ContainerBuilder {
  const agreedStr = agreedFields.length > 0
    ? `**Mutually Agreed Revealed Fields**:\n${describeAgreedFields(agreedFields)}\n\n`
    : '';

  return new ContainerBuilder()
    .setAccentColor(COLORS.SUCCESS)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        formatCustomEmojiText(`# 🎉 Mutual Profile Reveal Complete!\n\n`) +
        `Both partners have consented to exchange information!\n\n` +
        `${agreedStr}` +
        `*No common fields were consented to, so no profile details were shared.*\n\n` +
        formatCustomEmojiText(`🔒 *Any unagreed fields and Discord usernames remain strictly protected.*`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

/**
 * Human readable list of the mutually agreed field names.
 */
export function describeAgreedFields(agreedFields: ProfileField[]): string {
  if (!agreedFields || agreedFields.length === 0) {
    return '*No common fields were consented to.*';
  }
  return agreedFields.map((f) => `• \`${f}\``).join('\n');
}
