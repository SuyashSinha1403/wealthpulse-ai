BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.normalize_text(input_text TEXT, strip_numbers BOOLEAN DEFAULT true)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      CASE
        WHEN strip_numbers
          THEN regexp_replace(lower(coalesce(input_text, '')), '\m\d{4,8}\M', ' ', 'g')
        ELSE lower(coalesce(input_text, ''))
      END,
      '\s+',
      ' ',
      'g'
    )
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.raw_notifications') IS NOT NULL
     AND to_regclass('public.raw_events') IS NULL THEN
    ALTER TABLE public.raw_notifications RENAME TO raw_events;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.raw_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_package TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type TEXT NOT NULL DEFAULT 'notification',
  dedup_key TEXT NOT NULL,
  device_id TEXT,
  ingestion_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  CONSTRAINT raw_events_title_non_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT raw_events_body_non_empty CHECK (char_length(trim(body)) > 0),
  CONSTRAINT raw_events_source_type_check CHECK (source_type IN ('notification', 'sms', 'email')),
  CONSTRAINT raw_events_ingestion_status_check CHECK (ingestion_status IN ('pending', 'processed', 'failed'))
);

ALTER TABLE public.raw_events
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_status TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

UPDATE public.raw_events
SET source_type = 'notification'
WHERE source_type IS NULL OR btrim(source_type) = '';

UPDATE public.raw_events
SET ingestion_status = 'pending'
WHERE ingestion_status IS NULL OR btrim(ingestion_status) = '';

UPDATE public.raw_events
SET dedup_key = encode(
  digest(
    coalesce(user_id::TEXT, '') ||
    coalesce(app_package, '') ||
    public.normalize_text(body, true),
    'sha256'
  ),
  'hex'
)
WHERE dedup_key IS NULL OR btrim(dedup_key) = '';

ALTER TABLE public.raw_events
  ALTER COLUMN source_type SET DEFAULT 'notification',
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN dedup_key SET NOT NULL,
  ALTER COLUMN ingestion_status SET DEFAULT 'pending',
  ALTER COLUMN ingestion_status SET NOT NULL;

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_source_type_check,
  DROP CONSTRAINT IF EXISTS raw_events_ingestion_status_check,
  DROP CONSTRAINT IF EXISTS raw_events_title_non_empty,
  DROP CONSTRAINT IF EXISTS raw_events_body_non_empty;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_source_type_check CHECK (source_type IN ('notification', 'sms', 'email')),
  ADD CONSTRAINT raw_events_ingestion_status_check CHECK (ingestion_status IN ('pending', 'processed', 'failed')),
  ADD CONSTRAINT raw_events_title_non_empty CHECK (char_length(trim(title)) > 0),
  ADD CONSTRAINT raw_events_body_non_empty CHECK (char_length(trim(body)) > 0);

DROP INDEX IF EXISTS public.raw_notifications_dedup_unique;
DROP INDEX IF EXISTS public.raw_events_dedup_unique;

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_user_dedup_key_unique;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_user_dedup_key_unique UNIQUE (user_id, dedup_key);

DROP INDEX IF EXISTS public.raw_notifications_user_received_at_idx;
CREATE INDEX IF NOT EXISTS raw_events_user_received_at_idx
  ON public.raw_events (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS raw_events_user_created_at_idx
  ON public.raw_events (user_id, created_at DESC);

ALTER TABLE public.raw_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own raw_notifications" ON public.raw_events;
DROP POLICY IF EXISTS "Users can insert own raw_notifications" ON public.raw_events;
DROP POLICY IF EXISTS "Users can update own raw_notifications" ON public.raw_events;
DROP POLICY IF EXISTS "Users can delete own raw_notifications" ON public.raw_events;
DROP POLICY IF EXISTS "Users can view own raw_events" ON public.raw_events;
DROP POLICY IF EXISTS "Users can insert own raw_events" ON public.raw_events;

CREATE POLICY "Users can view own raw_events"
  ON public.raw_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own raw_events"
  ON public.raw_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'raw_notification_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'raw_event_id'
  ) THEN
    ALTER TABLE public.transactions RENAME COLUMN raw_notification_id TO raw_event_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'raw_event_id'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_raw_notification_id_fkey;
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_raw_event_id_fkey;
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_raw_event_id_fkey
      FOREIGN KEY (raw_event_id)
      REFERENCES public.raw_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
