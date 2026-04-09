
ALTER TABLE public.liabilities
ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_payment_percent numeric DEFAULT 5;
