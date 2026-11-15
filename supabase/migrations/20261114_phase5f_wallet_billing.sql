-- Phase 5F: Commercial Auth, Server Credit Wallet & PromptPay Auto-Slip Top-Up Migration
-- Run this SQL in Supabase SQL Editor before switching NEXT_PUBLIC_BILLING_MODE=production.

-- 1. User Wallets (Server-owned balance: trial_credits + purchased_credits)
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_credits integer NOT NULL DEFAULT 15 CHECK (trial_credits >= 0),
  purchased_credits integer NOT NULL DEFAULT 0 CHECK (purchased_credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Immutable Credit Ledger
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_type text NOT NULL CHECK (tx_type IN ('grant_trial', 'topup', 'spend', 'refund')),
  amount integer NOT NULL,
  description text NOT NULL,
  model_id text,
  trans_ref text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions (user_id, created_at DESC);

-- 3. Tracked PromptPay Top-Up Orders (trans_ref UNIQUE prevents replay attacks)
CREATE TABLE IF NOT EXISTS public.topup_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text NOT NULL,
  expected_amount_thb numeric(10, 2) NOT NULL CHECK (expected_amount_thb > 0),
  credits_to_grant integer NOT NULL CHECK (credits_to_grant > 0),
  promptpay_payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'expired')),
  trans_ref text UNIQUE,
  slip_sender_bank text,
  slip_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_user_status
  ON public.topup_orders (user_id, status, created_at DESC);

-- 4. Enable Row Level Security (Users can READ their own rows only; ALL writes are restricted to service_role RPC)
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet" ON public.user_wallets;
CREATE POLICY "Users can view own wallet"
  ON public.user_wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own topup orders" ON public.topup_orders;
CREATE POLICY "Users can view own topup orders"
  ON public.topup_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Auto-provision Starter Wallet (15 Trial Credits) on request or signup
CREATE OR REPLACE FUNCTION public.init_user_wallet(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  trial_credits integer,
  purchased_credits integer,
  balance integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.user_wallets (user_id, trial_credits, purchased_credits)
  VALUES (p_user_id, 15, 0)
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    INSERT INTO public.credit_transactions (user_id, tx_type, amount, description)
    VALUES (
      p_user_id,
      'grant_trial',
      15,
      'Starter Trial Bonus (15 Credits) สำหรับทดลอง AI Lyrics / Director เบื้องต้น'
    );
  END IF;

  RETURN QUERY
  SELECT
    w.user_id,
    w.trial_credits,
    w.purchased_credits,
    (w.trial_credits + w.purchased_credits) AS balance,
    w.updated_at
  FROM public.user_wallets w
  WHERE w.user_id = p_user_id;
END;
$$;

-- 6. Atomic Credit Deduction (Row-Locked FOR UPDATE; consumes trial_credits before purchased_credits)
CREATE OR REPLACE FUNCTION public.atomic_deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_require_purchased boolean DEFAULT false,
  p_model_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_code text,
  trial_credits integer,
  purchased_credits integer,
  balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial integer;
  v_purchased integer;
  v_from_trial integer;
  v_from_purchased integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_AMOUNT'::text, 0, 0, 0;
    RETURN;
  END IF;

  PERFORM public.init_user_wallet(p_user_id);

  SELECT w.trial_credits, w.purchased_credits
  INTO v_trial, v_purchased
  FROM public.user_wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF p_require_purchased THEN
    IF v_purchased < p_amount THEN
      RETURN QUERY SELECT false, 'REQUIRES_PURCHASED_CREDITS'::text, v_trial, v_purchased, (v_trial + v_purchased);
      RETURN;
    END IF;
    v_from_trial := 0;
    v_from_purchased := p_amount;
  ELSE
    IF (v_trial + v_purchased) < p_amount THEN
      RETURN QUERY SELECT false, 'INSUFFICIENT_CREDITS'::text, v_trial, v_purchased, (v_trial + v_purchased);
      RETURN;
    END IF;
    v_from_trial := LEAST(v_trial, p_amount);
    v_from_purchased := p_amount - v_from_trial;
  END IF;

  UPDATE public.user_wallets
  SET
    trial_credits = v_trial - v_from_trial,
    purchased_credits = v_purchased - v_from_purchased,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, tx_type, amount, description, model_id, metadata)
  VALUES (
    p_user_id,
    'spend',
    -p_amount,
    COALESCE(NULLIF(trim(p_description), ''), 'AI Generation'),
    p_model_id,
    jsonb_build_object('from_trial', v_from_trial, 'from_purchased', v_from_purchased)
  );

  RETURN QUERY
  SELECT
    true,
    NULL::text,
    (v_trial - v_from_trial),
    (v_purchased - v_from_purchased),
    ((v_trial - v_from_trial) + (v_purchased - v_from_purchased));
END;
$$;

-- 7. Atomic Auto-Refund on External AI Failure
CREATE OR REPLACE FUNCTION public.atomic_refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_to_purchased boolean DEFAULT false,
  p_model_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  trial_credits integer,
  purchased_credits integer,
  balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial integer;
  v_purchased integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, 0, 0;
    RETURN;
  END IF;

  PERFORM public.init_user_wallet(p_user_id);

  SELECT w.trial_credits, w.purchased_credits
  INTO v_trial, v_purchased
  FROM public.user_wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF p_to_purchased THEN
    v_purchased := v_purchased + p_amount;
  ELSE
    v_trial := v_trial + p_amount;
  END IF;

  UPDATE public.user_wallets
  SET
    trial_credits = v_trial,
    purchased_credits = v_purchased,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, tx_type, amount, description, model_id)
  VALUES (
    p_user_id,
    'refund',
    p_amount,
    COALESCE(NULLIF(trim(p_description), ''), 'AI Failure Auto-Refund'),
    p_model_id
  );

  RETURN QUERY SELECT true, v_trial, v_purchased, (v_trial + v_purchased);
END;
$$;

-- 8. Atomic Top-Up Crediting from Verified Bank Slip (Single Transaction with trans_ref UNIQUE lock)
CREATE OR REPLACE FUNCTION public.atomic_credit_topup_from_slip(
  p_order_id uuid,
  p_user_id uuid,
  p_trans_ref text,
  p_credits integer,
  p_description text,
  p_sender_bank text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_code text,
  trial_credits integer,
  purchased_credits integer,
  balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_status text;
  v_trial integer;
  v_purchased integer;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 OR COALESCE(trim(p_trans_ref), '') = '' THEN
    RETURN QUERY SELECT false, 'INVALID_TOPUP_INPUT'::text, 0, 0, 0;
    RETURN;
  END IF;

  -- Lock order row belonging to user
  SELECT o.status INTO v_order_status
  FROM public.topup_orders o
  WHERE o.id = p_order_id AND o.user_id = p_user_id
  FOR UPDATE;

  IF v_order_status IS NULL THEN
    RETURN QUERY SELECT false, 'ORDER_NOT_FOUND'::text, 0, 0, 0;
    RETURN;
  END IF;

  IF v_order_status <> 'pending' THEN
    RETURN QUERY SELECT false, 'ORDER_ALREADY_SETTLED'::text, 0, 0, 0;
    RETURN;
  END IF;

  -- Ensure unique trans_ref across both orders and transactions
  IF EXISTS (SELECT 1 FROM public.topup_orders WHERE trans_ref = p_trans_ref)
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE trans_ref = p_trans_ref) THEN
    RETURN QUERY SELECT false, 'SLIP_DUPLICATE_REF'::text, 0, 0, 0;
    RETURN;
  END IF;

  PERFORM public.init_user_wallet(p_user_id);

  SELECT w.trial_credits, w.purchased_credits
  INTO v_trial, v_purchased
  FROM public.user_wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  UPDATE public.topup_orders
  SET
    status = 'paid',
    trans_ref = p_trans_ref,
    slip_sender_bank = p_sender_bank,
    slip_verified_at = now()
  WHERE id = p_order_id;

  v_purchased := v_purchased + p_credits;

  UPDATE public.user_wallets
  SET
    purchased_credits = v_purchased,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, tx_type, amount, description, trans_ref)
  VALUES (
    p_user_id,
    'topup',
    p_credits,
    COALESCE(NULLIF(trim(p_description), ''), 'PromptPay Top-Up'),
    p_trans_ref
  );

  RETURN QUERY SELECT true, NULL::text, v_trial, v_purchased, (v_trial + v_purchased);
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, 'SLIP_DUPLICATE_REF'::text, 0, 0, 0;
END;
$$;

-- Restrict RPC execution strictly to service_role (never expose RPC directly to anon/authenticated browsers)
REVOKE ALL ON FUNCTION public.init_user_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_deduct_credits(uuid, integer, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_refund_credits(uuid, integer, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_credit_topup_from_slip(uuid, uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.init_user_wallet(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_deduct_credits(uuid, integer, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_refund_credits(uuid, integer, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_credit_topup_from_slip(uuid, uuid, text, integer, text, text) TO service_role;
