
-- Table to track bank account transactions linked to expenses
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  linked_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL DEFAULT 'DEBIT',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank_transactions"
ON public.bank_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank_transactions"
ON public.bank_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank_transactions"
ON public.bank_transactions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bank_transactions"
ON public.bank_transactions FOR DELETE
USING (auth.uid() = user_id);

-- Atomic function: create expense, deduct bank balance, create bank transaction
CREATE OR REPLACE FUNCTION public.create_expense_with_deduction(
  p_user_id UUID,
  p_amount NUMERIC,
  p_category TEXT,
  p_expense_group TEXT,
  p_payment_method TEXT,
  p_description TEXT,
  p_date DATE,
  p_is_recurring BOOLEAN,
  p_currency TEXT,
  p_fx_rate NUMERIC,
  p_base_currency_value NUMERIC,
  p_bank_account_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id UUID;
  v_balance NUMERIC;
  v_account_currency TEXT;
BEGIN
  -- If bank deduction requested, validate balance
  IF p_bank_account_id IS NOT NULL THEN
    SELECT balance, currency INTO v_balance, v_account_currency
    FROM public.bank_accounts
    WHERE id = p_bank_account_id AND user_id = p_user_id
    FOR UPDATE; -- lock the row

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Bank account not found');
    END IF;

    IF v_balance < p_amount THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
  END IF;

  -- Insert expense
  INSERT INTO public.expenses (user_id, amount, category, expense_group, payment_method, description, date, is_recurring, currency, fx_rate, base_currency_value)
  VALUES (p_user_id, p_amount, p_category, p_expense_group, p_payment_method, p_description, p_date, p_is_recurring, p_currency, p_fx_rate, p_base_currency_value)
  RETURNING id INTO v_expense_id;

  -- If bank deduction requested, deduct and log
  IF p_bank_account_id IS NOT NULL THEN
    UPDATE public.bank_accounts
    SET balance = balance - p_amount,
        base_currency_value = (balance - p_amount) * COALESCE(fx_rate, 1)
    WHERE id = p_bank_account_id AND user_id = p_user_id;

    INSERT INTO public.bank_transactions (user_id, bank_account_id, linked_expense_id, transaction_type, amount, description, transaction_date)
    VALUES (p_user_id, p_bank_account_id, v_expense_id, 'DEBIT', p_amount, p_description, p_date);
  END IF;

  RETURN json_build_object('success', true, 'expense_id', v_expense_id);
END;
$$;
