// ====================================================================
// DESTINY BOT — CORE TYPE DEFINITIONS & DOMAIN MODELS
// ====================================================================

export type Gender = 'male' | 'female' | 'non_binary' | 'other' | 'prefer_not_to_say';

export type GenderVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface UserProfile {
  id: string; // UUID in Supabase
  discordUserId: string;
  destinyId: string; // e.g. DESTINY-83921
  age: number;
  gender: Gender;
  genderVerified: boolean;
  genderVerificationStatus: GenderVerificationStatus;
  genderVerificationEvidence?: string | null;
  interests: string[];
  languages: string[];
  preferredGender: string[];
  minAgePref: number;
  maxAgePref: number;
  activeRoomId?: string | null;
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: string | null;
  reputationScore: number;
  bio?: string;
  matchIntent?: string;
  accolades?: ReputationAccolades;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationAccolades {
  greatListener: number;
  hilarious: number;
  respectful: number;
  insightful: number;
}

export type PraiseTag = 'great_listener' | 'hilarious' | 'respectful' | 'insightful';

export interface DestinyFriend {
  userId: string;
  destinyId: string;
  discordUserId: string;
  since: number;
}

export interface MatchTicket {
  userId: string;
  destinyId: string;
  discordUserId: string;
  age: number;
  gender: Gender;
  preferredGender: string[];
  minAgePref: number;
  maxAgePref: number;
  languages: string[];
  interests: string[];
  guildId?: string;
  queuedAt: number;
  mode?: 'text' | 'voice';
}

export interface RoomSession {
  id: string;
  roomCode: string;
  user1Id: string;
  user2Id: string;
  user1DiscordId: string;
  user2DiscordId: string;
  user1Pseudonym: string;
  user2Pseudonym: string;
  user1Avatar: string;
  user2Avatar: string;
  status: 'active' | 'ended' | 'paused';
  startedAt: string;
  endedAt?: string;
  endReason?: 'user_left' | 'timeout' | 'moderated' | 'inactivity';
  pinnedMessageId?: string;
  revealStatusUser1: {
    consented: boolean;
    revealedFields: ProfileField[];
  };
  revealStatusUser2: {
    consented: boolean;
    revealedFields: ProfileField[];
  };
  createdAt: string;
  updatedAt: string;
}

export type ProfileField = 'age' | 'gender' | 'interests' | 'destinyId' | 'discordTag';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderUserId: string;
  senderPseudonym: string;
  sanitizedContent: string;
  attachmentsMeta: Array<{
    url: string;
    name: string;
    contentType?: string;
    size?: number;
  }>;
  isPinned: boolean;
  flaggedForModeration: boolean;
  moderationReason?: string;
  createdAt: string;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reportedId: string;
  roomId?: string;
  category: 'harassment' | 'identity_leak' | 'inappropriate_content' | 'spam' | 'underage' | 'other';
  description: string;
  chatExcerpt: Array<{
    senderPseudonym: string;
    content: string;
    timestamp: string;
  }>;
  status: 'pending' | 'resolved' | 'dismissed';
  actionTaken: 'none' | 'warned' | 'temp_ban' | 'perma_ban';
  moderatorNotes?: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: string;
}

export interface NotificationSettings {
  userId: string;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "19:30"
  timeZone: string; // "Asia/Kolkata"
  quietHoursStart?: string;
  quietHoursEnd?: string;
  optOut: boolean;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  changes: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

export interface GuildSettings {
  guildId: string;
  guildName?: string;
  commandPrefix?: string;
  matchChannelId?: string | null;
  announcementsChannelId?: string | null;
  modLogChannelId?: string | null;
  crossServerEnabled?: boolean;
  voiceEnabled?: boolean;
  voiceCategoryId?: string | null;
  voiceDurationMinutes?: number;
  minAgeLimit?: number;
  allowedRoles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemMetrics {
  activeUsers: number;
  totalRegisteredUsers: number;
  activeRooms: number;
  queuedUsers: number;
  messagesLast24h: number;
  avgMatchmakingLatencyMs: number;
  shardsOnline: number;
  workersActive: number;
  supabaseConnected: boolean;
  runtimeStateConnected: boolean;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
}
