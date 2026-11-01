-- Indian cheque numbers are exactly six digits. Published cheques must comply;
-- drafts may hold partial input. Pre-existing non-compliant rows are flagged as
-- legacy (still readable/updatable) until their number is edited.
ALTER TABLE public.cheques
  ADD COLUMN cheque_number_legacy boolean NOT NULL DEFAULT false;

-- Backfill must not be blocked by ownership/premium guards meant for user writes.
ALTER TABLE public.cheques DISABLE TRIGGER lifecycle_guard;
ALTER TABLE public.cheques DISABLE TRIGGER enforce_inward_premium;

-- Normalise separator-only variants (e.g. "123 456", "123-456") when the result
-- is unique within its account and does not collide with an existing number.
WITH candidates AS (
  SELECT id, business_id, account_id,
    regexp_replace(cheque_number, '[[:space:].-]', '', 'g') AS normalised
  FROM public.cheques
  WHERE NOT is_draft AND cheque_number IS NOT NULL
    AND cheque_number !~ '^[0-9]{6}$'
), safe AS (
  SELECT c.id, c.normalised
  FROM candidates c
  WHERE c.normalised ~ '^[0-9]{6}$'
    AND (SELECT count(*) FROM candidates d
         WHERE d.business_id = c.business_id
           AND d.account_id IS NOT DISTINCT FROM c.account_id
           AND d.normalised = c.normalised) = 1
    AND NOT EXISTS (SELECT 1 FROM public.cheques o
         WHERE o.business_id = c.business_id
           AND o.account_id IS NOT DISTINCT FROM c.account_id
           AND o.cheque_number = c.normalised)
)
UPDATE public.cheques t SET cheque_number = s.normalised
FROM safe s WHERE t.id = s.id;

UPDATE public.cheques SET cheque_number_legacy = true
WHERE NOT is_draft AND (cheque_number IS NULL OR cheque_number !~ '^[0-9]{6}$');

ALTER TABLE public.cheques ENABLE TRIGGER lifecycle_guard;
ALTER TABLE public.cheques ENABLE TRIGGER enforce_inward_premium;

ALTER TABLE public.cheques ADD CONSTRAINT cheque_number_six_digits
  CHECK (is_draft OR cheque_number_legacy
    OR (cheque_number IS NOT NULL AND cheque_number ~ '^[0-9]{6}$'));

-- Clients cannot set the flag: new rows are never legacy, and changing the
-- number clears it so the constraint then applies.
CREATE FUNCTION public.guard_cheque_number_legacy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.cheque_number IS DISTINCT FROM OLD.cheque_number THEN
    NEW.cheque_number_legacy := false;
  ELSE
    NEW.cheque_number_legacy := OLD.cheque_number_legacy;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_cheque_number_legacy
  BEFORE INSERT OR UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.guard_cheque_number_legacy();

CREATE INDEX cheques_legacy_number_idx ON public.cheques (business_id)
  WHERE cheque_number_legacy AND deleted_at IS NULL;
