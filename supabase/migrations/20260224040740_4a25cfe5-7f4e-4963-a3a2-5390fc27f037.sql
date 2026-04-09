
-- Add currency fields to bank_accounts
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS base_currency_value numeric NOT NULL DEFAULT 0;

-- Add currency fields to expenses (fx_rate locked at creation)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS base_currency_value numeric NOT NULL DEFAULT 0;

-- Add currency fields to liabilities
ALTER TABLE public.liabilities
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS base_currency_value numeric NOT NULL DEFAULT 0;

-- Backfill existing records: set base_currency_value = original amount (assuming same as base currency)
UPDATE public.bank_accounts SET base_currency_value = balance, fx_rate = 1 WHERE fx_rate IS NULL;
UPDATE public.expenses SET base_currency_value = amount, fx_rate = 1 WHERE fx_rate IS NULL;
UPDATE public.liabilities SET base_currency_value = outstanding_amount, fx_rate = 1 WHERE fx_rate IS NULL;
