-- WealthPulse ingestion layer: raw notifications + transactions (no parsing yet)
-- Creates tables and enforces deduplication by SHA-256 hash of:
-- title + body + received_at (serialized to UTC ISO with milliseconds).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- raw_notifications
-- =========================
CREATE TABLE public.raw_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_package TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT raw_notifications_title_non_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT raw_notifications_body_non_empty CHECK (char_length(trim(body)) > 0)
);

ALTER TABLE public.raw_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own raw_notifications"
  ON public.raw_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own raw_notifications"
  ON public.raw_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own raw_notifications"
  ON public.raw_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own raw_notifications"
  ON public.raw_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Deduplication:
-- Prevent duplicate inserts for the same user with the same (title, body, received_at).
-- The hash is based on:
-- title + body + received_at_utc_iso8601_ms (e.g. 2026-03-20T12:34:56.789Z)
CREATE UNIQUE INDEX raw_notifications_dedup_unique
  ON public.raw_notifications (
    user_id,
    (
      encode(
        digest(
          (title || body || to_char(received_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          'sha256'
        ),
        'hex'
      )
    )
  );

CREATE INDEX raw_notifications_user_received_at_idx
  ON public.raw_notifications (user_id, received_at DESC);

-- =========================
-- transactions (parsing later)
-- =========================
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  amount NUMERIC,
  currency TEXT,
  merchant TEXT,
  source TEXT,
  confidence NUMERIC,
  raw_notification_id UUID REFERENCES public.raw_notifications(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions
  FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;

