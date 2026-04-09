BEGIN;

CREATE OR REPLACE FUNCTION public.classify_event(p_body TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := regexp_replace(lower(coalesce(p_body, '')), '\s+', ' ', 'g');
BEGIN
  IF v_text ~ '\m(otp|code|verification)\M' AND v_text ~ '\m\d{4,8}\M' THEN
    RETURN 'otp';
  ELSIF v_text ~ '\m(offer|cashback|reward|discount|sale)\M' THEN
    RETURN 'spam';
  ELSIF v_text ~ '\m(debited|paid|spent|sent|payment to)\M'
     OR v_text ~ '\mdebited from a/c\M'
     OR v_text ~ '\mspent on card\M' THEN
    RETURN 'debit';
  ELSIF v_text ~ '\m(credited|received|payment received)\M'
     OR v_text ~ '\mcredited in a/c\M'
     OR v_text ~ '\mcredited to\M' THEN
    RETURN 'credit';
  END IF;

  RETURN 'unknown';
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_transaction(p_body TEXT, p_event_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := lower(coalesce(p_body, ''));
  v_norm TEXT := regexp_replace(v_text, '\s+', ' ', 'g');
  v_amount_match TEXT[];
  v_amount_raw TEXT;
  v_amount NUMERIC := NULL;
  v_currency_match BOOLEAN := FALSE;
  v_suspicious_numeric_without_currency BOOLEAN := FALSE;
  v_merchant_match TEXT[];
  v_merchant_raw TEXT := NULL;
  v_merchant TEXT := NULL;
  v_payment_method TEXT := 'UNKNOWN';
  v_currency TEXT := 'UNKNOWN';
BEGIN
  v_currency_match := v_text ~ '(₹|\mrs\.?\M|\minr\M|\minr(?=\d)|\mrs(?=\d))';

  IF v_currency_match THEN
    v_amount_match := regexp_match(
      v_text,
      '(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)'
    );

    IF v_amount_match IS NOT NULL AND array_length(v_amount_match, 1) >= 1 THEN
      v_amount_raw := replace(v_amount_match[1], ',', '');
      v_amount := v_amount_raw::NUMERIC;
      v_currency := 'INR';
    END IF;
  ELSE
    v_suspicious_numeric_without_currency := v_text ~ '\m\d{4,8}\M';
    IF v_suspicious_numeric_without_currency THEN
      v_amount := NULL;
    END IF;
  END IF;

  -- Reject only non-positive values.
  IF v_amount IS NOT NULL AND v_amount <= 0 THEN
    v_amount := NULL;
    v_currency := 'UNKNOWN';
  END IF;

  v_merchant_match := regexp_match(
    v_norm,
    '\m(?:to|at|from)\s+([a-z0-9][a-z0-9 &\.-]{1,100})'
  );

  IF v_merchant_match IS NOT NULL AND array_length(v_merchant_match, 1) >= 1 THEN
    v_merchant_raw := trim(regexp_replace(v_merchant_match[1], '[^a-z0-9 &.-]+', '', 'g'));
    v_merchant_raw := lower(regexp_replace(v_merchant_raw, '\s+', ' ', 'g'));
    v_merchant_raw := trim(regexp_replace(
      v_merchant_raw,
      '\s+(via upi|upi|card|txn|ref|reference)(\s+[a-z0-9-]+)*$',
      '',
      'g'
    ));

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

CREATE OR REPLACE FUNCTION public.process_raw_events_batch(p_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 50), 1);
  v_type TEXT;
  v_parsed JSONB;
  v_amount NUMERIC;
  v_merchant TEXT;
  v_payment_method TEXT;
  v_currency TEXT;
  v_inserted_rows INTEGER;
  v_processed_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT *
    FROM public.raw_events
    WHERE ingestion_status = 'pending'
    ORDER BY created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.raw_events
      SET ingestion_status = 'processing',
          error_message = NULL
      WHERE id = rec.id;

      v_type := public.classify_event(rec.body);

      IF v_type IN ('otp', 'spam', 'unknown') THEN
        UPDATE public.raw_events
        SET ingestion_status = 'processed',
            event_type = v_type,
            processed = true,
            error_message = NULL
        WHERE id = rec.id;

        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      v_parsed := public.parse_transaction(rec.body, v_type);
      v_amount := NULLIF(v_parsed->>'amount', '')::NUMERIC;
      v_merchant := NULLIF(v_parsed->>'merchant', '');
      v_payment_method := COALESCE(NULLIF(v_parsed->>'payment_method', ''), 'UNKNOWN');
      v_currency := COALESCE(NULLIF(v_parsed->>'currency', ''), 'UNKNOWN');

      IF v_type NOT IN ('debit', 'credit') THEN
        RAISE EXCEPTION 'unsupported event_type for transaction parsing: %', v_type;
      END IF;
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'amount extraction failed';
      END IF;

      INSERT INTO public.transactions (
        user_id,
        type,
        amount,
        currency,
        merchant,
        source,
        confidence,
        raw_event_id,
        payment_method
      )
      VALUES (
        rec.user_id,
        v_type,
        v_amount,
        v_currency,
        v_merchant,
        'raw_event_rule_engine',
        0.90,
        rec.id,
        v_payment_method
      )
      ON CONFLICT (raw_event_id) DO NOTHING;

      GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

      UPDATE public.raw_events
      SET ingestion_status = 'processed',
          event_type = v_type,
          processed = true,
          error_message = NULL
      WHERE id = rec.id;

      IF v_inserted_rows = 0 THEN
        v_skipped_count := v_skipped_count + 1;
      ELSE
        v_processed_count := v_processed_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.raw_events
      SET ingestion_status = 'failed',
          event_type = COALESCE(v_type, 'unknown'),
          error_message = left(SQLERRM, 500)
      WHERE id = rec.id;
      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed_count,
    'skipped', v_skipped_count,
    'failed', v_failed_count
  );
END;
$$;

COMMIT;
