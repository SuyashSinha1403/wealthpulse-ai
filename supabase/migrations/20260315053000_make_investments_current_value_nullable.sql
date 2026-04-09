ALTER TABLE public.investments
ALTER COLUMN current_value DROP NOT NULL;

ALTER TABLE public.investments
ALTER COLUMN current_value DROP DEFAULT;
