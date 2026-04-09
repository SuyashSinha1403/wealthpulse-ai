
-- Add multi-currency fields to investments
ALTER TABLE public.investments
  ADD COLUMN currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN fx_rate numeric NULL,
  ADD COLUMN base_currency_value numeric NOT NULL DEFAULT 0;

-- Update existing investments: set base_currency_value = current_value (assuming INR base)
UPDATE public.investments SET base_currency_value = current_value, fx_rate = 1.0 WHERE currency = 'INR';
