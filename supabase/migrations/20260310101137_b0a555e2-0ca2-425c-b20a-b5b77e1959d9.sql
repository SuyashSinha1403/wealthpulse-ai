
ALTER TABLE public.liabilities
  ADD COLUMN IF NOT EXISTS original_loan_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_tenure_months integer,
  ADD COLUMN IF NOT EXISTS loan_start_date date,
  ADD COLUMN IF NOT EXISTS lender_name text;
