-- Conditional inactivity closure. The row lock makes this race-safe with
-- touch_room_activity: whichever transaction gets the room lock second sees
-- the first transaction's committed updated_at value.
CREATE OR REPLACE FUNCTION public.end_room_if_inactive(
    p_room_id UUID,
    p_cutoff TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user1 UUID;
    v_user2 UUID;
    v_last_activity TIMESTAMPTZ;
BEGIN
    IF p_room_id IS NULL OR p_cutoff IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT user1_id, user2_id, COALESCE(updated_at, started_at)
      INTO v_user1, v_user2, v_last_activity
      FROM public.rooms
     WHERE id = p_room_id
       AND status = 'active'
     FOR UPDATE;

    IF NOT FOUND OR v_last_activity > p_cutoff THEN
        RETURN FALSE;
    END IF;

    UPDATE public.rooms
       SET status = 'ended',
           ended_at = NOW(),
           end_reason = 'inactivity',
           updated_at = NOW()
     WHERE id = p_room_id
       AND status = 'active';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
       SET active_room_id = NULL,
           updated_at = NOW()
     WHERE id IN (v_user1, v_user2)
       AND active_room_id = p_room_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.end_room_if_inactive(uuid, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_room_if_inactive(uuid, timestamp with time zone)
  TO service_role;
