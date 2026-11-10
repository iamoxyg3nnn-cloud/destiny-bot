-- ====================================================================
-- DESTINY BOT: SUPABASE POSTGRESQL SCHEMA MIGRATION 001
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(64) UNIQUE NOT NULL,
    destiny_id VARCHAR(16) UNIQUE NOT NULL,
    age INT NOT NULL CHECK (age >= 18),
    gender VARCHAR(32) NOT NULL DEFAULT 'prefer_not_to_say',
    gender_verified BOOLEAN NOT NULL DEFAULT FALSE,
    gender_verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified', -- 'unverified', 'pending', 'verified', 'rejected'
    gender_verification_evidence TEXT,
    interests TEXT[] NOT NULL DEFAULT '{}',
    languages TEXT[] NOT NULL DEFAULT '{"en"}',
    preferred_gender TEXT[] NOT NULL DEFAULT '{"any"}',
    min_age_pref INT NOT NULL DEFAULT 18 CHECK (min_age_pref >= 18),
    max_age_pref INT NOT NULL DEFAULT 99 CHECK (max_age_pref >= min_age_pref),
    destiny_coins BIGINT NOT NULL DEFAULT 100 CHECK (destiny_coins >= 0),
    streak_count INT NOT NULL DEFAULT 0,
    last_daily_claim TIMESTAMPTZ,
    connection_tier VARCHAR(32) NOT NULL DEFAULT 'Strangers',
    active_room_id UUID,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason TEXT,
    reputation_score INT NOT NULL DEFAULT 100 CHECK (reputation_score >= 0 AND reputation_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for high-performance lookup
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON public.users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_users_destiny_id ON public.users(destiny_id);
CREATE INDEX IF NOT EXISTS idx_users_active_room ON public.users(active_room_id);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON public.users(is_banned);

-- 2. GUILD SETTINGS
CREATE TABLE IF NOT EXISTS public.guild_settings (
    guild_id VARCHAR(64) PRIMARY KEY,
    guild_name VARCHAR(255),
    command_prefix VARCHAR(8) NOT NULL DEFAULT '!',
    match_channel_id VARCHAR(64),
    announcements_channel_id VARCHAR(64),
    mod_log_channel_id VARCHAR(64),
    cross_server_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    min_age_limit INT NOT NULL DEFAULT 18,
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ROOMS (Anonymous Match Sessions)
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(32) UNIQUE NOT NULL,
    user1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user1_pseudonym VARCHAR(64) NOT NULL,
    user2_pseudonym VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'ended', 'paused'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    end_reason VARCHAR(64), -- 'user_left', 'timeout', 'moderated', 'inactivity'
    connection_xp INT NOT NULL DEFAULT 0,
    connection_level VARCHAR(32) NOT NULL DEFAULT 'Strangers',
    pinned_message_id UUID,
    reveal_status_user1 JSONB NOT NULL DEFAULT '{"consented": false, "revealed_fields": []}'::jsonb,
    reveal_status_user2 JSONB NOT NULL DEFAULT '{"consented": false, "revealed_fields": []}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_different_users CHECK (user1_id <> user2_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_user1 ON public.rooms(user1_id);
CREATE INDEX IF NOT EXISTS idx_rooms_user2 ON public.rooms(user2_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms(room_code);

-- 4. MESSAGES (Audit & History)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_pseudonym VARCHAR(64) NOT NULL,
    sanitized_content TEXT NOT NULL,
    attachments_meta JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    flagged_for_moderation BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- 5. COIN TRANSACTIONS (Idempotent Ledger)
CREATE TABLE IF NOT EXISTS public.coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL, -- positive for credits, negative for debits
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    type VARCHAR(64) NOT NULL, -- 'daily_reward', 'shop_purchase', 'streak_bonus', 'mission_reward', 'room_milestone', 'admin_adjustment'
    reference_id VARCHAR(128) UNIQUE NOT NULL, -- unique idempotency key
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user_id ON public.coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_tx_ref_id ON public.coin_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_coin_tx_type ON public.coin_transactions(type);

-- 6. REPORTS & MODERATION
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    category VARCHAR(64) NOT NULL, -- 'harassment', 'identity_leak', 'inappropriate_content', 'spam', 'underage', 'other'
    description TEXT NOT NULL,
    chat_excerpt JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'dismissed'
    action_taken VARCHAR(64) NOT NULL DEFAULT 'none', -- 'none', 'warned', 'temp_ban', 'perma_ban'
    moderator_notes TEXT,
    resolved_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON public.reports(reported_id);

-- 8. USER BLOCKS (Global cross-server block list)
CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_block_pair UNIQUE (blocker_id, blocked_id),
    CONSTRAINT check_not_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.user_blocks(blocked_id);

-- 9. SHOP ITEMS & COSMETICS
CREATE TABLE IF NOT EXISTS public.shop_items (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(32) NOT NULL, -- 'badge', 'title', 'theme', 'reveal_card'
    price BIGINT NOT NULL CHECK (price >= 0),
    icon VARCHAR(32) NOT NULL DEFAULT '✨',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    item_id VARCHAR(64) NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_item UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_user ON public.user_inventory(user_id);

-- 10. MISSIONS & ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS public.user_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mission_code VARCHAR(64) NOT NULL,
    title VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    reward_dc INT NOT NULL DEFAULT 50,
    current_progress INT NOT NULL DEFAULT 0,
    target_progress INT NOT NULL DEFAULT 1,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missions_user ON public.user_missions(user_id);

-- 11. NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    daily_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    daily_reminder_time VARCHAR(8) NOT NULL DEFAULT '19:30',
    time_zone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    quiet_hours_start VARCHAR(8),
    quiet_hours_end VARCHAR(8),
    opt_out BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(64) NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_audit_logs(created_at);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: The Destiny backend communicates using the secure Supabase service role key,
-- bypassing RLS for server-side verification, while client-side anon access is strictly read-restricted.
DROP POLICY IF EXISTS "Public items are viewable" ON public.shop_items;
CREATE POLICY "Public items are viewable" ON public.shop_items FOR SELECT USING (is_active = true);
