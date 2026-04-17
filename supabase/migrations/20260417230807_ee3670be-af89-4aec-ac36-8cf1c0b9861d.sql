-- 1. Fix RPC SECURITY DEFINER bypass: use auth.uid() instead of trusting client p_user_id
DROP FUNCTION IF EXISTS public.create_expense_with_deduction(uuid, numeric, text, text, text, text, date, boolean, text, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION public.create_expense_with_deduction(
  p_amount numeric,
  p_category text,
  p_expense_group text,
  p_payment_method text,
  p_description text,
  p_date date,
  p_is_recurring boolean,
  p_currency text,
  p_fx_rate numeric,
  p_base_currency_value numeric,
  p_bank_account_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expense_id UUID;
  v_balance NUMERIC;
  v_account_currency TEXT;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_bank_account_id IS NOT NULL THEN
    SELECT balance, currency INTO v_balance, v_account_currency
    FROM public.bank_accounts
    WHERE id = p_bank_account_id AND user_id = v_caller
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Bank account not found');
    END IF;

    IF v_balance < p_amount THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
  END IF;

  INSERT INTO public.expenses (user_id, amount, category, expense_group, payment_method, description, date, is_recurring, currency, fx_rate, base_currency_value)
  VALUES (v_caller, p_amount, p_category, p_expense_group, p_payment_method, p_description, p_date, p_is_recurring, p_currency, p_fx_rate, p_base_currency_value)
  RETURNING id INTO v_expense_id;

  IF p_bank_account_id IS NOT NULL THEN
    UPDATE public.bank_accounts
    SET balance = balance - p_amount,
        base_currency_value = (balance - p_amount) * COALESCE(fx_rate, 1)
    WHERE id = p_bank_account_id AND user_id = v_caller;

    INSERT INTO public.bank_transactions (user_id, bank_account_id, linked_expense_id, transaction_type, amount, description, transaction_date)
    VALUES (v_caller, p_bank_account_id, v_expense_id, 'DEBIT', p_amount, p_description, p_date);
  END IF;

  RETURN json_build_object('success', true, 'expense_id', v_expense_id);
END;
$function$;

-- 2. Lock down stocks_metadata writes: remove any-authenticated INSERT/UPDATE
DROP POLICY IF EXISTS "Anyone authenticated can insert stocks_metadata" ON public.stocks_metadata;
DROP POLICY IF EXISTS "Anyone authenticated can update stocks_metadata" ON public.stocks_metadata;
-- SELECT remains for authenticated users; writes now only allowed via service role (edge functions)

-- 3. Restrict RLS policies on sensitive tables from 'public' role to 'authenticated' only
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bank_accounts','bank_transactions','expenses','investments','investment_transactions','liabilities','profiles')
      AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;