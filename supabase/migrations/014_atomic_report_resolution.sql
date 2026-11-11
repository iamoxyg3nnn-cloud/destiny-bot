-- Resolve a report and apply a permanent safety ban in one transaction.
-- Locking the pending report ensures two moderators cannot race different
-- outcomes for the same report.
CREATE OR REPLACE FUNCTION public.resolve_report_atomic(
    p_report_id UUID,
    p_action VARCHAR(64),
    p_notes TEXT DEFAULT NULL,
    p_admin_id VARCHAR(64) DEFAULT 'admin_web'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reported_id UUID;
    v_category VARCHAR(64);
BEGIN
    IF p_report_id IS NULL OR p_action NOT IN ('none', 'warned', 'temp_ban', 'perma_ban') THEN
        RETURN FALSE;
    END IF;

    SELECT reported_id, category
      INTO v_reported_id, v_category
      FROM public.reports
     WHERE id = p_report_id
       AND status = 'pending'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF p_action = 'perma_ban' THEN
        UPDATE public.users
           SET is_banned = TRUE,
               ban_reason = 'Banned via safety report: ' || v_category,
               updated_at = NOW()
         WHERE id = v_reported_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Reported user no longer exists';
        END IF;
    END IF;

    UPDATE public.reports
       SET status = 'resolved',
           action_taken = p_action,
           moderator_notes = p_notes,
           resolved_by = p_admin_id,
           updated_at = NOW()
     WHERE id = p_report_id
       AND status = 'pending';

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_report_atomic(uuid, character varying, text, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_report_atomic(uuid, character varying, text, character varying)
  TO service_role;
