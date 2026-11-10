-- Atomic room lifecycle and consumable inventory quantities.

ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_inventory_quantity_positive'
      AND conrelid = 'public.user_inventory'::regclass
  ) THEN
    ALTER TABLE public.user_inventory
      ADD CONSTRAINT user_inventory_quantity_positive CHECK (quantity >= 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_room_with_users(
    p_id UUID,
    p_room_code VARCHAR(32),
    p_user1_id UUID,
    p_user2_id UUID,
    p_user1_pseudonym VARCHAR(64),
    p_user2_pseudonym VARCHAR(64),
    p_status VARCHAR(32),
    p_started_at TIMESTAMPTZ,
    p_connection_xp INTEGER,
    p_connection_level VARCHAR(32),
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

    -- Lock users in deterministic order so concurrent matches cannot create
    -- overlapping active rooms or deadlock when the pair order is reversed.
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
      status, started_at, connection_xp, connection_level,
      reveal_status_user1, reveal_status_user2
    ) VALUES (
      p_id, p_room_code, p_user1_id, p_user2_id, p_user1_pseudonym, p_user2_pseudonym,
      p_status, COALESCE(p_started_at, NOW()), COALESCE(p_connection_xp, 0),
      COALESCE(p_connection_level, 'Strangers'),
      COALESCE(p_reveal_status_user1, '{"consented": false, "revealed_fields": []}'::jsonb),
      COALESCE(p_reveal_status_user2, '{"consented": false, "revealed_fields": []}'::jsonb)
    );

    UPDATE public.users
       SET active_room_id = p_id, updated_at = NOW()
     WHERE id IN (p_user1_id, p_user2_id);

    RETURN QUERY SELECT * FROM public.rooms WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_room(
    p_room_id UUID,
    p_end_reason VARCHAR(64)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_u1 UUID;
    v_u2 UUID;
BEGIN
    UPDATE public.rooms
       SET status = 'ended',
           ended_at = NOW(),
           end_reason = p_end_reason,
           updated_at = NOW()
     WHERE id = p_room_id AND status = 'active'
     RETURNING user1_id, user2_id INTO v_u1, v_u2;

    IF FOUND THEN
      -- Never clear a newer room reference if the user has already rematched.
      UPDATE public.users
         SET active_room_id = NULL, updated_at = NOW()
       WHERE id IN (v_u1, v_u2)
         AND active_room_id = p_room_id;
      RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_with_users(uuid, character varying, uuid, uuid, character varying, character varying, character varying, timestamp with time zone, integer, character varying, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_with_users(uuid, character varying, uuid, uuid, character varying, character varying, character varying, timestamp with time zone, integer, character varying, jsonb, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.end_room(uuid, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_room(uuid, character varying)
  TO service_role;
