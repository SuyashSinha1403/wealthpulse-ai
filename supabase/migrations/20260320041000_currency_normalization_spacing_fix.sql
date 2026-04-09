BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_for_dedup(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  lower(coalesce(input_text, '')),
                  '₹',
                  ' rs ',
                  'g'
                ),
                '\minr\M',
                ' rs ',
                'g'
              ),
              '\minr([0-9])',
              ' rs \1',
              'g'
            ),
            '\mrs\.\M',
            ' rs ',
            'g'
          ),
          '\mrs\.([0-9])',
          ' rs \1',
          'g'
        ),
        '[[:punct:]]+',
        ' ',
        'g'
      ),
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
      public.normalize_for_dedup(
        regexp_replace(
          lower(coalesce(input_text, '')),
          '\m(otp|code|pin|password)\M\s*[:\-]?\s*\d{4,8}\M',
          '\1 ',
          'g'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

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
  DROP CONSTRAINT IF EXISTS raw_events_user_dedup_key_unique;

UPDATE public.raw_events
SET dedup_key = encode(
  digest(
    coalesce(user_id::TEXT, '') ||
    public.normalize_for_dedup(body),
    'sha256'
  ),
  'hex'
)
WHERE dedup_key IS NULL OR btrim(dedup_key) = '' OR dedup_key <> encode(
  digest(
    coalesce(user_id::TEXT, '') ||
    public.normalize_for_dedup(body),
    'sha256'
  ),
  'hex'
);

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
    error_message = coalesce(e.error_message, 'dedup_collision_after_currency_spacing_fix')
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_user_dedup_key_unique UNIQUE (user_id, dedup_key);

COMMIT;
