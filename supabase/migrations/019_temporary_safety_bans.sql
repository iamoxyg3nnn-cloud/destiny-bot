-- Support real, expiring safety-report suspensions. A temporary ban lasts
-- 24 hours; permanent bans have no expiry. Existing permanent bans remain
-- permanent because the new column defaults to NULL.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ban_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.resolve_report_atomic(
    p_report_id UUID,
    p_action VARCHAR(64),
    p_notes TEXT DEFAULT NULL,
    p_admin_id VARCHAR(64) DEFAULT 'dashboard_owner'
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
               ban_expires_at = NULL,
               updated_at = NOW()
         WHERE id = v_reported_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Reported user no longer exists';
        END IF;
    ELSIF p_action = 'temp_ban' THEN
        UPDATE public.users
           SET is_banned = TRUE,
               ban_reason = CASE
                 WHEN is_banned AND ban_expires_at IS NULL THEN ban_reason
                 ELSE 'Temporarily banned via safety report: ' || v_category
               END,
               ban_expires_at = CASE
                 WHEN is_banned AND ban_expires_at IS NULL THEN NULL
                 WHEN is_banned AND ban_expires_at > NOW() THEN ban_expires_at + INTERVAL '24 hours'
                 ELSE NOW() + INTERVAL '24 hours'
               END,
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
