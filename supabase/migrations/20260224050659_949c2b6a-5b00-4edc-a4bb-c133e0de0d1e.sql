
-- Create investment_transactions table
CREATE TABLE public.investment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  investment_id UUID REFERENCES public.investments(id) ON DELETE CASCADE,
  ticker_symbol TEXT,
  asset_class TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  buy_price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  fx_rate_at_purchase NUMERIC,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL DEFAULT 'buy',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own transactions"
  ON public.investment_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.investment_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.investment_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.investment_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-migrate existing holdings as synthetic transactions
INSERT INTO public.investment_transactions (
  user_id, investment_id, ticker_symbol, asset_class, asset_name,
  quantity, buy_price, currency, fx_rate_at_purchase, transaction_date, transaction_type
)
SELECT
  i.user_id,
  i.id,
  i.ticker_symbol,
  i.asset_class,
  i.asset_name,
  COALESCE(i.quantity, 1),
  COALESCE(i.avg_buy_price, i.invested_value),
  i.currency,
  i.fx_rate,
  COALESCE(i.created_at::date, CURRENT_DATE),
  'buy'
FROM public.investments i
WHERE i.api_connected = true AND i.quantity IS NOT NULL AND i.quantity > 0;
