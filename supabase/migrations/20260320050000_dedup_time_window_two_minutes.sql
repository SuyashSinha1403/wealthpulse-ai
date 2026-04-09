BEGIN;

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_user_dedup_key_unique;

CREATE INDEX IF NOT EXISTS raw_events_user_dedup_key_received_at_idx
  ON public.raw_events (user_id, dedup_key, received_at DESC);

COMMIT;
