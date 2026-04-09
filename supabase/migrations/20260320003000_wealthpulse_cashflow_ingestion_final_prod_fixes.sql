BEGIN;

-- Required extension for UUID + hashing / digests (safe no-op if already present)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- raw_notifications deduplication: use second precision
-- =========================================================
DROP INDEX IF EXISTS public.raw_notifications_dedup_unique;

CREATE UNIQUE INDEX raw_notifications_dedup_unique
  ON public.raw_notifications (
    user_id,
    title,
    body,
    date_trunc('second', received_at)
  );

-- ===================================
-- transactions table hardening
-- ===================================
ALTER TABLE public.transactions
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN source SET NOT NULL;

COMMIT;

