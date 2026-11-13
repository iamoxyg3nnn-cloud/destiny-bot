-- Platform operators receive only named capabilities. Bootstrap root owners
-- remain in BOT_OWNER_IDS and are never represented or managed by this table.
CREATE TABLE IF NOT EXISTS public.platform_operator_grants (
  discord_user_id VARCHAR(20) NOT NULL
    CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  capability VARCHAR(64) NOT NULL
    CHECK (capability IN (
      'platform.health.read',
      'platform.servers.read',
      'platform.audit.read',
      'safety.reports.review',
      'safety.verification.review',
      'users.status.lookup',
      'conversations.metadata.read'
    )),
  granted_by VARCHAR(20) NOT NULL
    CHECK (granted_by ~ '^[0-9]{17,20}$'),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_user_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_platform_operator_grants_capability
  ON public.platform_operator_grants(capability, discord_user_id);

ALTER TABLE public.platform_operator_grants ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_operator_grants'
      AND policyname = 'deny_anon_authenticated_access'
  ) THEN
    CREATE POLICY deny_anon_authenticated_access
      ON public.platform_operator_grants
      FOR ALL TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$migration$;

REVOKE ALL ON TABLE public.platform_operator_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_operator_grants TO service_role;

CREATE OR REPLACE FUNCTION public.set_platform_operator_capability(
  p_target_discord_id TEXT,
  p_capability TEXT,
  p_granted_by TEXT,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_changed INTEGER;
  v_action TEXT;
BEGIN
  IF p_target_discord_id IS NULL
    OR p_granted_by IS NULL
    OR p_capability IS NULL
    OR p_target_discord_id !~ '^[0-9]{17,20}$'
    OR p_granted_by !~ '^[0-9]{17,20}$'
    OR p_capability NOT IN (
      'platform.health.read',
      'platform.servers.read',
      'platform.audit.read',
      'safety.reports.review',
      'safety.verification.review',
      'users.status.lookup',
      'conversations.metadata.read'
    )
    OR p_enabled IS NULL
  THEN
    RAISE EXCEPTION 'Invalid platform operator grant';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.platform_operator_grants (discord_user_id, capability, granted_by)
    VALUES (p_target_discord_id, p_capability, p_granted_by)
    ON CONFLICT (discord_user_id, capability) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    v_action := 'PLATFORM_OPERATOR_CAPABILITY_GRANTED';
  ELSE
    DELETE FROM public.platform_operator_grants
    WHERE discord_user_id = p_target_discord_id
      AND capability = p_capability;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    v_action := 'PLATFORM_OPERATOR_CAPABILITY_REVOKED';
  END IF;

  IF v_changed = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, changes)
  VALUES (
    p_granted_by,
    v_action,
    'platform_operator',
    p_target_discord_id,
    jsonb_build_object('capability', p_capability, 'enabled', p_enabled)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_platform_operator_capability(TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_operator_capability(TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;
