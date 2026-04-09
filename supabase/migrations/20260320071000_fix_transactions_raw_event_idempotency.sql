BEGIN;

DROP INDEX IF EXISTS public.transactions_raw_event_id_unique;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_raw_event_id_unique;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_raw_event_id_unique UNIQUE (raw_event_id);

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

COMMIT;
