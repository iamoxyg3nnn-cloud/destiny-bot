-- ====================================================================
-- DESTINY BOT: SEED DATA (003)
-- ====================================================================

-- Default Shop Items
INSERT INTO public.shop_items (id, name, description, category, price, icon, metadata) VALUES
('badge_verified_vip', 'Destiny VIP Badge', 'Displays an exclusive VIP icon on your anonymous profile banner.', 'badge', 500, '👑', '{"color": "#FFD700"}'),
('badge_star_wanderer', 'Star Wanderer', 'Mark of an explorer across 50+ anonymous conversations.', 'badge', 250, '⭐', '{"color": "#7289DA"}'),
('badge_mystic_aura', 'Mystic Aura', 'Glowing celestial aura badge for your profile card.', 'badge', 400, '🔮', '{"color": "#9B59B6"}'),
('title_cosmic_friend', 'Title: Cosmic Soul', 'Unlocks the title Cosmic Soul next to your anonymous alias.', 'title', 300, '🌌', '{"title": "Cosmic Soul"}'),
('title_night_owl', 'Title: Night Owl', 'For late-night conversationalists under the midnight sky.', 'title', 200, '🦉', '{"title": "Night Owl"}'),
('title_truth_seeker', 'Title: Truth Seeker', 'Master of Truth or Dare sessions with matched partners.', 'title', 350, '🗝️', '{"title": "Truth Seeker"}'),
('card_instant_reveal', 'Identity Reveal Token', 'Allows you to initiate a mutual reveal sequence without coin cost.', 'reveal_card', 150, '📜', '{"consumable": true}'),
('theme_nebula_dark', 'Nebula Dark Theme', 'A deep space nebula gradient theme for your profile reveal cards.', 'theme', 600, '🪐', '{"gradient": "linear-gradient(135deg, #1f1c2c, #928DAB)"}')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price;
