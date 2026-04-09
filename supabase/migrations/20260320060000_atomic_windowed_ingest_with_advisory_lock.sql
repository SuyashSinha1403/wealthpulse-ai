BEGIN;

CREATE OR REPLACE FUNCTION public.ingest_raw_event_windowed(
  p_user_id UUID,
  p_app_package TEXT,
  p_title TEXT,
  p_body TEXT,
  p_received_at TIMESTAMPTZ,
  p_source_type TEXT,
  p_dedup_key TEXT,
  p_device_id TEXT,
  p_ingestion_status TEXT,
  p_event_type TEXT,
  p_raw_payload JSONB,
  p_ingested_at TIMESTAMPTZ,
  p_error_message TEXT,
  p_dedup_window_ms INTEGER DEFAULT 120000
)
RETURNS TABLE (event_id UUID, deduped BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id UUID;
  v_inserted_id UUID;
  v_window_ms INTEGER := GREATEST(COALESCE(p_dedup_window_ms, 120000), 0);
  v_lock_key BIGINT;
BEGIN
  v_lock_key := hashtextextended(p_user_id::TEXT || '|' || p_dedup_key, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT re.id
  INTO v_existing_id
  FROM public.raw_events re
  WHERE re.user_id = p_user_id
    AND re.dedup_key = p_dedup_key
    AND re.received_at >= p_received_at - make_interval(secs => v_window_ms::DOUBLE PRECISION / 1000.0)
    AND re.received_at <= p_received_at + make_interval(secs => v_window_ms::DOUBLE PRECISION / 1000.0)
  ORDER BY re.received_at DESC, re.ingested_at DESC, re.id DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, TRUE;
    RETURN;
  END IF;

  INSERT INTO public.raw_events (
    user_id,
    app_package,
    title,
    body,
    received_at,
    source_type,
    dedup_key,
    device_id,
    ingestion_status,
    event_type,
    raw_payload,
    ingested_at,
    error_message
  )
  VALUES (
    p_user_id,
    p_app_package,
    p_title,
    p_body,
    p_received_at,
    p_source_type,
    p_dedup_key,
    p_device_id,
    p_ingestion_status,
    p_event_type,
    p_raw_payload,
    p_ingested_at,
    p_error_message
  )
  RETURNING id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, FALSE;
END;
$$;

COMMIT;
