import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import crypto from 'crypto';
import { 
  UserProfile, 
  RoomSession, 
  ChatMessage, 
  CoinTransaction, 
  ReportItem, 
  UserBlock, 
  ShopItem, 
  NotificationSettings, 
  AdminAuditLog,
  GuildSettings
} from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../redis/client.js';

export class DatabaseService {
  private client: SupabaseClient | null = null;
  private isMockMode: boolean = false;

  // High-performance in-memory ultra-low-latency caches
  private userCache: Map<string, { user: UserProfile; expires: number }> = new Map();
  private blockListCache: Map<string, { ids: Set<string>; expires: number }> = new Map();
  private discordUserCache: Map<string, { user: UserProfile; expires: number }> = new Map();
  private guildSettingsCache: Map<string, { settings: GuildSettings | null; expires: number }> = new Map();

  // In-memory fallbacks for testing and offline resilience
  public mockUsers: Map<string, UserProfile> = new Map();
  public mockRooms: Map<string, RoomSession> = new Map();
  public mockMessages: ChatMessage[] = [];
  public mockTransactions: CoinTransaction[] = [];
  public mockReports: Map<string, ReportItem> = new Map();
  public mockBlocks: UserBlock[] = [];
  public mockShopItems: Map<string, ShopItem> = new Map();
  public mockInventory: Map<string, string[]> = new Map(); // userId -> itemId[]
  public mockAuditLogs: AdminAuditLog[] = [];
  public mockNotifications: Map<string, NotificationSettings> = new Map();

  constructor() {
    this.seedMockShopItems();
    if (
      config.SUPABASE_URL && 
      config.SUPABASE_SERVICE_ROLE_KEY && 
      !config.SUPABASE_URL.includes('mock-supabase')
    ) {
      try {
        this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
        this.isMockMode = false;
      } catch (err) {
        console.warn('⚠️ Could not connect to remote Supabase, falling back to local memory store.', err);
        this.isMockMode = true;
      }
    } else {
      this.isMockMode = true;
    }

    if (config.NODE_ENV === 'production' && this.isMockMode) {
      throw new Error('Supabase is required in production; refusing to start with the in-memory mock database.');
    }
  }

  private invalidateUserCaches(userId: string): void {
    this.userCache.delete(userId);
    for (const [discordId, cached] of this.discordUserCache.entries()) {
      if (cached.user.id === userId) this.discordUserCache.delete(discordId);
    }
  }

  private seedMockShopItems(): void {
    const defaultItems: ShopItem[] = [
      { id: 'badge_verified_vip', name: 'Destiny VIP Badge', description: 'Displays an exclusive VIP icon on your anonymous profile banner.', category: 'badge', price: 500, icon: '👑', metadata: { color: '#FFD700' }, isActive: true },
      { id: 'badge_star_wanderer', name: 'Star Wanderer', description: 'Mark of an explorer across 50+ anonymous conversations.', category: 'badge', price: 250, icon: '⭐', metadata: { color: '#7289DA' }, isActive: true },
      { id: 'badge_mystic_aura', name: 'Mystic Aura', description: 'Glowing celestial aura badge for your profile card.', category: 'badge', price: 400, icon: '🔮', metadata: { color: '#9B59B6' }, isActive: true },
      { id: 'badge_streak_titan', name: '7D Streak Master Insignia', description: 'Displays verified 7-day streak insignia on your profile card.', category: 'badge', price: 300, icon: '🔥', metadata: { badge: '7D STREAK' }, isActive: true },
      { id: 'badge_titan_1k', name: 'Titan Supporter Insignia', description: 'Exclusive commemorative rack insignia for Destiny Titans.', category: 'badge', price: 500, icon: '⚡', metadata: { badge: 'TITAN 1K' }, isActive: true },
      { id: 'title_cosmic_friend', name: 'Title: Cosmic Soul', description: 'Unlocks the title Cosmic Soul next to your anonymous alias.', category: 'title', price: 300, icon: '🌌', metadata: { title: 'Cosmic Soul' }, isActive: true },
      { id: 'title_night_owl', name: 'Title: Night Owl', description: 'For late-night conversationalists under the midnight sky.', category: 'title', price: 200, icon: '🦉', metadata: { title: 'Night Owl' }, isActive: true },
      { id: 'card_instant_reveal', name: 'Identity Reveal Token', description: 'Allows you to initiate a mutual reveal sequence without coin cost.', category: 'reveal_card', price: 150, icon: '📜', metadata: { consumable: true }, isActive: true },
      { id: 'theme_cyber_damask', name: 'Cyber Damask Skin', description: 'High-contrast obsidian and damask steel pattern card skin.', category: 'theme', price: 450, icon: '🛡️', metadata: { theme: 'cyber_damask' }, isActive: true },
      { id: 'theme_frost_glaze', name: 'Frost Glaze Skin', description: 'Frosted titanium minimalist aesthetic with razor hairlines.', category: 'theme', price: 550, icon: '❄️', metadata: { theme: 'frost_glaze' }, isActive: true },
      { id: 'theme_holographic_plat', name: 'Holographic Platinum', description: 'Prestige platinum finish with iridescent micro-reflections.', category: 'theme', price: 800, icon: '💎', metadata: { theme: 'holographic_plat' }, isActive: true },
    ];
    for (const item of defaultItems) {
      this.mockShopItems.set(item.id, item);
    }
  }

  public isUsingMock(): boolean {
    return this.isMockMode;
  }

  /** Verify that configured Supabase credentials can reach the expected schema. */
  async assertConnection(): Promise<void> {
    if (this.isMockMode || !this.client) {
      if (config.NODE_ENV === 'production') {
        throw new Error('Supabase is unavailable; production cannot use the in-memory mock database.');
      }
      return;
    }
    const { error } = await this.client.from('users').select('id').limit(1);
    if (error) throw new Error(`Supabase connectivity/schema check failed: ${error.message}`);
  }

  private async enrichProfileExtensions(user: UserProfile): Promise<UserProfile> {
    // Profile extensions are first-class users-table columns; Redis is not an
    // authority for profile fields because it can outlive an intentional clear.
    return user;
  }

  // ---------------- USER OPERATIONS ----------------
  async getUserByDiscordId(discordUserId: string, forceFresh = false): Promise<UserProfile | null> {
    if (!forceFresh) {
      const cached = this.discordUserCache.get(discordUserId);
      if (cached && cached.expires > Date.now()) {
        return await this.enrichProfileExtensions({ ...cached.user });
      }
    }

    if (this.isMockMode || !this.client) {
      for (const user of this.mockUsers.values()) {
        if (user.discordUserId === discordUserId) return await this.enrichProfileExtensions({ ...user });
      }
      return null;
    }

    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load user: ${error.message}`);
    if (!data) return null;
    const user = this.mapUser(data);
    this.discordUserCache.set(discordUserId, { user, expires: Date.now() + 60_000 });
    this.userCache.set(user.id, { user, expires: Date.now() + 60_000 });
    return await this.enrichProfileExtensions(user);
  }

  async getUserById(id: string, forceFresh = false): Promise<UserProfile | null> {
    if (!forceFresh) {
      const cached = this.userCache.get(id);
      if (cached && cached.expires > Date.now()) {
        return await this.enrichProfileExtensions({ ...cached.user });
      }
    }

    if (this.isMockMode || !this.client) {
      const user = this.mockUsers.get(id);
      return user ? await this.enrichProfileExtensions({ ...user }) : null;
    }

    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load Discord user: ${error.message}`);
    if (!data) return null;
    const user = this.mapUser(data);
    this.userCache.set(user.id, { user, expires: Date.now() + 60_000 });
    this.discordUserCache.set(user.discordUserId, { user, expires: Date.now() + 60_000 });
    return await this.enrichProfileExtensions(user);
  }

  async getUserByDestinyId(destinyId: string): Promise<UserProfile | null> {
    if (this.isMockMode || !this.client) {
      for (const user of this.mockUsers.values()) {
        if (user.destinyId === destinyId) return await this.enrichProfileExtensions({ ...user });
      }
      return null;
    }

    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('destiny_id', destinyId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load user by Destiny ID: ${error.message}`);
    if (!data) return null;
    return await this.enrichProfileExtensions(this.mapUser(data));
  }

  /**
   * Generates a 6-digit alphanumeric Destiny ID guaranteed not to overlap with any existing user in Supabase
   */
  async generateUniqueDestinyId(): Promise<string> {
    const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    while (true) {
      const bytes = crypto.randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CHARS[bytes[i] % CHARS.length];
      }
      if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) continue;

      if (!this.client || this.isMockMode) {
        const inMock = Array.from(this.mockUsers.values()).some((u) => u.destinyId === code);
        if (!inMock) return code;
        continue;
      }

      const { data, error } = await this.client
        .from('users')
        .select('id')
        .eq('destiny_id', code)
        .maybeSingle();
      if (error) throw new Error(`Failed to check Destiny ID uniqueness: ${error.message}`);

      if (!data) {
        return code;
      }
    }
  }

  async createOrUpdateUser(user: Partial<UserProfile> & { discordUserId: string }): Promise<UserProfile> {
    const now = new Date().toISOString();
    const existing = await this.getUserByDiscordId(user.discordUserId, true);

    if (existing) {
      const updated: UserProfile = {
        ...existing,
        ...user,
        updatedAt: now,
      };

      if (this.isMockMode || !this.client) {
        this.mockUsers.set(existing.id, updated);
        return updated;
      }

      const updatePayload: Record<string, any> = {
        age: updated.age,
        gender: updated.gender,
        gender_verified: updated.genderVerified,
        gender_verification_status: updated.genderVerificationStatus,
        gender_verification_evidence: updated.genderVerificationEvidence,
        interests: updated.interests,
        languages: updated.languages,
        preferred_gender: updated.preferredGender,
        min_age_pref: updated.minAgePref,
        max_age_pref: updated.maxAgePref,
        streak_count: updated.streakCount,
        last_daily_claim: updated.lastDailyClaim,
        active_room_id: updated.activeRoomId,
        is_banned: updated.isBanned,
        ban_reason: updated.banReason,
        reputation_score: updated.reputationScore,
        last_active_at: now,
        updated_at: now,
      };
      if (user.bio !== undefined) updatePayload.bio = user.bio;
      if (user.matchIntent !== undefined) updatePayload.match_intent = user.matchIntent;
      if (user.cardTheme !== undefined) updatePayload.card_theme = user.cardTheme;
      if (user.equippedBadges !== undefined) updatePayload.equipped_badges = user.equippedBadges;

      const { data, error } = await this.client
        .from('users')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error || !data) throw new Error(`Failed to update user: ${error?.message}`);
      const mapped = this.mapUser(data);
      this.userCache.set(mapped.id, { user: mapped, expires: Date.now() + 60_000 });
      this.discordUserCache.set(mapped.discordUserId, { user: mapped, expires: Date.now() + 60_000 });
      return await this.enrichProfileExtensions(mapped);
    }

    // New user
    const newUser: UserProfile = {
      id: uuidv4(),
      discordUserId: user.discordUserId,
      destinyId: user.destinyId || (await this.generateUniqueDestinyId()),
      age: user.age || 18,
      gender: user.gender || 'prefer_not_to_say',
      genderVerified: false,
      genderVerificationStatus: 'unverified',
      interests: user.interests || [],
      languages: user.languages || ['en'],
      preferredGender: user.preferredGender || ['any'],
      minAgePref: user.minAgePref || 18,
      maxAgePref: user.maxAgePref || 99,
      destinyCoins: 100, // Initial welcome grant
      streakCount: 0,
      connectionTier: 'Strangers',
      activeRoomId: null,
      isBanned: false,
      reputationScore: 100,
      bio: user.bio,
      matchIntent: user.matchIntent,
      cardTheme: user.cardTheme,
      equippedBadges: user.equippedBadges,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isMockMode || !this.client) {
      this.mockUsers.set(newUser.id, newUser);
      if (newUser.destinyCoins > 0) {
        this.mockTransactions.push({
          id: uuidv4(),
          userId: newUser.id,
          amount: newUser.destinyCoins,
          balanceAfter: newUser.destinyCoins,
          type: 'welcome_bonus',
          referenceId: `welcome:${newUser.id}`,
          metadata: { source: 'signup' },
          createdAt: now,
        });
      }
      return newUser;
    }

    const { data, error } = await this.client
      .from('users')
      .insert({
        id: newUser.id,
        discord_user_id: newUser.discordUserId,
        destiny_id: newUser.destinyId,
        age: newUser.age,
        gender: newUser.gender,
        gender_verified: newUser.genderVerified,
        gender_verification_status: newUser.genderVerificationStatus,
        gender_verification_evidence: newUser.genderVerificationEvidence,
        interests: newUser.interests,
        languages: newUser.languages,
        preferred_gender: newUser.preferredGender,
        min_age_pref: newUser.minAgePref,
        max_age_pref: newUser.maxAgePref,
        destiny_coins: newUser.destinyCoins,
        streak_count: newUser.streakCount,
        connection_tier: newUser.connectionTier,
        reputation_score: newUser.reputationScore,
        last_active_at: now,
        bio: newUser.bio,
        match_intent: newUser.matchIntent,
        card_theme: newUser.cardTheme,
        equipped_badges: newUser.equippedBadges,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to insert user: ${error?.message}`);
    const mapped = this.mapUser(data);
    this.userCache.set(mapped.id, { user: mapped, expires: Date.now() + 60_000 });
    this.discordUserCache.set(mapped.discordUserId, { user: mapped, expires: Date.now() + 60_000 });

    return mapped;
  }

  async clearActiveRoom(userId: string, expectedRoomId?: string): Promise<boolean> {
    if (!expectedRoomId) return false;
    if (this.isMockMode || !this.client) {
      const user = this.mockUsers.get(userId);
      if (!user || user.activeRoomId !== expectedRoomId) return false;
      user.activeRoomId = null;
      return true;
    }

    const { data, error } = await this.client
      .from('users')
      .update({ active_room_id: null, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('active_room_id', expectedRoomId)
      .select('id');
    if (error) throw new Error(`Failed to clear stale active room reference: ${error.message}`);
    const cleared = Boolean(data && data.length > 0);
    this.userCache.delete(userId);
    const user = await this.getUserById(userId, true);
    if (user) {
      this.userCache.set(userId, { user, expires: Date.now() + 60_000 });
      this.discordUserCache.set(user.discordUserId, { user, expires: Date.now() + 60_000 });
    }
    try {
      await redis.delIfValue(`user:active_room:${userId}`, expectedRoomId);
    } catch (cacheError) {
      console.warn('[Database] Cleared stale room reference but Redis cleanup failed:', cacheError);
    }
    return cleared;
  }

  async getAllUsers(limit: number = 100, offset: number = 0): Promise<UserProfile[]> {
    if (this.isMockMode || !this.client) {
      return Array.from(this.mockUsers.values()).slice(offset, offset + limit);
    }
    const safeLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.trunc(limit))) : 100;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);
    if (error) throw new Error(`Failed to load users: ${error.message}`);
    return (data || []).map(this.mapUser);
  }
  async getNotificationSettingsForUsers(userIds: string[]): Promise<Map<string, NotificationSettings>> {
    const result = new Map<string, NotificationSettings>();
    if (userIds.length === 0) return result;

    if (this.isMockMode || !this.client) {
      for (const userId of userIds) {
        const settings = this.mockNotifications.get(userId);
        if (settings) result.set(userId, { ...settings });
      }
      return result;
    }

    const { data, error } = await this.client
      .from('notification_settings')
      .select('*')
      .in('user_id', userIds);
    if (error) throw new Error(`Failed to load notification settings: ${error.message}`);

    for (const row of data || []) {
      result.set(row.user_id, {
        userId: row.user_id,
        dailyReminderEnabled: row.daily_reminder_enabled,
        dailyReminderTime: row.daily_reminder_time,
        timeZone: row.time_zone,
        quietHoursStart: row.quiet_hours_start || undefined,
        quietHoursEnd: row.quiet_hours_end || undefined,
        optOut: row.opt_out,
      });
    }
    return result;
  }


  // ---------------- ATOMIC COIN TRANSACTIONS ----------------
  async executeCoinTransaction(
    userId: string,
    amount: number,
    type: CoinTransaction['type'],
    referenceId: string,
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; newBalance: number; error?: string; txId?: string }> {
    if (!Number.isSafeInteger(amount) || amount === 0 || !referenceId || referenceId.trim().length === 0 || referenceId.length > 128) {
      return { success: false, newBalance: 0, error: 'INVALID_TRANSACTION' };
    }

    if (this.isMockMode || !this.client) {
      // Replays are idempotent only when every transaction identity field matches.
      const existingTx = this.mockTransactions.find((t) => t.referenceId === referenceId);
      if (existingTx) {
        const sameOperation = existingTx.userId === userId && existingTx.amount === amount && existingTx.type === type;
        return sameOperation
          ? { success: true, newBalance: existingTx.balanceAfter, txId: existingTx.id }
          : { success: false, newBalance: 0, error: 'IDEMPOTENCY_KEY_REUSED' };
      }

      const user = this.mockUsers.get(userId);
      if (!user) {
        return { success: false, newBalance: 0, error: 'USER_NOT_FOUND' };
      }

      const newBalance = user.destinyCoins + amount;
      if (newBalance < 0) {
        return { success: false, newBalance: user.destinyCoins, error: 'INSUFFICIENT_FUNDS' };
      }

      user.destinyCoins = newBalance;
      user.updatedAt = new Date().toISOString();
      const txId = uuidv4();
      const tx: CoinTransaction = {
        id: txId,
        userId,
        amount,
        balanceAfter: newBalance,
        type,
        referenceId,
        metadata,
        createdAt: new Date().toISOString(),
      };
      this.mockTransactions.push(tx);
      this.invalidateUserCaches(userId);
      return { success: true, newBalance, txId };
    }

    // Call Supabase Stored Procedure
    const { data, error } = await this.client.rpc('execute_coin_transaction', {
      p_user_id: userId,
      p_amount: amount,
      p_type: type,
      p_reference_id: referenceId,
      p_metadata: metadata,
    });

    if (error || !data || data.length === 0) {
      return { success: false, newBalance: 0, error: error?.message || 'TRANSACTION_FAILED' };
    }

    const res = data[0];
    if (res.success) this.invalidateUserCaches(userId);
    return {
      success: res.success,
      newBalance: Number(res.new_balance),
      error: res.error_message,
      txId: res.transaction_id,
    };
  }

  /**
   * Atomically transfers Destiny Coins between two users. The production
   * implementation is a single database RPC; the mock implementation keeps
   * both ledger entries and balances in one synchronous critical section.
   */
  async transferCoins(
    fromUserId: string,
    toUserId: string,
    amount: number,
    referenceId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (fromUserId === toUserId) return { success: false, error: 'CANNOT_TRANSFER_TO_SELF' };
    if (!Number.isSafeInteger(amount) || amount <= 0) return { success: false, error: 'INVALID_AMOUNT' };
    if (!referenceId || referenceId.trim().length === 0 || referenceId.length > 115) {
      return { success: false, error: 'INVALID_REFERENCE_ID' };
    }

    const debitRef = `transfer:out:${referenceId}`;
    const creditRef = `transfer:in:${referenceId}`;

    if (this.isMockMode || !this.client) {
      const existingDebit = this.mockTransactions.find((tx) => tx.referenceId === debitRef);
      const existingCredit = this.mockTransactions.find((tx) => tx.referenceId === creditRef);
      if (existingDebit || existingCredit) {
        const validReplay = !!existingDebit && !!existingCredit &&
          existingDebit.userId === fromUserId && existingDebit.amount === -amount && existingDebit.type === 'transfer_sent' &&
          existingCredit.userId === toUserId && existingCredit.amount === amount && existingCredit.type === 'transfer_received';
        return validReplay ? { success: true } : { success: false, error: 'IDEMPOTENCY_KEY_REUSED' };
      }

      const from = this.mockUsers.get(fromUserId);
      const to = this.mockUsers.get(toUserId);
      if (!from || !to) return { success: false, error: 'USER_NOT_FOUND' };
      if (from.destinyCoins < amount) return { success: false, error: 'INSUFFICIENT_FUNDS' };
      if (!Number.isSafeInteger(to.destinyCoins + amount)) return { success: false, error: 'BALANCE_LIMIT_EXCEEDED' };

      const now = new Date().toISOString();
      from.destinyCoins -= amount;
      from.updatedAt = now;
      to.destinyCoins += amount;
      to.updatedAt = now;
      this.mockTransactions.push(
        { id: uuidv4(), userId: fromUserId, amount: -amount, balanceAfter: from.destinyCoins, type: 'transfer_sent', referenceId: debitRef, metadata: { toUserId }, createdAt: now },
        { id: uuidv4(), userId: toUserId, amount, balanceAfter: to.destinyCoins, type: 'transfer_received', referenceId: creditRef, metadata: { fromUserId }, createdAt: now },
      );
      this.userCache.delete(fromUserId);
      this.userCache.delete(toUserId);
      return { success: true };
    }

    const { data, error } = await this.client.rpc('transfer_coins', {
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_amount: amount,
      p_reference_id: referenceId,
    });
    if (error || !data || data.length === 0) {
      return { success: false, error: error?.message || 'TRANSFER_FAILED' };
    }
    const success = Boolean(data[0].success);
    if (success) {
      this.userCache.delete(fromUserId);
      this.userCache.delete(toUserId);
      for (const [discordId, cached] of this.discordUserCache.entries()) {
        if (cached.user.id === fromUserId || cached.user.id === toUserId) this.discordUserCache.delete(discordId);
      }
    }
    return { success, error: data[0].error_message || undefined };
  }

  // ---------------- ROOM OPERATIONS ----------------
  async createRoom(room: Omit<RoomSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<RoomSession> {
    if (room.user1Id === room.user2Id) throw new Error('Cannot create a room with the same user twice.');

    const id = uuidv4();
    const now = new Date().toISOString();
    const newRoom: RoomSession = { ...room, id, createdAt: now, updatedAt: now };

    if (this.isMockMode || !this.client) {
      const u1 = this.mockUsers.get(room.user1Id);
      const u2 = this.mockUsers.get(room.user2Id);
      if (!u1 || !u2) throw new Error('Cannot create a room for an unknown user.');
      if (u1.activeRoomId || u2.activeRoomId) throw new Error('A participant already belongs to an active room.');
      this.mockRooms.set(id, newRoom);
      u1.activeRoomId = id;
      u2.activeRoomId = id;
      return newRoom;
    }

    // The RPC locks both user rows in a stable order and inserts the room plus
    // both active_room_id references in one database transaction.
    const { data, error } = await this.client.rpc('create_room_with_users', {
      p_id: id,
      p_room_code: newRoom.roomCode,
      p_user1_id: newRoom.user1Id,
      p_user2_id: newRoom.user2Id,
      p_user1_pseudonym: newRoom.user1Pseudonym,
      p_user2_pseudonym: newRoom.user2Pseudonym,
      p_status: newRoom.status,
      p_started_at: newRoom.startedAt,
      p_connection_xp: newRoom.connectionXp,
      p_connection_level: newRoom.connectionLevel,
      p_reveal_status_user1: newRoom.revealStatusUser1,
      p_reveal_status_user2: newRoom.revealStatusUser2,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error(`Failed to create room atomically: ${error?.message || 'no room returned'}`);

    this.userCache.delete(room.user1Id);
    this.userCache.delete(room.user2Id);
    if (room.user1DiscordId) this.discordUserCache.delete(room.user1DiscordId);
    if (room.user2DiscordId) this.discordUserCache.delete(room.user2DiscordId);

    const mapped = this.mapRoom(row);
    mapped.user1DiscordId = room.user1DiscordId || '';
    mapped.user2DiscordId = room.user2DiscordId || '';
    mapped.user1Avatar = room.user1Avatar || '🎭';
    mapped.user2Avatar = room.user2Avatar || '🎭';
    return mapped;
  }

  async getRoomById(id: string): Promise<RoomSession | null> {
    if (this.isMockMode || !this.client) {
      const room = this.mockRooms.get(id);
      return room ? { ...room } : null;
    }
    const { data, error } = await this.client.from('rooms').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Failed to load room: ${error.message}`);
    if (!data) return null;
    const mapped = this.mapRoom(data);
    if (!mapped.user1DiscordId || !mapped.user2DiscordId) {
      const [u1, u2] = await Promise.all([
        this.getUserById(mapped.user1Id),
        this.getUserById(mapped.user2Id),
      ]);
      if (u1) mapped.user1DiscordId = u1.discordUserId;
      if (u2) mapped.user2DiscordId = u2.discordUserId;
    }
    return mapped;
  }

  async getLastRoomForUser(userId: string): Promise<RoomSession | null> {
    if (this.isMockMode || !this.client) {
      const userRooms = Array.from(this.mockRooms.values())
        .filter((r) => r.user1Id === userId || r.user2Id === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return userRooms[0] ? { ...userRooms[0] } : null;
    }

    const { data, error } = await this.client
      .from('rooms')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to load room: ${error.message}`);
    if (!data) return null;
    const mapped = this.mapRoom(data);
    if (!mapped.user1DiscordId || !mapped.user2DiscordId) {
      const [u1, u2] = await Promise.all([
        this.getUserById(mapped.user1Id),
        this.getUserById(mapped.user2Id),
      ]);
      if (u1) mapped.user1DiscordId = u1.discordUserId;
      if (u2) mapped.user2DiscordId = u2.discordUserId;
    }
    return mapped;
  }

  async getUserRooms(userId: string): Promise<RoomSession[]> {
    if (this.isMockMode || !this.client) {
      return Array.from(this.mockRooms.values()).filter(
        (r) => r.user1Id === userId || r.user2Id === userId
      );
    }
    const { data, error } = await this.client
      .from('rooms')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    if (error) throw new Error(`Failed to load user rooms: ${error.message}`);
    return (data || []).map((d: any) => this.mapRoom(d));
  }

  async updateRoom(room: RoomSession): Promise<RoomSession> {
    room.updatedAt = new Date().toISOString();
    if (this.isMockMode || !this.client) {
      this.mockRooms.set(room.id, { ...room });
      return room;
    }
    await this.client
      .from('rooms')
      .update({
        status: room.status,
        connection_xp: room.connectionXp,
        connection_level: room.connectionLevel,
        reveal_status_user1: room.revealStatusUser1,
        reveal_status_user2: room.revealStatusUser2,
        pinned_message_id: room.pinnedMessageId,
        ended_at: room.endedAt,
        end_reason: room.endReason,
        updated_at: room.updatedAt,
      })
      .eq('id', room.id);
    return room;
  }

  async getActiveRooms(): Promise<RoomSession[]> {
    if (this.isMockMode || !this.client) {
      return Array.from(this.mockRooms.values()).filter((r) => r.status === 'active');
    }
    const { data, error } = await this.client.from('rooms').select('*').eq('status', 'active');
    if (error) throw new Error(`Failed to load active rooms: ${error.message}`);
    return (data || []).map(this.mapRoom);
  }

  async endRoom(roomId: string, reason: RoomSession['endReason'] = 'user_left'): Promise<boolean> {
    const now = new Date().toISOString();
    if (this.isMockMode || !this.client) {
      const room = this.mockRooms.get(roomId);
      if (!room || room.status === 'ended') return false;
      room.status = 'ended';
      room.endedAt = now;
      room.endReason = reason;
      room.updatedAt = now;

      const u1 = this.mockUsers.get(room.user1Id);
      if (u1 && u1.activeRoomId === roomId) u1.activeRoomId = null;
      const u2 = this.mockUsers.get(room.user2Id);
      if (u2 && u2.activeRoomId === roomId) u2.activeRoomId = null;
      return true;
    }

    const room = await this.getRoomById(roomId);
    const { data, error } = await this.client.rpc('end_room', {
      p_room_id: roomId,
      p_end_reason: reason,
    });
    let ended = !error && Boolean(data);

    if (error) {
      const { data: updatedRows, error: updateError } = await this.client
        .from('rooms')
        .update({ status: 'ended', ended_at: now, end_reason: reason, updated_at: now })
        .eq('id', roomId)
        .eq('status', 'active')
        .select('id');
      if (updateError) throw new Error(`Failed to end room: ${updateError.message}`);
      ended = Boolean(updatedRows && updatedRows.length > 0);
      if (ended && room) {
        const { error: userError } = await this.client
          .from('users')
          .update({ active_room_id: null })
          .eq('active_room_id', roomId);
        if (userError) throw new Error(`Failed to clear active room references: ${userError.message}`);
      }
    }

    if (!ended) return false;

    if (room) {
      this.userCache.delete(room.user1Id);
      this.userCache.delete(room.user2Id);
      if (room.user1DiscordId) this.discordUserCache.delete(room.user1DiscordId);
      if (room.user2DiscordId) this.discordUserCache.delete(room.user2DiscordId);
      try {
        await Promise.all([
          redis.delIfValue(`user:active_room:${room.user1Id}`, roomId),
          redis.delIfValue(`user:active_room:${room.user2Id}`, roomId),
          redis.del(`room:${roomId}`),
          redis.set(`user:last_room:${room.user1Id}`, roomId, 3600),
          redis.set(`user:last_room:${room.user2Id}`, roomId, 3600),
        ]);
      } catch (cacheError) {
        console.warn('[Database] Room ended but Redis cache cleanup failed:', cacheError);
      }
    }
    return true;
  }

  async updateRoomXP(roomId: string, addedXp: number): Promise<{ newXp: number; level: RoomSession['connectionLevel'] }> {
    if (!Number.isSafeInteger(addedXp) || addedXp <= 0 || addedXp > 100) {
      throw new Error('Room XP increment must be an integer between 1 and 100.');
    }

    if (this.isMockMode || !this.client) {
      const room = this.mockRooms.get(roomId);
      if (!room || room.status !== 'active') return { newXp: 0, level: 'Strangers' };
      room.connectionXp += addedXp;
      if (room.connectionXp >= 1201) room.connectionLevel = 'Destiny';
      else if (room.connectionXp >= 701) room.connectionLevel = 'Trusted Connection';
      else if (room.connectionXp >= 351) room.connectionLevel = 'Connection';
      else if (room.connectionXp >= 151) room.connectionLevel = 'Familiar';
      else if (room.connectionXp >= 51) room.connectionLevel = 'Acquaintances';
      room.updatedAt = new Date().toISOString();
      return { newXp: room.connectionXp, level: room.connectionLevel };
    }

    const { data, error } = await this.client.rpc('add_room_xp', {
      p_room_id: roomId,
      p_added_xp: addedXp,
    });
    if (error) throw new Error(`Failed to update room XP: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { newXp: 0, level: 'Strangers' };
    return { newXp: row.new_xp, level: row.level as RoomSession['connectionLevel'] };
  }

  // ---------------- MESSAGES & AUDIT ----------------
  async saveMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const chatMsg: ChatMessage = {
      ...msg,
      id,
      createdAt: now,
    };

    if (this.isMockMode || !this.client) {
      this.mockMessages.push(chatMsg);
      return chatMsg;
    }

    const { data, error } = await this.client
      .from('messages')
      .insert({
        id: chatMsg.id,
        room_id: chatMsg.roomId,
        sender_user_id: chatMsg.senderUserId,
        sender_pseudonym: chatMsg.senderPseudonym,
        sanitized_content: chatMsg.sanitizedContent,
        attachments_meta: chatMsg.attachmentsMeta,
        is_pinned: chatMsg.isPinned,
        flagged_for_moderation: chatMsg.flaggedForModeration,
        moderation_reason: chatMsg.moderationReason,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to persist chat message: ${error?.message || 'no row returned'}`);
    const { error: activityError } = await this.client
      .from('users')
      .update({ last_active_at: now })
      .eq('id', chatMsg.senderUserId);
    if (activityError) console.warn('[Database] Could not update last-active timestamp:', activityError.message);
    return chatMsg;
  }

  async getRoomMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.trunc(limit))) : 50;
    if (this.isMockMode || !this.client) {
      return this.mockMessages
        .filter((m) => m.roomId === roomId)
        .slice(-safeLimit);
    }
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(`Failed to load room messages: ${error.message}`);

    return (data || []).map((m: any) => ({
      id: m.id,
      roomId: m.room_id,
      senderUserId: m.sender_user_id,
      senderPseudonym: m.sender_pseudonym,
      sanitizedContent: m.sanitized_content,
      attachmentsMeta: m.attachments_meta || [],
      isPinned: m.is_pinned,
      flaggedForModeration: m.flagged_for_moderation,
      moderationReason: m.moderation_reason,
      createdAt: m.created_at,
    })).reverse();
  }

  // ---------------- BLOCKS & SAFETY ----------------
  async getBlockedUserIds(userId: string): Promise<Set<string>> {
    const cached = this.blockListCache.get(userId);
    if (cached && cached.expires > Date.now()) return new Set(cached.ids);

    const blockedIds = new Set<string>();
    if (this.isMockMode || !this.client) {
      for (const block of this.mockBlocks) {
        if (block.blockerId === userId) blockedIds.add(block.blockedId);
        if (block.blockedId === userId) blockedIds.add(block.blockerId);
      }
    } else {
      const { data, error } = await this.client
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
      if (error) throw new Error(`Failed to load user block list: ${error.message}`);
      for (const row of data || []) {
        if (row.blocker_id === userId) blockedIds.add(row.blocked_id);
        if (row.blocked_id === userId) blockedIds.add(row.blocker_id);
      }
    }

    if (this.blockListCache.size > 5000) {
      for (const [key, entry] of this.blockListCache) {
        if (entry.expires <= Date.now()) this.blockListCache.delete(key);
      }
    }
    this.blockListCache.set(userId, { ids: blockedIds, expires: Date.now() + 30_000 });
    return new Set(blockedIds);
  }

  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    if (!userAId || !userBId || userAId === userBId) return userAId === userBId;
    const blockedIds = await this.getBlockedUserIds(userAId);
    return blockedIds.has(userBId);
  }

  async addBlock(blockerId: string, blockedId: string, reason?: string): Promise<boolean> {
    if (this.isMockMode || !this.client) {
      if (!this.mockBlocks.some((b) => b.blockerId === blockerId && b.blockedId === blockedId)) {
        this.mockBlocks.push({
          id: uuidv4(),
          blockerId,
          blockedId,
          reason,
          createdAt: new Date().toISOString(),
        });
      }
      this.blockListCache.delete(blockerId);
      this.blockListCache.delete(blockedId);
      return true;
    }
    const { error } = await this.client.from('user_blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason,
    });
    if (error?.code === '23505') {
      this.blockListCache.delete(blockerId);
      this.blockListCache.delete(blockedId);
      return true;
    }
    if (!error) {
      this.blockListCache.delete(blockerId);
      this.blockListCache.delete(blockedId);
    }
    return !error;
  }

  // ---------------- REPORTS ----------------
  async createReport(report: Omit<ReportItem, 'id' | 'status' | 'actionTaken' | 'createdAt' | 'updatedAt'>): Promise<ReportItem> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const newReport: ReportItem = {
      ...report,
      id,
      status: 'pending',
      actionTaken: 'none',
      createdAt: now,
      updatedAt: now,
    };

    if (this.isMockMode || !this.client) {
      this.mockReports.set(id, newReport);
      return newReport;
    }

    const { data, error } = await this.client.from('reports').insert({
      id: newReport.id,
      reporter_id: newReport.reporterId,
      reported_id: newReport.reportedId,
      room_id: newReport.roomId,
      category: newReport.category,
      description: newReport.description,
      chat_excerpt: newReport.chatExcerpt,
      status: newReport.status,
    }).select().single();

    if (error || !data) throw new Error(`Failed to create report: ${error?.message || 'no row returned'}`);
    return newReport;
  }

  async getReports(status?: ReportItem['status']): Promise<ReportItem[]> {
    if (this.isMockMode || !this.client) {
      const all = Array.from(this.mockReports.values());
      return status ? all.filter((r) => r.status === status) : all;
    }
    let query = this.client.from('reports').select('*');
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to load reports: ${error.message}`);
    return (data || []).map((r: any) => ({
      id: r.id,
      reporterId: r.reporter_id,
      reportedId: r.reported_id,
      roomId: r.room_id,
      category: r.category,
      description: r.description,
      chatExcerpt: r.chat_excerpt,
      status: r.status,
      actionTaken: r.action_taken,
      moderatorNotes: r.moderator_notes,
      resolvedBy: r.resolved_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getReportById(id: string): Promise<ReportItem | null> {
    if (this.isMockMode || !this.client) {
      return this.mockReports.get(id) || null;
    }
    const { data, error } = await this.client.from('reports').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Failed to load report: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      reporterId: data.reporter_id,
      reportedId: data.reported_id,
      roomId: data.room_id,
      category: data.category,
      description: data.description,
      chatExcerpt: data.chat_excerpt,
      status: data.status,
      actionTaken: data.action_taken,
      moderatorNotes: data.moderator_notes,
      resolvedBy: data.resolved_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async resolveReport(id: string, action: string, notes?: string, adminId?: string): Promise<boolean> {
    if (this.isMockMode || !this.client) {
      const r = this.mockReports.get(id);
      if (!r) return false;
      r.status = 'resolved';
      r.actionTaken = action as any;
      r.moderatorNotes = notes;
      r.resolvedBy = adminId;
      return true;
    }
    const { error } = await this.client
      .from('reports')
      .update({
        status: 'resolved',
        action_taken: action,
        moderator_notes: notes,
        resolved_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return !error;
  }

  // ---------------- AUDIT LOGS ----------------
  async logAdminAction(adminId: string, action: string, targetType: string, targetId: string, changes: Record<string, any> = {}, ipAddress?: string): Promise<void> {
    const log: AdminAuditLog = {
      id: uuidv4(),
      adminId,
      action,
      targetType,
      targetId,
      changes,
      ipAddress,
      createdAt: new Date().toISOString(),
    };

    if (this.isMockMode || !this.client) {
      this.mockAuditLogs.push(log);
      return;
    }

    const { error } = await this.client.from('admin_audit_logs').insert({
      id: log.id,
      admin_id: log.adminId,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      changes: log.changes,
      ip_address: log.ipAddress,
    });
    if (error) throw new Error(`Failed to persist admin audit log: ${error.message}`);
  }

  async getAdminLogs(limit: number = 100): Promise<AdminAuditLog[]> {
    if (this.isMockMode || !this.client) {
      return [...this.mockAuditLogs].reverse().slice(0, limit);
    }
    const { data, error } = await this.client
      .from('admin_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to load admin audit logs: ${error.message}`);
    return (data || []).map((l: any) => ({
      id: l.id,
      adminId: l.admin_id,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      changes: l.changes || {},
      ipAddress: l.ip_address,
      createdAt: l.created_at,
    }));
  }

  async getRecentTransactions(limit: number = 50): Promise<CoinTransaction[]> {
    if (this.isMockMode || !this.client) {
      return [...this.mockTransactions].reverse().slice(0, limit);
    }
    const { data, error } = await this.client
      .from('coin_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to load recent transactions: ${error.message}`);
    return (data || []).map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      amount: Number(t.amount),
      balanceAfter: Number(t.balance_after),
      type: t.type,
      referenceId: t.reference_id,
      metadata: t.metadata || {},
      createdAt: t.created_at,
    }));
  }

  async getUserTransactions(userId: string, limit: number = 20): Promise<CoinTransaction[]> {
    if (this.isMockMode || !this.client) {
      return this.mockTransactions
        .filter((t) => t.userId === userId)
        .reverse()
        .slice(0, limit);
    }
    const { data, error } = await this.client
      .from('coin_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to load user transactions: ${error.message}`);
    return (data || []).map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      amount: Number(t.amount),
      balanceAfter: Number(t.balance_after),
      type: t.type,
      referenceId: t.reference_id,
      metadata: t.metadata || {},
      createdAt: t.created_at,
    }));
  }

  async getShopItems(): Promise<ShopItem[]> {
    if (this.isMockMode || !this.client) {
      return Array.from(this.mockShopItems.values());
    }
    const { data, error } = await this.client
      .from('shop_items')
      .select('*')
      .order('price', { ascending: true });
    if (error) throw new Error(`Failed to load shop catalog: ${error.message}`);
    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      price: Number(item.price),
      icon: item.icon,
      metadata: item.metadata || {},
      isActive: item.is_active,
    }));
  }

  async getUserInventory(userId: string): Promise<string[]> {
    if (this.isMockMode || !this.client) {
      return [...(this.mockInventory.get(userId) || [])];
    }
    const { data, error } = await this.client
      .from('user_inventory')
      .select('item_id, quantity')
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to load user inventory: ${error.message}`);
    const items = (data || []).flatMap((row: any) => Array.from({ length: Math.max(1, Number(row.quantity) || 1) }, () => row.item_id));
    this.mockInventory.set(userId, items);
    return items;
  }

  async addToUserInventory(userId: string, itemId: string, allowDuplicate = false): Promise<boolean> {
    if (this.isMockMode || !this.client) {
      const inventory = this.mockInventory.get(userId) || [];
      if (!allowDuplicate && inventory.includes(itemId)) return false;
      inventory.push(itemId);
      this.mockInventory.set(userId, inventory);
      return true;
    }

    if (allowDuplicate) {
      const { data: existing, error: lookupError } = await this.client
        .from('user_inventory')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .maybeSingle();
      if (lookupError) return false;
      if (existing) {
        const { error: updateError } = await this.client
          .from('user_inventory')
          .update({ quantity: Number(existing.quantity || 1) + 1 })
          .eq('id', existing.id);
        if (updateError) return false;
      } else {
        const { error: insertError } = await this.client.from('user_inventory').insert({
          user_id: userId,
          item_id: itemId,
          quantity: 1,
        });
        if (insertError) return false;
      }
    } else {
      const { error } = await this.client.from('user_inventory').insert({
        user_id: userId,
        item_id: itemId,
        quantity: 1,
      });
      if (error) return false;
    }

    const inventory = this.mockInventory.get(userId) || [];
    if (!inventory.includes(itemId)) inventory.push(itemId);
    this.mockInventory.set(userId, inventory);
    return true;
  }

  async getMessageCountLast24h(): Promise<number> {
    if (this.isMockMode || !this.client) {
      return this.mockMessages.length;
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await this.client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
    if (error) throw new Error(`Failed to count recent messages: ${error.message}`);
    return count || 0;
  }

  /**
   * Total number of registered users.
   * Uses a HEAD count so no rows are transferred.
   */
  async getEconomySummary(): Promise<{ totalUsers: number; activeUsers: number; totalCoins: number }> {
    if (this.isMockMode || !this.client) {
      const users = Array.from(this.mockUsers.values());
      const since = Date.now() - 24 * 60 * 60 * 1000;
      return {
        totalUsers: users.length,
        activeUsers: users.filter((user: any) => {
          const lastActive = Date.parse(user.lastActiveAt || user.updatedAt || user.createdAt || '');
          return Number.isFinite(lastActive) && lastActive >= since;
        }).length,
        totalCoins: users.reduce((sum, user) => sum + (Number(user.destinyCoins) || 0), 0),
      };
    }

    const { data, error } = await this.client.rpc('get_economy_summary');
    if (error) throw new Error(`Failed to load economy summary: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      totalUsers: Number(row?.total_users || 0),
      activeUsers: Number(row?.active_users || 0),
      totalCoins: Number(row?.total_coins || 0),
    };
  }

  async getHourlyActivity(hours = 24): Promise<Array<{ hour: string; messages: number; matches: number }>> {
    const safeHours = Number.isSafeInteger(hours) ? Math.min(168, Math.max(1, hours)) : 24;
    if (this.isMockMode || !this.client) {
      const currentHour = new Date();
      currentHour.setMinutes(0, 0, 0);
      const firstHour = currentHour.getTime() - (safeHours - 1) * 60 * 60 * 1000;
      return Array.from({ length: safeHours }, (_, index) => {
        const start = firstHour + index * 60 * 60 * 1000;
        const end = start + 60 * 60 * 1000;
        const messages = this.mockMessages.filter((message) => {
          const created = Date.parse(message.createdAt);
          return created >= start && created < end;
        }).length;
        const matches = Array.from(this.mockRooms.values()).filter((room) => {
          const started = Date.parse(room.startedAt);
          return started >= start && started < end;
        }).length;
        return { hour: new Date(start).toISOString(), messages, matches };
      });
    }

    const { data, error } = await this.client.rpc('get_hourly_activity', { p_hours: safeHours });
    if (error) throw new Error(`Failed to load hourly activity: ${error.message}`);
    return (data || []).map((row: any) => ({
      hour: row.hour,
      messages: Number(row.messages || 0),
      matches: Number(row.matches || 0),
    }));
  }

  async getUserCount(): Promise<number> {
    if (this.isMockMode || !this.client) {
      return this.mockUsers.size;
    }
    const { count, error } = await this.client
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Failed to count users: ${error.message}`);
    return count || 0;
  }

  // ---------------- INTERNAL MAPPERS ----------------
  // ---------------- GUILD SETTINGS ----------------
  async getGuildSettings(guildId: string, forceFresh = false): Promise<GuildSettings | null> {
    if (!forceFresh) {
      const cached = this.guildSettingsCache.get(guildId);
      if (cached && cached.expires > Date.now()) {
        return cached.settings;
      }
    }

    if (this.isMockMode || !this.client) {
      return null;
    }
    const { data, error } = await this.client
      .from('guild_settings')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load guild settings: ${error.message}`);

    if (!data) {
      this.guildSettingsCache.set(guildId, { settings: null, expires: Date.now() + 120_000 });
      return null;
    }

    const settings: GuildSettings = {
      guildId: data.guild_id,
      guildName: data.guild_name,
      commandPrefix: data.command_prefix,
      matchChannelId: data.match_channel_id,
      announcementsChannelId: data.announcements_channel_id,
      modLogChannelId: data.mod_log_channel_id,
      crossServerEnabled: data.cross_server_enabled,
      minAgeLimit: data.min_age_limit,
      allowedRoles: data.allowed_roles,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    this.guildSettingsCache.set(guildId, { settings, expires: Date.now() + 300_000 });
    return settings;
  }

  async setGuildMatchChannel(guildId: string, channelId: string, guildName?: string): Promise<boolean> {
    const existing = this.guildSettingsCache.get(guildId)?.settings;
    if (existing) {
      existing.matchChannelId = channelId;
      if (guildName) existing.guildName = guildName;
      this.guildSettingsCache.set(guildId, { settings: existing, expires: Date.now() + 300_000 });
    } else {
      this.guildSettingsCache.delete(guildId);
    }

    if (this.isMockMode || !this.client) {
      return true;
    }
    const { error } = await this.client
      .from('guild_settings')
      .upsert({
        guild_id: guildId,
        guild_name: guildName || 'Discord Guild',
        match_channel_id: channelId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'guild_id' });

    return !error;
  }

  async setGuildAdminChannel(guildId: string, channelId: string, guildName?: string): Promise<boolean> {
    const existing = this.guildSettingsCache.get(guildId)?.settings;
    if (existing) {
      existing.matchChannelId = channelId;
      existing.modLogChannelId = channelId;
      if (guildName) existing.guildName = guildName;
      this.guildSettingsCache.set(guildId, { settings: existing, expires: Date.now() + 300_000 });
    } else {
      this.guildSettingsCache.delete(guildId);
    }

    if (this.isMockMode || !this.client) {
      return true;
    }
    const { error } = await this.client
      .from('guild_settings')
      .upsert({
        guild_id: guildId,
        guild_name: guildName || 'Discord Guild',
        match_channel_id: channelId,
        mod_log_channel_id: channelId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'guild_id' });

    return !error;
  }

  async clearGuildChannels(guildId: string): Promise<boolean> {
    const existing = this.guildSettingsCache.get(guildId)?.settings;
    if (existing) {
      existing.matchChannelId = null;
      existing.modLogChannelId = null;
      this.guildSettingsCache.set(guildId, { settings: existing, expires: Date.now() + 300_000 });
    } else {
      this.guildSettingsCache.delete(guildId);
    }

    if (this.isMockMode || !this.client) {
      return true;
    }
    const { error } = await this.client
      .from('guild_settings')
      .update({
        match_channel_id: null,
        mod_log_channel_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId);

    return !error;
  }

  private mapUser(row: any): UserProfile {
    return {
      id: row.id,
      discordUserId: row.discord_user_id,
      destinyId: row.destiny_id,
      age: Number(row.age),
      gender: row.gender,
      genderVerified: Boolean(row.gender_verified),
      genderVerificationStatus: row.gender_verification_status,
      genderVerificationEvidence: row.gender_verification_evidence,
      interests: row.interests || [],
      languages: row.languages || ['en'],
      preferredGender: row.preferred_gender || ['any'],
      minAgePref: Number(row.min_age_pref || 18),
      maxAgePref: Number(row.max_age_pref || 99),
      destinyCoins: Number(row.destiny_coins || 0),
      streakCount: Number(row.streak_count || 0),
      lastDailyClaim: row.last_daily_claim,
      connectionTier: row.connection_tier,
      activeRoomId: row.active_room_id,
      isBanned: Boolean(row.is_banned),
      banReason: row.ban_reason,
      reputationScore: Number(row.reputation_score || 100),
      bio: row.bio ?? undefined,
      equippedBadges: row.equipped_badges || [],
      matchIntent: row.match_intent ?? undefined,
      cardTheme: row.card_theme || 'obsidian',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRoom(row: any): RoomSession {
    return {
      id: row.id,
      roomCode: row.room_code,
      user1Id: row.user1_id,
      user2Id: row.user2_id,
      user1DiscordId: '',
      user2DiscordId: '',
      user1Pseudonym: row.user1_pseudonym,
      user2Pseudonym: row.user2_pseudonym,
      user1Avatar: '🦊',
      user2Avatar: '🦉',
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      endReason: row.end_reason,
      connectionXp: Number(row.connection_xp || 0),
      connectionLevel: row.connection_level,
      pinnedMessageId: row.pinned_message_id,
      revealStatusUser1: row.reveal_status_user1 || { consented: false, revealedFields: [] },
      revealStatusUser2: row.reveal_status_user2 || { consented: false, revealedFields: [] },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const db = new DatabaseService();
