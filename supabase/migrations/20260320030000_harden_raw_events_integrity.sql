BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.normalize_for_dedup(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      lower(coalesce(input_text, '')),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_for_parsing(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(input_text, '')),
        '\m\d{4,8}\M',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- Backward-compat shim for older DB usage.
CREATE OR REPLACE FUNCTION public.normalize_text(input_text TEXT, strip_numbers BOOLEAN DEFAULT true)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN strip_numbers THEN public.normalize_for_parsing(input_text)
    ELSE public.normalize_for_dedup(input_text)
  END;
$$;

ALTER TABLE public.raw_events
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS event_type TEXT;

UPDATE public.raw_events
SET ingested_at = coalesce(created_at, now())
WHERE ingested_at IS NULL;

UPDATE public.raw_events
SET event_type = 'unknown'
WHERE event_type IS NULL OR btrim(event_type) = '';

UPDATE public.raw_events
SET ingestion_status = 'pending'
WHERE ingestion_status IS NULL OR btrim(ingestion_status) = '';

ALTER TABLE public.raw_events
  ALTER COLUMN ingested_at SET DEFAULT now(),
  ALTER COLUMN ingested_at SET NOT NULL,
  ALTER COLUMN event_type SET DEFAULT 'unknown',
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN ingestion_status SET DEFAULT 'pending',
  ALTER COLUMN ingestion_status SET NOT NULL;

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_ingestion_status_check,
  DROP CONSTRAINT IF EXISTS raw_events_event_type_check;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_ingestion_status_check
  CHECK (ingestion_status IN ('pending', 'processing', 'processed', 'failed')),
  ADD CONSTRAINT raw_events_event_type_check
  CHECK (event_type IN ('debit', 'credit', 'otp', 'spam', 'unknown'));

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_user_dedup_key_unique;

UPDATE public.raw_events
SET dedup_key = encode(
  digest(
    coalesce(user_id::TEXT, '') ||
    coalesce(app_package, '') ||
    public.normalize_for_dedup(body),
    'sha256'
  ),
  'hex'
)
WHERE dedup_key IS NULL OR btrim(dedup_key) = '' OR dedup_key <> encode(
  digest(
    coalesce(user_id::TEXT, '') ||
    coalesce(app_package, '') ||
    public.normalize_for_dedup(body),
    'sha256'
  ),
  'hex'
);

-- If historical rows now collide under the corrected dedup rule, preserve the oldest
-- canonical event and mark newer collisions as failed for auditability.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, dedup_key
      ORDER BY ingested_at ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.raw_events
)
UPDATE public.raw_events e
SET ingestion_status = 'failed',
    error_message = coalesce(e.error_message, 'dedup_collision_during_migration')
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_user_dedup_key_unique UNIQUE (user_id, dedup_key);

CREATE INDEX IF NOT EXISTS raw_events_user_status_created_at_idx
  ON public.raw_events (user_id, ingestion_status, created_at);

CREATE INDEX IF NOT EXISTS raw_events_user_ingested_at_idx
  ON public.raw_events (user_id, ingested_at DESC);

COMMIT;
