-- Durable runtime state, distributed locks, and rate limits in Postgres.
-- All tables and RPCs are restricted to service_role; these are server-side
-- coordination primitives, not browser-facing APIs.

CREATE TABLE IF NOT EXISTS public.runtime_kv (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 1024),
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_runtime_kv_expiry
  ON public.runtime_kv (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.runtime_kv_sets (
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 1024),
  member TEXT NOT NULL CHECK (length(member) BETWEEN 1 AND 1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (key, member)
);

CREATE INDEX IF NOT EXISTS idx_runtime_kv_sets_key ON public.runtime_kv_sets (key);

CREATE TABLE IF NOT EXISTS public.runtime_locks (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 1024),
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_locks_expiry ON public.runtime_locks (expires_at);

CREATE TABLE IF NOT EXISTS public.runtime_rate_limit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 1024),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_runtime_rate_limit_key_time
  ON public.runtime_rate_limit_events (key, occurred_at DESC);

ALTER TABLE public.runtime_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_kv_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_rate_limit_events ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'runtime_kv',
    'runtime_kv_sets',
    'runtime_locks',
    'runtime_rate_limit_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'deny_anon_authenticated_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY deny_anon_authenticated_access ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        table_name
      );
    END IF;
  END LOOP;
END
$migration$;

REVOKE ALL ON TABLE public.runtime_kv FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.runtime_kv_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.runtime_locks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.runtime_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.runtime_kv TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.runtime_kv_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.runtime_locks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.runtime_rate_limit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.runtime_rate_limit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.set_runtime_value_if_absent(
  p_key TEXT,
  p_value TEXT,
  p_ttl_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024 OR p_value IS NULL
     OR p_ttl_seconds IS NULL OR p_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid runtime value arguments';
  END IF;

  INSERT INTO public.runtime_kv (key, value, expires_at, updated_at)
  VALUES (p_key, p_value, clock_timestamp() + make_interval(secs => p_ttl_seconds), clock_timestamp())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at
    WHERE public.runtime_kv.expires_at IS NOT NULL
      AND public.runtime_kv.expires_at <= clock_timestamp();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_runtime_value_if_equal(
  p_key TEXT,
  p_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024 OR p_value IS NULL THEN
    RAISE EXCEPTION 'Invalid runtime value arguments';
  END IF;
  DELETE FROM public.runtime_kv WHERE key = p_key AND value = p_value;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_acquire_runtime_lock(
  p_key TEXT,
  p_token TEXT,
  p_ttl_ms INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024 OR p_token IS NULL
     OR p_ttl_ms IS NULL OR p_ttl_ms < 1 THEN
    RAISE EXCEPTION 'Invalid runtime lock arguments';
  END IF;
  INSERT INTO public.runtime_locks (key, token, expires_at)
  VALUES (p_key, p_token, clock_timestamp() + (p_ttl_ms * interval '1 millisecond'))
  ON CONFLICT (key) DO UPDATE
    SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    WHERE public.runtime_locks.expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_runtime_lock(
  p_key TEXT,
  p_token TEXT,
  p_ttl_ms INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_key IS NULL OR p_token IS NULL OR p_ttl_ms IS NULL OR p_ttl_ms < 1 THEN
    RAISE EXCEPTION 'Invalid runtime lock arguments';
  END IF;
  UPDATE public.runtime_locks
  SET expires_at = clock_timestamp() + (p_ttl_ms * interval '1 millisecond')
  WHERE key = p_key AND token = p_token AND expires_at > clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_runtime_lock(p_key TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_key IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'Invalid runtime lock arguments';
  END IF;
  DELETE FROM public.runtime_locks WHERE key = p_key AND token = p_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.take_runtime_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024
     OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  DELETE FROM public.runtime_rate_limit_events
  WHERE key = p_key AND occurred_at <= v_now - make_interval(secs => p_window_seconds);
  SELECT count(*)::INTEGER INTO v_count
  FROM public.runtime_rate_limit_events
  WHERE key = p_key AND occurred_at > v_now - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  INSERT INTO public.runtime_rate_limit_events (key, occurred_at) VALUES (p_key, v_now);
  RETURN QUERY SELECT TRUE, p_limit - v_count - 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_expired_runtime_state(p_limit INTEGER DEFAULT 1000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows INTEGER := 0;
  v_deleted INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Invalid prune limit';
  END IF;
  WITH expired AS (
    SELECT key FROM public.runtime_kv WHERE expires_at <= clock_timestamp()
    ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.runtime_kv target USING expired WHERE target.key = expired.key;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_rows := v_rows + v_deleted;
  WITH expired AS (
    SELECT key FROM public.runtime_locks WHERE expires_at <= clock_timestamp()
    ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.runtime_locks target USING expired WHERE target.key = expired.key;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_rows := v_rows + v_deleted;
  DELETE FROM public.runtime_rate_limit_events
  WHERE id IN (
    SELECT id FROM public.runtime_rate_limit_events
    WHERE occurred_at < clock_timestamp() - interval '1 day'
    ORDER BY occurred_at LIMIT p_limit
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_rows + v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.set_runtime_value_if_absent(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_runtime_value_if_equal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_runtime_lock(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_runtime_lock(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_runtime_lock(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.take_runtime_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_expired_runtime_state(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_runtime_value_if_absent(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_runtime_value_if_equal(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_runtime_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_runtime_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_runtime_lock(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.take_runtime_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_expired_runtime_state(INTEGER) TO service_role;
