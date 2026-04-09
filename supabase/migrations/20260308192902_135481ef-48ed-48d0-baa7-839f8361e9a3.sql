
CREATE TABLE public.stocks_metadata (
  ticker TEXT NOT NULL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT 'Other',
  industry TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stocks_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read stocks_metadata"
  ON public.stocks_metadata FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone authenticated can insert stocks_metadata"
  ON public.stocks_metadata FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone authenticated can update stocks_metadata"
  ON public.stocks_metadata FOR UPDATE TO authenticated
  USING (true);
