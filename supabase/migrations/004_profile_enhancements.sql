-- ====================================================================
-- DESTINY BOT: PROFILE ENHANCEMENTS MIGRATION 004
-- Adds bio quote, match intent/vibe, card theme, and insignia badges
-- ====================================================================

-- 1. ADD NEW COLUMNS TO USERS TABLE
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS match_intent VARCHAR(64) DEFAULT 'LATE NIGHT CHAT';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS card_theme VARCHAR(64) DEFAULT 'monochrome';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS equipped_badges TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.users.bio IS 'User profile motto or quote displayed on identity card';
COMMENT ON COLUMN public.users.match_intent IS 'Active matchmaking vibe/intent (e.g. LATE NIGHT CHAT, GAMING DUO)';
COMMENT ON COLUMN public.users.card_theme IS 'Equipped cosmetic card skin (e.g. monochrome, cyber_damask)';
COMMENT ON COLUMN public.users.equipped_badges IS 'Array of equipped collectible insignia IDs';

-- 2. SEED PRESTIGE CARD THEMES & INSIGNIA BADGES INTO SHOP
INSERT INTO public.shop_items (id, name, description, category, price, icon, metadata) VALUES
('theme_cyber_damask', 'Cyber Damask Skin', 'High-contrast obsidian and damask steel pattern card skin.', 'theme', 450, '🛡️', '{"theme": "cyber_damask", "preview": "#121417"}'),
('theme_frost_glaze', 'Frost Glaze Skin', 'Frosted titanium minimalist aesthetic with razor hairlines.', 'theme', 550, '❄️', '{"theme": "frost_glaze", "preview": "#e2e8f0"}'),
('theme_holographic_plat', 'Holographic Platinum', 'Prestige platinum finish with iridescent micro-reflections.', 'theme', 800, '💎', '{"theme": "holographic_plat", "preview": "#ffffff"}'),
('badge_streak_titan', '7D Streak Master Insignia', 'Displays verified 7-day streak insignia on your profile card.', 'badge', 300, '🔥', '{"badge": "7D STREAK"}'),
('badge_titan_1k', 'Titan Supporter Insignia', 'Exclusive commemorative rack insignia for Destiny Titans.', 'badge', 500, '⚡', '{"badge": "TITAN 1K"}')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price;
