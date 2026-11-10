-- Security hardening for privileged database functions.
-- SECURITY DEFINER routines must not be callable by browser-facing roles and
-- must resolve object names only through a trusted search_path.

ALTER FUNCTION public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.end_room(uuid, character varying)
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_room(uuid, character varying)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.end_room(uuid, character varying)
  TO service_role;
