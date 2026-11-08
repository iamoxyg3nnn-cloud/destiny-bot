-- ====================================================================
-- DESTINY BOT: SUPABASE POSTGRESQL FUNCTIONS & TRIGGERS (002)
-- ====================================================================

-- 1. ATOMIC COIN TRANSACTION WITH IDEMPOTENCY GUARD
-- Ensures that coins cannot go below 0, duplicate reference_ids are rejected,
-- and the balance is updated atomically with a single write lock.
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
AS $$
DECLARE
    v_current_balance BIGINT;
    v_new_balance BIGINT;
    v_tx_id UUID;
BEGIN
    -- Check if reference_id already exists (idempotency check)
    IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference_id = p_reference_id) THEN
        SELECT balance_after, id INTO v_new_balance, v_tx_id 
        FROM public.coin_transactions 
        WHERE reference_id = p_reference_id;
        
        RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, 'DUPLICATE_IDEMPOTENT_SUCCESS'::TEXT;
        RETURN;
    END IF;

    -- Lock the user row for atomic update
    SELECT destiny_coins INTO v_current_balance
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, 'USER_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    -- Check if debit would cause negative balance
    v_new_balance := v_current_balance + p_amount;
    IF v_new_balance < 0 THEN
        RETURN QUERY SELECT FALSE, v_current_balance, NULL::UUID, 'INSUFFICIENT_FUNDS'::TEXT;
        RETURN;
    END IF;

    -- Update user balance
    UPDATE public.users
    SET destiny_coins = v_new_balance,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Insert audit transaction
    INSERT INTO public.coin_transactions (
        user_id,
        amount,
        balance_after,
        type,
        reference_id,
        metadata
    ) VALUES (
        p_user_id,
        p_amount,
        v_new_balance,
        p_type,
        p_reference_id,
        p_metadata
    ) RETURNING id INTO v_tx_id;

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, NULL::TEXT;
END;
$$;

-- 2. CONNECTION LEVEL CALCULATOR
-- Computes connection tier based on connection XP:
-- Strangers (0-50), Acquaintances (51-150), Familiar (151-350), 
-- Connection (351-700), Trusted Connection (701-1200), Destiny (1201+)
CREATE OR REPLACE FUNCTION public.calculate_connection_tier(p_xp INT)
RETURNS VARCHAR(32)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_xp >= 1201 THEN
        RETURN 'Destiny';
    ELSIF p_xp >= 701 THEN
        RETURN 'Trusted Connection';
    ELSIF p_xp >= 351 THEN
        RETURN 'Connection';
    ELSIF p_xp >= 151 THEN
        RETURN 'Familiar';
    ELSIF p_xp >= 51 THEN
        RETURN 'Acquaintances';
    ELSE
        RETURN 'Strangers';
    END IF;
END;
$$;

-- 3. TRIGGER TO AUTO-UPDATE CONNECTION LEVEL ON ROOM XP CHANGE
CREATE OR REPLACE FUNCTION public.trg_update_room_connection_level()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.connection_level := public.calculate_connection_tier(NEW.connection_xp);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_xp ON public.rooms;
CREATE TRIGGER trg_rooms_xp
BEFORE UPDATE OF connection_xp ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_room_connection_level();

-- 4. FUNCTION TO ATOMICALLY END ROOM
CREATE OR REPLACE FUNCTION public.end_room(
    p_room_id UUID,
    p_end_reason VARCHAR(64)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_u1 UUID;
    v_u2 UUID;
BEGIN
    UPDATE public.rooms
    SET status = 'ended',
        ended_at = NOW(),
        end_reason = p_end_reason,
        updated_at = NOW()
    WHERE id = p_room_id AND status = 'active'
    RETURNING user1_id, user2_id INTO v_u1, v_u2;

    IF FOUND THEN
        -- Clear active_room_id for both users
        UPDATE public.users
        SET active_room_id = NULL
        WHERE id IN (v_u1, v_u2);
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
