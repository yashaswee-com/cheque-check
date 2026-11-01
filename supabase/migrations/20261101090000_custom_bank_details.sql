-- Optional descriptive details for banks. Private (custom) banks keep
-- category = 'custom' for ownership policies; bank_type records the kind of
-- institution the user selected.
ALTER TYPE public.bank_category ADD VALUE IF NOT EXISTS 'payments';

ALTER TABLE public.banks
  ADD COLUMN abbreviation text,
  ADD COLUMN bank_type public.bank_category,
  ADD COLUMN country_code text NOT NULL DEFAULT 'IN';

ALTER TABLE public.banks ADD CONSTRAINT banks_abbreviation_check CHECK (
  abbreviation IS NULL OR (
    abbreviation = btrim(abbreviation)
    AND length(abbreviation) BETWEEN 2 AND 10
    AND abbreviation ~ '^[[:alnum:]&. -]+$'
    AND abbreviation ~ '[[:alpha:]]'
  )
);
ALTER TABLE public.banks ADD CONSTRAINT banks_bank_type_check
  CHECK (bank_type IS NULL OR bank_type::text <> 'custom');
ALTER TABLE public.banks ADD CONSTRAINT banks_country_code_check
  CHECK (country_code ~ '^[A-Z]{2}$');
