ALTER TABLE public.investments
ADD COLUMN IF NOT EXISTS current_price numeric,
ADD COLUMN IF NOT EXISTS last_price_update timestamp with time zone;
