-- Peer transfers are ledger movements, not shop purchases or mission rewards.
UPDATE public.coin_transactions
   SET type = 'transfer_sent'
 WHERE reference_id LIKE 'transfer:out:%'
   AND type = 'shop_purchase';

UPDATE public.coin_transactions
   SET type = 'transfer_received'
 WHERE reference_id LIKE 'transfer:in:%'
   AND type = 'mission_reward';

CREATE OR REPLACE FUNCTION public.transfer_coins(
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_amount BIGINT,
    p_reference_id VARCHAR(115)
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_from_balance BIGINT;
    v_to_balance BIGINT;
    v_existing_count INT;
    v_valid_count INT;
    v_out_ref VARCHAR(128);
    v_in_ref VARCHAR(128);
BEGIN
    IF p_from_user_id = p_to_user_id THEN
        RETURN QUERY SELECT FALSE, 'CANNOT_TRANSFER_TO_SELF'::TEXT;
        RETURN;
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_reference_id IS NULL
       OR length(btrim(p_reference_id)) = 0 OR length(p_reference_id) > 115 THEN
        RETURN QUERY SELECT FALSE, 'INVALID_TRANSFER'::TEXT;
        RETURN;
    END IF;

    v_out_ref := 'transfer:out:' || p_reference_id;
    v_in_ref := 'transfer:in:' || p_reference_id;

    PERFORM pg_advisory_xact_lock(hashtextextended('transfer:' || p_reference_id, 0));

    SELECT COUNT(*) INTO v_existing_count
      FROM public.coin_transactions
     WHERE reference_id IN (v_out_ref, v_in_ref);

    IF v_existing_count > 0 THEN
        SELECT COUNT(*) INTO v_valid_count
          FROM public.coin_transactions
         WHERE (reference_id = v_out_ref AND user_id = p_from_user_id AND amount = -p_amount AND type = 'transfer_sent')
            OR (reference_id = v_in_ref AND user_id = p_to_user_id AND amount = p_amount AND type = 'transfer_received');

        IF v_existing_count = 2 AND v_valid_count = 2 THEN
            RETURN QUERY SELECT TRUE, NULL::TEXT;
        ELSE
            RETURN QUERY SELECT FALSE, 'IDEMPOTENCY_KEY_REUSED'::TEXT;
        END IF;
        RETURN;
    END IF;

    PERFORM id
      FROM public.users
     WHERE id IN (p_from_user_id, p_to_user_id)
     ORDER BY id
     FOR UPDATE;

    SELECT destiny_coins INTO v_from_balance FROM public.users WHERE id = p_from_user_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'SENDER_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    SELECT destiny_coins INTO v_to_balance FROM public.users WHERE id = p_to_user_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'RECIPIENT_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    IF v_from_balance < p_amount THEN
        RETURN QUERY SELECT FALSE, 'INSUFFICIENT_FUNDS'::TEXT;
        RETURN;
    END IF;
    IF v_to_balance > 9223372036854775807 - p_amount THEN
        RETURN QUERY SELECT FALSE, 'BALANCE_LIMIT_EXCEEDED'::TEXT;
        RETURN;
    END IF;

    UPDATE public.users SET destiny_coins = v_from_balance - p_amount, updated_at = NOW() WHERE id = p_from_user_id;
    UPDATE public.users SET destiny_coins = v_to_balance + p_amount, updated_at = NOW() WHERE id = p_to_user_id;

    INSERT INTO public.coin_transactions (user_id, amount, balance_after, type, reference_id, metadata)
    VALUES
      (p_from_user_id, -p_amount, v_from_balance - p_amount, 'transfer_sent', v_out_ref, jsonb_build_object('toUserId', p_to_user_id)),
      (p_to_user_id, p_amount, v_to_balance + p_amount, 'transfer_received', v_in_ref, jsonb_build_object('fromUserId', p_from_user_id));

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_coins(uuid, uuid, bigint, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_coins(uuid, uuid, bigint, character varying)
  TO service_role;
