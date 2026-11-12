-- Restrict the internal event-trigger helper when the optional Supabase
-- platform bootstrap has installed it. Fresh local/CI databases do not create
-- this platform-owned event trigger, so the migration must remain portable.
DO $migration$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id
  ON public.messages(sender_user_id);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id
  ON public.reports(reporter_id);
