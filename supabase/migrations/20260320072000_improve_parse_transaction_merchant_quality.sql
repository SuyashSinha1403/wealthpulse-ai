BEGIN;

CREATE OR REPLACE FUNCTION public.parse_transaction(p_body TEXT, p_event_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := lower(coalesce(p_body, ''));
  v_norm TEXT := regexp_replace(v_text, '\s+', ' ', 'g');
  v_amount_match TEXT[];
  v_amount NUMERIC := NULL;
  v_merchant_match TEXT[];
  v_merchant_raw TEXT := NULL;
  v_merchant TEXT := NULL;
  v_payment_method TEXT := 'UNKNOWN';
  v_currency TEXT := 'UNKNOWN';
BEGIN
  v_amount_match := regexp_match(
    v_text,
    '(?:₹|rs\.?|inr)\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)'
  );

  IF v_amount_match IS NOT NULL AND array_length(v_amount_match, 1) >= 1 THEN
    v_amount := replace(v_amount_match[1], ',', '')::NUMERIC;
    v_currency := 'INR';
  END IF;

  v_merchant_match := regexp_match(
    v_norm,
    '\m(?:to|at)\s+([a-z0-9][a-z0-9 &\.-]{1,80})'
  );
  IF v_merchant_match IS NOT NULL AND array_length(v_merchant_match, 1) >= 1 THEN
    v_merchant_raw := trim(regexp_replace(v_merchant_match[1], '[^a-z0-9 &.-]+', '', 'g'));
    v_merchant_raw := regexp_replace(v_merchant_raw, '\s+', ' ', 'g');
    v_merchant_raw := lower(v_merchant_raw);

    IF v_merchant_raw ~ '\m(your account|account|a/c|bank|wallet)\M' THEN
      v_merchant := 'self';
    ELSIF length(v_merchant_raw) > 2 AND v_merchant_raw ~ '[a-z]' THEN
      v_merchant := v_merchant_raw;
    ELSE
      v_merchant := NULL;
    END IF;
  END IF;

  IF v_norm LIKE '%upi%' THEN
    v_payment_method := 'UPI';
  ELSIF v_norm LIKE '%card%' THEN
    v_payment_method := 'CARD';
  END IF;

  RETURN jsonb_build_object(
    'amount', v_amount,
    'merchant', v_merchant,
    'transaction_type', CASE WHEN p_event_type IN ('debit', 'credit') THEN p_event_type ELSE NULL END,
    'payment_method', v_payment_method,
    'currency', v_currency
  );
END;
$$;

COMMIT;
