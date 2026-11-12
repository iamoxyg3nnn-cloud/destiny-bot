-- All application data is accessed through the trusted backend using
-- service_role. Browser-facing Supabase roles must never read or mutate these
-- anonymous chat, moderation, configuration or audit tables directly.
DO $migration$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'users',
    'rooms',
    'messages',
    'reports',
    'user_blocks',
    'guild_settings',
    'notification_settings',
    'admin_audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
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
