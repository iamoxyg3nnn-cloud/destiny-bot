-- Atomic room XP increments. Concurrent messages must not overwrite each
-- other's XP updates or award a tier based on stale room state.

CREATE OR REPLACE FUNCTION public.add_room_xp(
    p_room_id UUID,
    p_added_xp INTEGER
)
RETURNS TABLE (new_xp INTEGER, level VARCHAR(32))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_xp INTEGER;
    v_level VARCHAR(32);
BEGIN
    IF p_added_xp IS NULL OR p_added_xp < 1 OR p_added_xp > 100 THEN
      RAISE EXCEPTION 'Room XP increment must be between 1 and 100';
    END IF;

    UPDATE public.rooms
       SET connection_xp = connection_xp + p_added_xp,
           updated_at = NOW()
     WHERE id = p_room_id
       AND status = 'active'
       AND connection_xp <= 2147483647 - p_added_xp
     RETURNING connection_xp, connection_level INTO v_new_xp, v_level;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 0, 'Strangers'::VARCHAR(32);
      RETURN;
    END IF;

    -- trg_update_room_connection_level updates the level before RETURNING.
    RETURN QUERY SELECT v_new_xp, v_level;
END;
$$;

REVOKE ALL ON FUNCTION public.add_room_xp(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_room_xp(uuid, integer)
  TO service_role;
