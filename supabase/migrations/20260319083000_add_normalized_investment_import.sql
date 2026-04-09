ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.investments
SET asset_type = CASE
  WHEN asset_class IN ('US Stocks', 'Indian Stocks', 'ESOPs / RSUs') THEN 'equities'
  WHEN asset_class IN ('Mutual Funds', 'Global Funds') THEN 'mutual_funds'
  WHEN asset_class = 'Crypto' THEN 'crypto'
  WHEN asset_class = 'Fixed Deposits' THEN 'fixed_deposits'
  WHEN asset_class = 'Commodities' THEN 'gold'
  WHEN asset_class IN ('Bonds', 'PPF', 'NPS') THEN 'bonds'
  ELSE 'other'
END
WHERE asset_type = 'other';

UPDATE public.investment_transactions
SET asset_type = CASE
  WHEN asset_class IN ('US Stocks', 'Indian Stocks', 'ESOPs / RSUs') THEN 'equities'
  WHEN asset_class IN ('Mutual Funds', 'Global Funds') THEN 'mutual_funds'
  WHEN asset_class = 'Crypto' THEN 'crypto'
  WHEN asset_class = 'Fixed Deposits' THEN 'fixed_deposits'
  WHEN asset_class = 'Commodities' THEN 'gold'
  WHEN asset_class IN ('Bonds', 'PPF', 'NPS') THEN 'bonds'
  ELSE 'other'
END
WHERE asset_type = 'other';

ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_asset_type_check,
  DROP CONSTRAINT IF EXISTS investments_metadata_is_object;

ALTER TABLE public.investment_transactions
  DROP CONSTRAINT IF EXISTS investment_transactions_asset_type_check,
  DROP CONSTRAINT IF EXISTS investment_transactions_metadata_is_object;

ALTER TABLE public.investments
  ADD CONSTRAINT investments_asset_type_check
    CHECK (asset_type IN ('equities', 'mutual_funds', 'crypto', 'fixed_deposits', 'gold', 'bonds', 'other')),
  ADD CONSTRAINT investments_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object');

ALTER TABLE public.investment_transactions
  ADD CONSTRAINT investment_transactions_asset_type_check
    CHECK (asset_type IN ('equities', 'mutual_funds', 'crypto', 'fixed_deposits', 'gold', 'bonds', 'other')),
  ADD CONSTRAINT investment_transactions_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object');

CREATE OR REPLACE FUNCTION public.import_investment_record(
  p_user_id uuid,
  p_asset_type text,
  p_name text,
  p_quantity numeric,
  p_unit_price numeric,
  p_total_value numeric,
  p_currency text,
  p_date date,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ticker_symbol text DEFAULT NULL,
  p_fx_rate numeric DEFAULT 1,
  p_base_currency_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset_type text := lower(trim(coalesce(p_asset_type, '')));
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_asset_class text;
  v_api_connected boolean;
  v_ticker_symbol text;
  v_investment_id uuid;
  v_existing_qty numeric;
  v_existing_invested numeric;
  v_existing_base numeric;
  v_total_value numeric := coalesce(p_total_value, p_quantity * p_unit_price);
  v_base_currency_value numeric := coalesce(p_base_currency_value, coalesce(p_total_value, p_quantity * p_unit_price) * coalesce(p_fx_rate, 1));
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized import request';
  END IF;

  IF v_asset_type NOT IN ('equities', 'mutual_funds', 'crypto', 'fixed_deposits', 'gold', 'bonds', 'other') THEN
    RAISE EXCEPTION 'Unsupported asset_type: %', p_asset_type;
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be a JSON object';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Asset name is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date is required';
  END IF;

  IF coalesce(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF coalesce(p_unit_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Unit price must be greater than 0';
  END IF;

  IF coalesce(v_total_value, 0) <= 0 THEN
    RAISE EXCEPTION 'Total value must be greater than 0';
  END IF;

  IF v_currency = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  CASE v_asset_type
    WHEN 'equities' THEN
      v_asset_class := CASE
        WHEN upper(coalesce(p_ticker_symbol, '')) ~ '(\.NS|\.BO)$' OR v_currency = 'INR' THEN 'Indian Stocks'
        ELSE 'US Stocks'
      END;
      v_api_connected := true;
      IF trim(coalesce(p_ticker_symbol, '')) = '' THEN
        RAISE EXCEPTION 'Equities require ticker_symbol';
      END IF;
    WHEN 'mutual_funds' THEN
      v_asset_class := 'Mutual Funds';
      v_api_connected := false;
      IF NOT (v_metadata ? 'fund_name' OR v_metadata ? 'isin') THEN
        RAISE EXCEPTION 'Mutual funds require fund_name or isin in metadata';
      END IF;
    WHEN 'crypto' THEN
      v_asset_class := 'Crypto';
      v_api_connected := true;
      IF trim(coalesce(p_ticker_symbol, '')) = '' THEN
        RAISE EXCEPTION 'Crypto imports require ticker_symbol';
      END IF;
    WHEN 'fixed_deposits' THEN
      v_asset_class := 'Fixed Deposits';
      v_api_connected := false;
      IF NOT (v_metadata ? 'interest_rate' AND v_metadata ? 'start_date' AND v_metadata ? 'maturity_date') THEN
        RAISE EXCEPTION 'Fixed deposits require interest_rate, start_date, and maturity_date';
      END IF;
    WHEN 'gold' THEN
      v_asset_class := 'Commodities';
      v_api_connected := false;
      IF NOT (v_metadata ? 'type') THEN
        RAISE EXCEPTION 'Gold imports require type';
      END IF;
    WHEN 'bonds' THEN
      v_asset_class := 'Bonds';
      v_api_connected := false;
      IF NOT (v_metadata ? 'coupon_rate' AND v_metadata ? 'maturity_date' AND v_metadata ? 'face_value') THEN
        RAISE EXCEPTION 'Bonds require coupon_rate, maturity_date, and face_value';
      END IF;
    ELSE
      v_asset_class := 'Custom Asset';
      v_api_connected := false;
  END CASE;

  v_ticker_symbol := NULLIF(trim(coalesce(p_ticker_symbol, '')), '');

  IF v_asset_type = 'equities' AND v_ticker_symbol IS NOT NULL THEN
    v_ticker_symbol := upper(v_ticker_symbol);
  ELSIF v_asset_type = 'crypto' AND v_ticker_symbol IS NOT NULL THEN
    v_ticker_symbol := upper(v_ticker_symbol);
    IF right(v_ticker_symbol, 4) <> '-USD' THEN
      v_ticker_symbol := regexp_replace(v_ticker_symbol, '-USD$', '') || '-USD';
    END IF;
  END IF;

  IF v_api_connected AND v_ticker_symbol IS NOT NULL THEN
    SELECT id, coalesce(quantity, 0), coalesce(invested_value, 0), coalesce(base_currency_value, 0)
    INTO v_investment_id, v_existing_qty, v_existing_invested, v_existing_base
    FROM public.investments
    WHERE user_id = p_user_id
      AND ticker_symbol = v_ticker_symbol
    LIMIT 1;

    IF v_investment_id IS NULL THEN
      INSERT INTO public.investments (
        user_id,
        asset_type,
        asset_class,
        asset_name,
        ticker_symbol,
        quantity,
        avg_buy_price,
        invested_value,
        current_value,
        current_price,
        api_connected,
        currency,
        fx_rate,
        base_currency_value,
        last_updated,
        last_price_update,
        metadata
      )
      VALUES (
        p_user_id,
        v_asset_type,
        v_asset_class,
        v_name,
        v_ticker_symbol,
        p_quantity,
        p_unit_price,
        v_total_value,
        NULL,
        NULL,
        true,
        v_currency,
        p_fx_rate,
        v_base_currency_value,
        now(),
        NULL,
        v_metadata
      )
      RETURNING id INTO v_investment_id;
    ELSE
      UPDATE public.investments
      SET
        asset_type = v_asset_type,
        asset_class = v_asset_class,
        asset_name = COALESCE(NULLIF(asset_name, ''), v_name),
        quantity = coalesce(quantity, 0) + p_quantity,
        invested_value = coalesce(invested_value, 0) + v_total_value,
        base_currency_value = coalesce(base_currency_value, 0) + v_base_currency_value,
        avg_buy_price = CASE
          WHEN coalesce(quantity, 0) + p_quantity > 0
            THEN (coalesce(invested_value, 0) + v_total_value) / (coalesce(quantity, 0) + p_quantity)
          ELSE p_unit_price
        END,
        currency = v_currency,
        fx_rate = p_fx_rate,
        last_updated = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
      WHERE id = v_investment_id;
    END IF;
  ELSE
    INSERT INTO public.investments (
      user_id,
      asset_type,
      asset_class,
      asset_name,
      ticker_symbol,
      quantity,
      avg_buy_price,
      invested_value,
      current_value,
      current_price,
      api_connected,
      currency,
      fx_rate,
      base_currency_value,
      last_updated,
      last_price_update,
      metadata
    )
    VALUES (
      p_user_id,
      v_asset_type,
      v_asset_class,
      v_name,
      v_ticker_symbol,
      p_quantity,
      p_unit_price,
      v_total_value,
      v_total_value,
      NULL,
      false,
      v_currency,
      p_fx_rate,
      v_base_currency_value,
      now(),
      NULL,
      v_metadata
    )
    RETURNING id INTO v_investment_id;
  END IF;

  INSERT INTO public.investment_transactions (
    user_id,
    investment_id,
    ticker_symbol,
    asset_type,
    asset_class,
    asset_name,
    quantity,
    buy_price,
    currency,
    fx_rate_at_purchase,
    transaction_date,
    transaction_type,
    metadata
  )
  VALUES (
    p_user_id,
    v_investment_id,
    v_ticker_symbol,
    v_asset_type,
    v_asset_class,
    v_name,
    p_quantity,
    p_unit_price,
    v_currency,
    p_fx_rate,
    p_date,
    'buy',
    v_metadata
  );

  RETURN v_investment_id;
END;
$$;
