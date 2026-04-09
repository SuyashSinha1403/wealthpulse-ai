BEGIN;

-- =========================
-- raw_notifications dedup
-- =========================
-- Replace hash-based dedup index with the requested DB-level unique index:
-- (user_id, title, body, received_at)
DROP INDEX IF EXISTS public.raw_notifications_dedup_unique;

CREATE UNIQUE INDEX raw_notifications_dedup_unique
  ON public.raw_notifications (user_id, title, body, received_at);

-- =========================
-- transactions constraints
-- =========================
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('credit', 'debit'));

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_amount_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_check
  CHECK (amount >= 0);

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_confidence_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_confidence_check
  CHECK (confidence >= 0 AND confidence <= 1);

COMMIT;

