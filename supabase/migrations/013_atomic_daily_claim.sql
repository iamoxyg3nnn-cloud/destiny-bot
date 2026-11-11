-- Atomically update the daily cooldown, streak counter, wallet balance and
-- ledger row. A per-user row lock closes the multi-process cooldown race; the
-- idempotency key makes an ambiguous network retry safe.
CREATE OR REPLACE FUNCTION public.claim_daily_reward(
    p_user_id UUID,
    p_reference_id VARCHAR(128)
)
RETURNS TABLE (
    success BOOLEAN,
    reward_dc BIGINT,
    new_streak INTEGER,
    new_balance BIGINT,
    next_claim_at TIMESTAMPTZ,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_last_claim TIMESTAMPTZ;
    v_streak INTEGER;
    v_balance BIGINT;
    v_reward BIGINT;
    v_existing_user UUID;
    v_existing_amount BIGINT;
    v_existing_type VARCHAR(64);
    v_existing_balance BIGINT;
    v_existing_metadata JSONB;
    v_existing_created_at TIMESTAMPTZ;
    v_existing_streak INTEGER;
BEGIN
    IF p_user_id IS NULL OR p_reference_id IS NULL
       OR length(btrim(p_reference_id)) = 0 OR length(p_reference_id) > 128 THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, 0, 0::BIGINT, NULL::TIMESTAMPTZ, 'INVALID_CLAIM'::TEXT;
        RETURN;
    END IF;

    -- Keep duplicate reference IDs from different users serialized as well.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_reference_id, 0));

    SELECT streak_count, last_daily_claim, destiny_coins
      INTO v_streak, v_last_claim, v_balance
      FROM public.users
     WHERE id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, 0, 0::BIGINT, NULL::TIMESTAMPTZ, 'USER_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    -- Retry after a lost HTTP response returns the committed result, and
    -- repairs legacy partial claims where the ledger committed but the old
    -- application failed before writing last_daily_claim.
    SELECT user_id, amount, type, balance_after, metadata, created_at
      INTO v_existing_user, v_existing_amount, v_existing_type,
           v_existing_balance, v_existing_metadata, v_existing_created_at
      FROM public.coin_transactions
     WHERE reference_id = p_reference_id;

    IF FOUND THEN
        IF v_existing_user <> p_user_id OR v_existing_type <> 'daily_reward' OR v_existing_amount <= 0 THEN
            RETURN QUERY SELECT FALSE, 0::BIGINT, v_streak, v_balance, v_last_claim, 'IDEMPOTENCY_KEY_REUSED'::TEXT;
            RETURN;
        END IF;

        v_existing_streak := 1;
        IF COALESCE(v_existing_metadata->>'streak', '') ~ '^[0-9]+$' THEN
            v_existing_streak := (v_existing_metadata->>'streak')::INTEGER;
        END IF;

        IF v_last_claim IS NULL OR v_last_claim < v_existing_created_at THEN
            v_last_claim := v_existing_created_at;
            v_streak := v_existing_streak;
            UPDATE public.users
               SET last_daily_claim = v_last_claim,
                   streak_count = v_streak,
                   updated_at = v_now
             WHERE id = p_user_id;
        END IF;

        RETURN QUERY SELECT TRUE, v_existing_amount, v_streak, v_balance,
                            v_last_claim + INTERVAL '24 hours', NULL::TEXT;
        RETURN;
    END IF;

    IF v_last_claim IS NOT NULL AND v_now < v_last_claim + INTERVAL '24 hours' THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_streak, v_balance,
                            v_last_claim + INTERVAL '24 hours', 'ALREADY_CLAIMED'::TEXT;
        RETURN;
    END IF;

    IF v_last_claim IS NULL THEN
        v_streak := 1;
    ELSIF v_now <= v_last_claim + INTERVAL '48 hours' THEN
        v_streak := v_streak + 1;
    ELSE
        v_streak := 1;
    END IF;

    v_reward := 50 + LEAST(GREATEST((v_streak - 1) * 10, 0), 100);
    IF v_balance > 9223372036854775807 - v_reward THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_streak, v_balance,
                            NULL::TIMESTAMPTZ, 'BALANCE_LIMIT_EXCEEDED'::TEXT;
        RETURN;
    END IF;

    UPDATE public.users
       SET destiny_coins = v_balance + v_reward,
           streak_count = v_streak,
           last_daily_claim = v_now,
           updated_at = v_now
     WHERE id = p_user_id;

    INSERT INTO public.coin_transactions (
        user_id, amount, balance_after, type, reference_id, metadata
    ) VALUES (
        p_user_id, v_reward, v_balance + v_reward, 'daily_reward',
        p_reference_id, jsonb_build_object('streak', v_streak)
    );

    RETURN QUERY SELECT TRUE, v_reward, v_streak, v_balance + v_reward,
                        v_now + INTERVAL '24 hours', NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_reward(uuid, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(uuid, character varying)
  TO service_role;
