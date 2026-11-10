-- Atomic wallet transfers and strict idempotency-key ownership.

CREATE OR REPLACE FUNCTION public.execute_coin_transaction(
    p_user_id UUID,
    p_amount BIGINT,
    p_type VARCHAR(64),
    p_reference_id VARCHAR(128),
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    success BOOLEAN,
    new_balance BIGINT,
    transaction_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance BIGINT;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_existing_user_id UUID;
    v_existing_amount BIGINT;
    v_existing_type VARCHAR(64);
    v_existing_balance BIGINT;
BEGIN
    IF p_reference_id IS NULL OR length(btrim(p_reference_id)) = 0 OR p_amount = 0 THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, 'INVALID_TRANSACTION'::TEXT;
        RETURN;
    END IF;

    -- Serialize the same idempotency key even when requests target different users.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_reference_id, 0));

    SELECT user_id, amount, type, balance_after, id
      INTO v_existing_user_id, v_existing_amount, v_existing_type, v_existing_balance, v_tx_id
      FROM public.coin_transactions
     WHERE reference_id = p_reference_id;

    IF FOUND THEN
        IF v_existing_user_id = p_user_id AND v_existing_amount = p_amount AND v_existing_type = p_type THEN
            RETURN QUERY SELECT TRUE, v_existing_balance, v_tx_id, NULL::TEXT;
        ELSE
            RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, 'IDEMPOTENCY_KEY_REUSED'::TEXT;
        END IF;
        RETURN;
    END IF;

    SELECT destiny_coins INTO v_current_balance
      FROM public.users
     WHERE id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, 'USER_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    IF p_amount > 0 AND v_current_balance > 9223372036854775807 - p_amount THEN
        RETURN QUERY SELECT FALSE, v_current_balance, NULL::UUID, 'BALANCE_LIMIT_EXCEEDED'::TEXT;
        RETURN;
    END IF;

    v_new_balance := v_current_balance + p_amount;
    IF v_new_balance < 0 THEN
        RETURN QUERY SELECT FALSE, v_current_balance, NULL::UUID, 'INSUFFICIENT_FUNDS'::TEXT;
        RETURN;
    END IF;

    UPDATE public.users
       SET destiny_coins = v_new_balance, updated_at = NOW()
     WHERE id = p_user_id;

    INSERT INTO public.coin_transactions (user_id, amount, balance_after, type, reference_id, metadata)
    VALUES (p_user_id, p_amount, v_new_balance, p_type, p_reference_id, COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_tx_id;

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, NULL::TEXT;
END;
$$;

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

    -- Lock both accounts in deterministic order to prevent opposite-direction deadlocks.
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

REVOKE ALL ON FUNCTION public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_coin_transaction(uuid, bigint, character varying, character varying, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.transfer_coins(uuid, uuid, bigint, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_coins(uuid, uuid, bigint, character varying)
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_reports_room_reporter
  ON public.reports (room_id, reporter_id)
  WHERE room_id IS NOT NULL;
