-- Record initial balances in the ledger atomically with user creation.
CREATE OR REPLACE FUNCTION public.record_user_welcome_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reference_id VARCHAR(128);
BEGIN
  IF COALESCE(NEW.destiny_coins, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_reference_id := 'welcome:' || NEW.id::TEXT;
  IF NOT EXISTS (
    SELECT 1 FROM public.coin_transactions WHERE reference_id = v_reference_id
  ) THEN
    INSERT INTO public.coin_transactions (
      user_id, amount, balance_after, type, reference_id, metadata
    ) VALUES (
      NEW.id,
      NEW.destiny_coins,
      NEW.destiny_coins,
      'welcome_bonus',
      v_reference_id,
      jsonb_build_object('source', 'signup')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_welcome_bonus_after_insert ON public.users;
CREATE TRIGGER users_welcome_bonus_after_insert
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.record_user_welcome_bonus();

REVOKE ALL ON FUNCTION public.record_user_welcome_bonus()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_welcome_bonus()
  TO service_role;
