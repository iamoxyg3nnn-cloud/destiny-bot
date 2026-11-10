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
  public profileExtensions: Map<string, { bio?: string; matchIntent?: string; cardTheme?: string; equippedBadges?: string[] }> = new Map();

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

  private async enrichProfileExtensions(user: UserProfile): Promise<UserProfile> {
    if (!this.profileExtensions.has(user.id)) {
      try {
        const raw = await redis.get(`user:profile_ext:${user.id}`);
        if (raw) {
          const ext = JSON.parse(raw);
          this.profileExtensions.set(user.id, ext);
        }
      } catch {}
    }
    const ext = this.profileExtensions.get(user.id);
    if (ext) {
      if (ext.bio && !user.bio) user.bio = ext.bio;
      if (ext.matchIntent && !user.matchIntent) user.matchIntent = ext.matchIntent;
      if (ext.cardTheme && (!user.cardTheme || user.cardTheme === 'obsidian')) user.cardTheme = ext.cardTheme;
      if (ext.equippedBadges && (!user.equippedBadges || user.equippedBadges.length === 0)) user.equippedBadges = ext.equippedBadges;
    }
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

    if (error || !data) return null;
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

    if (error || !data) return null;
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

    if (error || !data) return null;
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

      const { data } = await this.client
        .from('users')
        .select('id')
        .eq('destiny_id', code)
        .maybeSingle();

      if (!data) {
        return code;
      }
    }
  }

  async createOrUpdateUser(user: Partial<UserProfile> & { discordUserId: string }): Promise<UserProfile> {
    const now = new Date().toISOString();
    const existing = await this.getUserByDiscordId(user.discordUserId);

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

      const { data, error } = await this.client
        .from('users')
        .update({
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
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (user.bio !== undefined || user.matchIntent !== undefined || user.cardTheme !== undefined || user.equippedBadges !== undefined) {
        const existingExt = this.profileExtensions.get(existing.id) || {};
        const newExt = {
          bio: user.bio !== undefined ? user.bio : existingExt.bio,
          matchIntent: user.matchIntent !== undefined ? user.matchIntent : existingExt.matchIntent,
          cardTheme: user.cardTheme !== undefined ? user.cardTheme : existingExt.cardTheme,
          equippedBadges: user.equippedBadges !== undefined ? user.equippedBadges : existingExt.equippedBadges,
        };
        this.profileExtensions.set(existing.id, newExt);
        redis.set(`user:profile_ext:${existing.id}`, JSON.stringify(newExt), 86400 * 30).catch(() => {});
        if (this.client) {
          const optFields: any = {};
          if (newExt.bio !== undefined) optFields.bio = newExt.bio;
          if (newExt.matchIntent !== undefined) optFields.match_intent = newExt.matchIntent;
          if (newExt.cardTheme !== undefined) optFields.card_theme = newExt.cardTheme;
          if (newExt.equippedBadges !== undefined) optFields.equipped_badges = newExt.equippedBadges;
          Promise.resolve(this.client.from('users').update(optFields).eq('id', existing.id)).catch(() => {});
        }
      }

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
        interests: newUser.interests,
        languages: newUser.languages,
        preferred_gender: newUser.preferredGender,
        min_age_pref: newUser.minAgePref,
        max_age_pref: newUser.maxAgePref,
        destiny_coins: newUser.destinyCoins,
        streak_count: newUser.streakCount,
        connection_tier: newUser.connectionTier,
        reputation_score: newUser.reputationScore,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to insert user: ${error?.message}`);
    const mapped = this.mapUser(data);
    this.userCache.set(mapped.id, { user: mapped, expires: Date.now() + 60_000 });
    this.discordUserCache.set(mapped.discordUserId, { user: mapped, expires: Date.now() + 60_000 });

    if (user.bio !== undefined || user.matchIntent !== undefined || user.cardTheme !== undefined || user.equippedBadges !== undefined) {
      const ext = {
        bio: user.bio,
        matchIntent: user.matchIntent,
        cardTheme: user.cardTheme,
        equippedBadges: user.equippedBadges,
      };
      this.profileExtensions.set(mapped.id, ext);
      redis.set(`user:profile_ext:${mapped.id}`, JSON.stringify(ext), 86400 * 30).catch(() => {});

      const optFields: any = {};
      if (user.bio !== undefined) optFields.bio = user.bio;
      if (user.matchIntent !== undefined) optFields.match_intent = user.matchIntent;
      if (user.cardTheme !== undefined) optFields.card_theme = user.cardTheme;
      if (user.equippedBadges !== undefined) optFields.equipped_badges = user.equippedBadges;
      await Promise.resolve(this.client.from('users').update(optFields).eq('id', mapped.id)).catch(() => {});
      return await this.enrichProfileExtensions(mapped);
    }

    return mapped;
  }

  async clearActiveRoom(userId: string): Promise<void> {
    if (this.isMockMode || !this.client) {
      const u = this.mockUsers.get(userId);
      if (u) u.activeRoomId = null;
      return;
    }
    await this.client.from('users').update({ active_room_id: null }).eq('id', userId);
    const u = await this.getUserById(userId);
    if (u) {
      u.activeRoomId = null;
      this.userCache.set(userId, { user: u, expires: Date.now() + 60_000 });
      if (u.discordUserId) {
        this.discordUserCache.set(u.discordUserId, { user: u, expires: Date.now() + 60_000 });
      }
    }
  }

  async getAllUsers(limit: number = 100, offset: number = 0): Promise<UserProfile[]> {
    if (this.isMockMode || !this.client) {
      return Array.from(this.mockUsers.values()).slice(offset, offset + limit);
    }
    const { data } = await this.client
      .from('users')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });
    return (data || []).map(this.mapUser);
  }

  // ---------------- ATOMIC COIN TRANSACTIONS ----------------
  async executeCoinTransaction(
    userId: string,
    amount: number,
    type: CoinTransaction['type'],
    referenceId: string,
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; newBalance: number; error?: string; txId?: string }> {
    if (this.isMockMode || !this.client) {
      // Check idempotency
      const existingTx = this.mockTransactions.find((t) => t.referenceId === referenceId);
      if (existingTx) {
        return { success: true, newBalance: existingTx.balanceAfter, txId: existingTx.id };
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
    if (res.success) {
      const cached = this.userCache.get(userId);
      if (cached) {
        cached.user.destinyCoins = Number(res.new_balance);
        this.discordUserCache.set(cached.user.discordUserId, { user: cached.user, expires: Date.now() + 60_000 });
      }
    }
    return {
      success: res.success,
      newBalance: Number(res.new_balance),
      error: res.error_message,
      txId: res.transaction_id,
    };
  }

  // ---------------- ROOM OPERATIONS ----------------
  async createRoom(room: Omit<RoomSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<RoomSession> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const newRoom: RoomSession = {
      ...room,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isMockMode || !this.client) {
      this.mockRooms.set(id, newRoom);
      // Link activeRoomId in users
      const u1 = this.mockUsers.get(room.user1Id);
      if (u1) u1.activeRoomId = id;
      const u2 = this.mockUsers.get(room.user2Id);
      if (u2) u2.activeRoomId = id;
      return newRoom;
    }

    const { data, error } = await this.client
      .from('rooms')
      .insert({
        id: newRoom.id,
        room_code: newRoom.roomCode,
        user1_id: newRoom.user1Id,
        user2_id: newRoom.user2Id,
        user1_pseudonym: newRoom.user1Pseudonym,
        user2_pseudonym: newRoom.user2Pseudonym,
        status: newRoom.status,
        connection_xp: newRoom.connectionXp,
        connection_level: newRoom.connectionLevel,
        reveal_status_user1: newRoom.revealStatusUser1,
        reveal_status_user2: newRoom.revealStatusUser2,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to insert room: ${error?.message}`);

    await this.client.from('users').update({ active_room_id: id }).in('id', [room.user1Id, room.user2Id]);

    // Invalidate user cache so active_room_id is immediately fresh
    this.userCache.delete(room.user1Id);
    this.userCache.delete(room.user2Id);
    if (room.user1DiscordId) this.discordUserCache.delete(room.user1DiscordId);
    if (room.user2DiscordId) this.discordUserCache.delete(room.user2DiscordId);

    const mapped = this.mapRoom(data);
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
    if (error || !data) return null;
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

    if (error || !data) return null;
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
    if (error || !data) return [];
    return data.map((d: any) => this.mapRoom(d));
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
    const { data } = await this.client.from('rooms').select('*').eq('status', 'active');
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
    if (room) {
      this.userCache.delete(room.user1Id);
      this.userCache.delete(room.user2Id);
      if (room.user1DiscordId) this.discordUserCache.delete(room.user1DiscordId);
      if (room.user2DiscordId) this.discordUserCache.delete(room.user2DiscordId);

      try {
        const { redis } = await import('../redis/client.js');
        await Promise.all([
          redis.del(`user:active_room:${room.user1Id}`),
          redis.del(`user:active_room:${room.user2Id}`),
          redis.del(`room:${roomId}`),
          redis.set(`user:last_room:${room.user1Id}`, roomId, 3600),
          redis.set(`user:last_room:${room.user2Id}`, roomId, 3600),
        ]);
      } catch {}
    }

    const { error } = await this.client.rpc('end_room', {
      p_room_id: roomId,
      p_end_reason: reason,
    });

    if (error) {
      await this.client
        .from('rooms')
        .update({ status: 'ended', ended_at: now, end_reason: reason })
        .eq('id', roomId);
      if (room) {
        await this.client
          .from('users')
          .update({ active_room_id: null })
          .in('id', [room.user1Id, room.user2Id]);
      }
    }

    return true;
  }

  async updateRoomXP(roomId: string, addedXp: number): Promise<{ newXp: number; level: RoomSession['connectionLevel'] }> {
    const room = await this.getRoomById(roomId);
    if (!room) return { newXp: 0, level: 'Strangers' };

    const newXp = room.connectionXp + addedXp;
    let level: RoomSession['connectionLevel'] = 'Strangers';
    if (newXp >= 1201) level = 'Destiny';
    else if (newXp >= 701) level = 'Trusted Connection';
    else if (newXp >= 351) level = 'Connection';
    else if (newXp >= 151) level = 'Familiar';
    else if (newXp >= 51) level = 'Acquaintances';

    if (this.isMockMode || !this.client) {
      room.connectionXp = newXp;
      room.connectionLevel = level;
      room.updatedAt = new Date().toISOString();
      return { newXp, level };
    }

    await this.client
      .from('rooms')
      .update({ connection_xp: newXp, connection_level: level, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    return { newXp, level };
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

    const { data } = await this.client
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

    return chatMsg;
  }

  async getRoomMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    if (this.isMockMode || !this.client) {
      return this.mockMessages
        .filter((m) => m.roomId === roomId)
        .slice(-limit);
    }
    const { data } = await this.client
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(limit);

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
    }));
  }

  // ---------------- BLOCKS & SAFETY ----------------
  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    if (this.isMockMode || !this.client) {
      return this.mockBlocks.some(
        (b) => (b.blockerId === userAId && b.blockedId === userBId) ||
               (b.blockerId === userBId && b.blockedId === userAId)
      );
    }
    const { data } = await this.client
      .from('user_blocks')
      .select('id')
      .or(`and(blocker_id.eq.${userAId},blocked_id.eq.${userBId}),and(blocker_id.eq.${userBId},blocked_id.eq.${userAId})`)
      .limit(1);

    return (data && data.length > 0) || false;
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
      return true;
    }
    const { error } = await this.client.from('user_blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason,
    });
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

    const { data } = await this.client.from('reports').insert({
      id: newReport.id,
      reporter_id: newReport.reporterId,
      reported_id: newReport.reportedId,
      room_id: newReport.roomId,
      category: newReport.category,
      description: newReport.description,
      chat_excerpt: newReport.chatExcerpt,
      status: newReport.status,
    }).select().single();

    return newReport;
  }

  async getReports(status?: ReportItem['status']): Promise<ReportItem[]> {
    if (this.isMockMode || !this.client) {
      const all = Array.from(this.mockReports.values());
      return status ? all.filter((r) => r.status === status) : all;
    }
    let query = this.client.from('reports').select('*');
    if (status) query = query.eq('status', status);
    const { data } = await query.order('created_at', { ascending: false });
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
    const { data } = await this.client.from('reports').select('*').eq('id', id).single();
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

    await this.client.from('admin_audit_logs').insert({
      id: log.id,
      admin_id: log.adminId,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      changes: log.changes,
      ip_address: log.ipAddress,
    });
  }

  async getAdminLogs(limit: number = 100): Promise<AdminAuditLog[]> {
    if (this.isMockMode || !this.client) {
      return [...this.mockAuditLogs].reverse().slice(0, limit);
    }
    const { data } = await this.client
      .from('admin_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
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
    const { data } = await this.client
      .from('coin_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
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
    const { data } = await this.client
      .from('coin_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
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
    try {
      const { data } = await this.client
        .from('shop_items')
        .select('*')
        .order('price', { ascending: true });
      const remoteItems = (data || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        category: i.category,
        price: Number(i.price),
        icon: i.icon,
        metadata: i.metadata || {},
        isActive: i.is_active,
      }));
      const remoteIds = new Set(remoteItems.map((i: any) => i.id));
      for (const [id, mockItem] of this.mockShopItems.entries()) {
        if (!remoteIds.has(id)) {
          remoteItems.push(mockItem);
        }
      }
      return remoteItems;
    } catch {
      return Array.from(this.mockShopItems.values());
    }
  }

  async getUserInventory(userId: string): Promise<string[]> {
    if (this.isMockMode || !this.client) {
      return this.mockInventory.get(userId) || [];
    }
    try {
      const { data } = await this.client
        .from('user_inventory')
        .select('item_id')
        .eq('user_id', userId);
      const items = (data || []).map((r: any) => r.item_id);
      const memItems = this.mockInventory.get(userId) || [];
      const combined = Array.from(new Set([...items, ...memItems]));
      this.mockInventory.set(userId, combined);
      return combined;
    } catch {
      return this.mockInventory.get(userId) || [];
    }
  }

  async addToUserInventory(userId: string, itemId: string): Promise<boolean> {
    const inv = this.mockInventory.get(userId) || [];
    if (!inv.includes(itemId)) {
      inv.push(itemId);
      this.mockInventory.set(userId, inv);
    }
    if (this.isMockMode || !this.client) return true;
    try {
      await this.client.from('user_inventory').insert({
        user_id: userId,
        item_id: itemId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getMessageCountLast24h(): Promise<number> {
    if (this.isMockMode || !this.client) {
      return this.mockMessages.length;
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await this.client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
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
    const { data } = await this.client
      .from('guild_settings')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle();

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
      bio: row.bio || undefined,
      equippedBadges: row.equipped_badges || [],
      matchIntent: row.match_intent || undefined,
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
