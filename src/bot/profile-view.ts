import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { db } from '../database/supabase.js';
import { profileCardGenerator, LiveProfileStats } from '../core/profile/card-generator.js';
import { UserProfile } from '../core/types.js';

export interface ProfileViewer {
  id: string;
  displayName?: string | null;
  username?: string;
  displayAvatarURL: (options?: { extension?: 'png' | 'jpg' | 'webp'; size?: number }) => string;
}

export function isProfileComplete(user: UserProfile | null | undefined): boolean {
  return Boolean(
    user &&
      user.age >= 18 &&
      user.gender &&
      user.gender !== 'prefer_not_to_say' &&
      user.gender.trim().length > 0
  );
}

export function getDisplayName(viewer: ProfileViewer, member?: unknown): string {
  if (member && typeof member === 'object' && 'displayName' in member) {
    const name = (member as { displayName?: string }).displayName;
    if (name) return name;
  }
  return viewer.displayName || viewer.username || 'Midnight Wolf';
}

export async function buildProfileStats(
  user: UserProfile,
  viewer: ProfileViewer,
  member?: unknown
): Promise<LiveProfileStats> {
  const userRooms = await db.getUserRooms(user.id).catch(() => []);
  let totalMinutes = 0;

  for (const room of userRooms) {
    if (room.startedAt && room.endedAt) {
      const diff = (new Date(room.endedAt).getTime() - new Date(room.startedAt).getTime()) / 60000;
      if (diff > 0) totalMinutes += diff;
    }
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const chatHoursText = hours > 0 || mins > 0 ? `${hours}h ${mins}m` : '0h 00m';

  return {
    sessionsCount: userRooms.length,
    chatHoursText,
    reputationPercent: user.reputationScore ?? 100,
    personaName: getDisplayName(viewer, member),
    avatarUrl: viewer.displayAvatarURL({ extension: 'png', size: 256 }),
    timezone: 'UTC+05:30',
    matchIntent: user.matchIntent,
    bio: user.bio,
    equippedBadges: user.equippedBadges,
  };
}

export async function buildProfileCard(
  user: UserProfile,
  viewer: ProfileViewer,
  member?: unknown
): Promise<{ attachment: AttachmentBuilder; stats: LiveProfileStats }> {
  const stats = await buildProfileStats(user, viewer, member);
  const buffer = await profileCardGenerator.generateCardPng(user, stats);

  return {
    attachment: new AttachmentBuilder(buffer, {
      name: 'destiny_profile.png',
    }),
    stats,
  };
}

export function createProfileActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('destiny_btn_profile')
      .setLabel('Edit Profile')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('destiny_btn_wardrobe')
      .setLabel('Wardrobe')
      .setEmoji('👔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('destiny_btn_start')
      .setLabel('Find Match')
      .setEmoji('✨')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('destiny_btn_wallet')
      .setLabel('Destiny Vault')
      .setEmoji('🪙')
      .setStyle(ButtonStyle.Secondary)
  );
}
