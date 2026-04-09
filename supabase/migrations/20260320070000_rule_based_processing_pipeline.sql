BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.raw_events
  ADD COLUMN IF NOT EXISTS event_type TEXT;

UPDATE public.raw_events
SET event_type = 'unknown'
WHERE event_type IS NULL OR btrim(event_type) = '';

ALTER TABLE public.raw_events
  ALTER COLUMN event_type SET DEFAULT 'unknown',
  ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_event_type_check;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_event_type_check
  CHECK (event_type IN ('debit', 'credit', 'otp', 'spam', 'unknown'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

UPDATE public.transactions
SET payment_method = 'UNKNOWN'
WHERE payment_method IS NULL OR btrim(payment_method) = '';

ALTER TABLE public.transactions
  ALTER COLUMN payment_method SET DEFAULT 'UNKNOWN',
  ALTER COLUMN payment_method SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_raw_event_id_unique
  ON public.transactions (raw_event_id)
  WHERE raw_event_id IS NOT NULL;

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
  ELSIF v_text ~ '\m(debited|paid|spent|sent)\M' THEN
    RETURN 'debit';
  ELSIF v_text ~ '\m(credited|received)\M' THEN
    RETURN 'credit';
  ELSIF v_text ~ '\m(offer|cashback|reward|discount|sale)\M' THEN
    RETURN 'spam';
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
  v_amount NUMERIC := NULL;
  v_merchant_match TEXT[];
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
    v_merchant := trim(regexp_replace(v_merchant_match[1], '[^a-z0-9 &.-]+', '', 'g'));
    v_merchant := regexp_replace(v_merchant, '\s+', ' ', 'g');
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

      IF v_type IN ('otp', 'spam') THEN
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
      IF v_amount IS NULL OR v_amount < 0 THEN
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

GRANT EXECUTE ON FUNCTION public.process_raw_events_batch(INTEGER) TO service_role;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      SELECT jobid INTO v_job_id
      FROM cron.job
      WHERE jobname = 'wealthpulse_process_raw_events_batch'
      LIMIT 1;

      IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
      END IF;

      PERFORM cron.schedule(
        'wealthpulse_process_raw_events_batch',
        '*/2 * * * *',
        'SELECT public.process_raw_events_batch(50);'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
    END;
  END IF;
END $$;

COMMIT;
