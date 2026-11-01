DROP TRIGGER accounts_clear_previous_default ON public.accounts;
DROP INDEX public.accounts_one_default_per_business_idx;

CREATE UNIQUE INDEX accounts_one_default_per_business_idx
  ON public.accounts (business_id)
  WHERE is_default AND NOT is_draft AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.clear_previous_default_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default AND NOT NEW.is_draft AND NEW.deleted_at IS NULL THEN
    UPDATE public.accounts
    SET is_default = FALSE
    WHERE business_id = NEW.business_id
      AND id <> NEW.id
      AND is_default
      AND NOT is_draft
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_clear_previous_default
  BEFORE INSERT OR UPDATE OF is_default, business_id, is_draft, deleted_at
  ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_previous_default_account();
