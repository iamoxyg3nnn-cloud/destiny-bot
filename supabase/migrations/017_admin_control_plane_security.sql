-- Restrict the internal event-trigger helper and cover the foreign keys
-- identified by the live Supabase performance advisor.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id
  ON public.messages(sender_user_id);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id
  ON public.reports(reporter_id);
