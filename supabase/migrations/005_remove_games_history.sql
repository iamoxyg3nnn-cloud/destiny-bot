-- Remove the legacy games subsystem.
-- Destiny is now conversation-only; no game data or history is retained.
DROP TABLE IF EXISTS public.games_history CASCADE;
