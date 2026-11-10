-- Accurate dashboard aggregates and hourly activity buckets.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Preserve historical activity instead of marking every existing account as
-- active at migration time.
UPDATE public.users
   SET last_active_at = COALESCE(updated_at, created_at, NOW())
 WHERE last_active_at IS NULL;

ALTER TABLE public.users
  ALTER COLUMN last_active_at SET DEFAULT NOW(),
  ALTER COLUMN last_active_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.get_economy_summary()
RETURNS TABLE (
  total_users BIGINT,
  active_users BIGINT,
  total_coins BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    COALESCE(SUM(destiny_coins), 0)::BIGINT
  FROM public.users;
$$;

CREATE OR REPLACE FUNCTION public.get_hourly_activity(p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  hour TIMESTAMPTZ,
  messages BIGINT,
  matches BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'p_hours must be between 1 and 168';
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc('hour', NOW() - make_interval(hours => p_hours - 1)),
      date_trunc('hour', NOW()),
      INTERVAL '1 hour'
    ) AS bucket
  ),
  message_counts AS (
    SELECT date_trunc('hour', created_at) AS bucket, COUNT(*)::BIGINT AS total
      FROM public.messages
     WHERE created_at >= date_trunc('hour', NOW() - make_interval(hours => p_hours - 1))
     GROUP BY 1
  ),
  match_counts AS (
    SELECT date_trunc('hour', started_at) AS bucket, COUNT(*)::BIGINT AS total
      FROM public.rooms
     WHERE started_at >= date_trunc('hour', NOW() - make_interval(hours => p_hours - 1))
     GROUP BY 1
  )
  SELECT b.bucket,
         COALESCE(m.total, 0)::BIGINT,
         COALESCE(r.total, 0)::BIGINT
    FROM buckets b
    LEFT JOIN message_counts m ON m.bucket = b.bucket
    LEFT JOIN match_counts r ON r.bucket = b.bucket
   ORDER BY b.bucket;
END;
$$;

REVOKE ALL ON FUNCTION public.get_economy_summary()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_economy_summary()
  TO service_role;

REVOKE ALL ON FUNCTION public.get_hourly_activity(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hourly_activity(integer)
  TO service_role;
