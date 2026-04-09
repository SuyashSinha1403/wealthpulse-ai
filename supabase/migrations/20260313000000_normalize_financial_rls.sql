ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can insert own bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can update own bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can delete own bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users manage their own data" ON public.bank_accounts;

CREATE POLICY "Users manage their own data"
ON public.bank_accounts
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can insert own bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can update own bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can delete own bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users manage their own data" ON public.bank_transactions;

CREATE POLICY "Users manage their own data"
ON public.bank_transactions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can insert own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can update own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can delete own investments" ON public.investments;
DROP POLICY IF EXISTS "Users manage their own data" ON public.investments;

CREATE POLICY "Users manage their own data"
ON public.investments
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own transactions" ON public.investment_transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.investment_transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.investment_transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.investment_transactions;
DROP POLICY IF EXISTS "Users manage their own data" ON public.investment_transactions;

CREATE POLICY "Users manage their own data"
ON public.investment_transactions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users manage their own data" ON public.expenses;

CREATE POLICY "Users manage their own data"
ON public.expenses
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own income_entries" ON public.income_entries;
DROP POLICY IF EXISTS "Users can insert own income_entries" ON public.income_entries;
DROP POLICY IF EXISTS "Users can update own income_entries" ON public.income_entries;
DROP POLICY IF EXISTS "Users can delete own income_entries" ON public.income_entries;
DROP POLICY IF EXISTS "Users manage their own data" ON public.income_entries;

CREATE POLICY "Users manage their own data"
ON public.income_entries
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own liabilities" ON public.liabilities;
DROP POLICY IF EXISTS "Users can insert own liabilities" ON public.liabilities;
DROP POLICY IF EXISTS "Users can update own liabilities" ON public.liabilities;
DROP POLICY IF EXISTS "Users can delete own liabilities" ON public.liabilities;
DROP POLICY IF EXISTS "Users manage their own data" ON public.liabilities;

CREATE POLICY "Users manage their own data"
ON public.liabilities
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
