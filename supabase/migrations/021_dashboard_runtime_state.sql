-- Serverless dashboards need shared, durable OAuth/session/rate-limit state.
-- Discord OAuth tokens and PKCE verifiers are encrypted by the application
-- before they are written to this service-role-only table.
CREATE TABLE IF NOT EXISTS public.dashboard_runtime_state (
  app TEXT NOT NULL CHECK (app IN ('server', 'owner')),
  key TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app, key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_runtime_state_expiry
  ON public.dashboard_runtime_state (expires_at);

ALTER TABLE public.dashboard_runtime_state ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dashboard_runtime_state'
      AND policyname = 'deny_anon_authenticated_access'
  ) THEN
    CREATE POLICY deny_anon_authenticated_access
      ON public.dashboard_runtime_state
      FOR ALL TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$migration$;

REVOKE ALL ON TABLE public.dashboard_runtime_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_runtime_state TO service_role;

CREATE TABLE IF NOT EXISTS public.dashboard_rate_limits (
  app TEXT NOT NULL CHECK (app IN ('server', 'owner')),
  bucket TEXT NOT NULL CHECK (bucket IN ('login', 'api')),
  ip_hash TEXT NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  window_started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (app, bucket, ip_hash)
);

ALTER TABLE public.dashboard_rate_limits ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dashboard_rate_limits'
      AND policyname = 'deny_anon_authenticated_access'
  ) THEN
    CREATE POLICY deny_anon_authenticated_access
      ON public.dashboard_rate_limits
      FOR ALL TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$migration$;

REVOKE ALL ON TABLE public.dashboard_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_dashboard_runtime_state(
  p_app TEXT,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF p_app NOT IN ('server', 'owner') OR p_key IS NULL OR length(p_key) > 512 THEN
    RAISE EXCEPTION 'Invalid dashboard state key';
  END IF;

  DELETE FROM public.dashboard_runtime_state
  WHERE app = p_app
    AND key = p_key
    AND expires_at > clock_timestamp()
  RETURNING payload INTO v_payload;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_dashboard_runtime_state(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_dashboard_runtime_state(TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.increment_dashboard_rate_limit(
  p_app TEXT,
  p_bucket TEXT,
  p_ip_hash TEXT,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
BEGIN
  IF p_app NOT IN ('server', 'owner')
    OR p_bucket NOT IN ('login', 'api')
    OR p_ip_hash IS NULL
    OR p_ip_hash !~ '^[0-9a-f]{64}$'
    OR p_window_seconds < 1
    OR p_window_seconds > 3600
  THEN
    RAISE EXCEPTION 'Invalid dashboard rate-limit input';
  END IF;

  INSERT INTO public.dashboard_rate_limits (
    app, bucket, ip_hash, request_count, window_started_at, expires_at
  ) VALUES (
    p_app, p_bucket, p_ip_hash, 1, v_now, v_now + make_interval(secs => p_window_seconds)
  )
  ON CONFLICT (app, bucket, ip_hash) DO UPDATE
  SET request_count = CASE
        WHEN public.dashboard_rate_limits.expires_at <= v_now THEN 1
        ELSE public.dashboard_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN public.dashboard_rate_limits.expires_at <= v_now THEN v_now
        ELSE public.dashboard_rate_limits.window_started_at
      END,
      expires_at = CASE
        WHEN public.dashboard_rate_limits.expires_at <= v_now
          THEN v_now + make_interval(secs => p_window_seconds)
        ELSE public.dashboard_rate_limits.expires_at
      END
  RETURNING request_count INTO v_count;

  DELETE FROM public.dashboard_rate_limits
  WHERE app = p_app AND expires_at <= v_now - INTERVAL '1 day';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_dashboard_rate_limit(TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_dashboard_rate_limit(TEXT, TEXT, TEXT, INTEGER)
  TO service_role;
