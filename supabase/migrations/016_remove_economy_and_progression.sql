-- Permanently remove the retired economy, cosmetics and progression system.
-- This intentionally deletes historical wallet/ledger, inventory, shop and
-- mission records, plus user/room balance and progression columns.
-- Anonymous chat, profiles, rooms, messages, reports, blocks and verification
-- data are preserved.

-- Remove triggers before their trigger functions.
DROP TRIGGER IF EXISTS users_welcome_bonus_after_insert ON public.users;
DROP TRIGGER IF EXISTS trg_rooms_xp ON public.rooms;

-- Remove economy and progression RPCs.
DROP FUNCTION IF EXISTS public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb);
DROP FUNCTION IF EXISTS public.transfer_coins(uuid, uuid, bigint, character varying);
DROP FUNCTION IF EXISTS public.calculate_connection_tier(integer);
DROP FUNCTION IF EXISTS public.trg_update_room_connection_level();
DROP FUNCTION IF EXISTS public.add_room_xp(uuid, integer);
DROP FUNCTION IF EXISTS public.get_economy_summary();
DROP FUNCTION IF EXISTS public.record_user_welcome_bonus();
DROP FUNCTION IF EXISTS public.claim_daily_reward(uuid, character varying);

-- Replace the legacy room RPC without progression-only arguments/columns.
DROP FUNCTION IF EXISTS public.create_room_with_users(
  uuid, character varying, uuid, uuid, character varying, character varying,
  character varying, timestamp with time zone, integer, character varying,
  jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.create_room_with_users(
    p_id UUID,
    p_room_code VARCHAR(32),
    p_user1_id UUID,
    p_user2_id UUID,
    p_user1_pseudonym VARCHAR(64),
    p_user2_pseudonym VARCHAR(64),
    p_status VARCHAR(32),
    p_started_at TIMESTAMPTZ,
    p_reveal_status_user1 JSONB,
    p_reveal_status_user2 JSONB
)
RETURNS SETOF public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_count INTEGER;
BEGIN
    IF p_user1_id = p_user2_id THEN
      RAISE EXCEPTION 'A room requires two distinct users';
    END IF;

    -- Lock participants in a stable order to prevent overlapping rooms and
    -- deadlocks when concurrent match requests contain the pair in reverse order.
    PERFORM id
      FROM public.users
     WHERE id IN (p_user1_id, p_user2_id)
     ORDER BY id
     FOR UPDATE;

    SELECT COUNT(*) INTO v_user_count
      FROM public.users
     WHERE id IN (p_user1_id, p_user2_id);

    IF v_user_count <> 2 THEN
      RAISE EXCEPTION 'One or more room participants do not exist';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.users
       WHERE id IN (p_user1_id, p_user2_id)
         AND active_room_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A participant already belongs to an active room';
    END IF;

    INSERT INTO public.rooms (
      id, room_code, user1_id, user2_id, user1_pseudonym, user2_pseudonym,
      status, started_at, reveal_status_user1, reveal_status_user2
    ) VALUES (
      p_id, p_room_code, p_user1_id, p_user2_id, p_user1_pseudonym, p_user2_pseudonym,
      p_status, COALESCE(p_started_at, NOW()),
      COALESCE(p_reveal_status_user1, '{"consented": false, "revealed_fields": []}'::jsonb),
      COALESCE(p_reveal_status_user2, '{"consented": false, "revealed_fields": []}'::jsonb)
    );

    UPDATE public.users
       SET active_room_id = p_id, updated_at = NOW()
     WHERE id IN (p_user1_id, p_user2_id);

    RETURN QUERY SELECT * FROM public.rooms WHERE id = p_id;
END;
$$;

-- A SECURITY DEFINER function must not inherit PUBLIC execute permission.
REVOKE ALL ON FUNCTION public.create_room_with_users(
  uuid, character varying, uuid, uuid, character varying, character varying,
  character varying, timestamp with time zone, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_with_users(
  uuid, character varying, uuid, uuid, character varying, character varying,
  character varying, timestamp with time zone, jsonb, jsonb
) TO service_role;

-- Remove all economy/cosmetic/progression records. CASCADE removes their
-- indexes, RLS policies and foreign-key dependants.
DROP TABLE IF EXISTS public.user_inventory CASCADE;
DROP TABLE IF EXISTS public.user_missions CASCADE;
DROP TABLE IF EXISTS public.coin_transactions CASCADE;
DROP TABLE IF EXISTS public.shop_items CASCADE;

-- Remove economy and cosmetics from user profiles.
ALTER TABLE public.users
  DROP COLUMN IF EXISTS destiny_coins,
  DROP COLUMN IF EXISTS streak_count,
  DROP COLUMN IF EXISTS last_daily_claim,
  DROP COLUMN IF EXISTS connection_tier,
  DROP COLUMN IF EXISTS card_theme,
  DROP COLUMN IF EXISTS equipped_badges;

-- Rooms remain the source of truth for anonymous chat sessions only.
ALTER TABLE public.rooms
  DROP COLUMN IF EXISTS connection_xp,
  DROP COLUMN IF EXISTS connection_level;
