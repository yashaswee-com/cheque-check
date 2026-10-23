CREATE TYPE public.bank_category AS ENUM (
  'public', 'private', 'small_finance', 'regional_rural', 'foreign',
  'urban_cooperative', 'state_cooperative', 'district_cooperative', 'custom'
);

ALTER TABLE public.banks
  ADD COLUMN owner_id UUID REFERENCES auth.users(id),
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN category public.bank_category,
  ADD COLUMN source_url TEXT,
  ADD COLUMN verified_on DATE;

ALTER TABLE public.banks DROP CONSTRAINT banks_name_key;
ALTER TABLE public.banks ADD CONSTRAINT banks_custom_metadata_check CHECK (
  owner_id IS NULL OR (
    category = 'custom' AND source_url IS NULL AND verified_on IS NULL
    AND length(btrim(name)) BETWEEN 2 AND 120
    AND name ~ '[[:alpha:]]' AND name !~ '[[:cntrl:]]'
  )
);

CREATE FUNCTION public.bank_name_key(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT lower(regexp_replace(
    regexp_replace(btrim(value), '(limited|ltd\.?)$', '', 'i'),
    '[^[:alnum:]]', '', 'g'
  ));
$$;

CREATE UNIQUE INDEX banks_shared_active_name ON public.banks (public.bank_name_key(name))
  WHERE owner_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX banks_private_active_name ON public.banks (owner_id, public.bank_name_key(name))
  WHERE owner_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX banks_owner_active ON public.banks(owner_id) WHERE deleted_at IS NULL;

DROP POLICY "Banks are viewable by everyone" ON public.banks;
CREATE POLICY banks_read ON public.banks FOR SELECT TO authenticated USING (
  deleted_at IS NULL AND (owner_id IS NULL OR owner_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL
  )
);
CREATE POLICY banks_create_private ON public.banks FOR INSERT TO authenticated WITH CHECK (
  owner_id = auth.uid() AND deleted_at IS NULL AND category = 'custom'
  AND source_url IS NULL AND verified_on IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL
  )
);
CREATE POLICY banks_update_private ON public.banks FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid() AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL
  )
) WITH CHECK (owner_id = auth.uid() AND category = 'custom');
REVOKE DELETE ON public.banks FROM anon, authenticated;

CREATE FUNCTION public.guard_private_bank()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Bank ownership cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF OLD.owner_id IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.accounts a WHERE a.bank_id = OLD.id AND a.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'This bank is referenced by an account or draft' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF OLD.deleted_at IS NOT NULL AND auth.role() = 'authenticated' THEN
      RAISE EXCEPTION 'Deleted banks require administrator recovery' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.owner_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(public.bank_name_key(NEW.name), 0)
    );
    IF EXISTS (
      SELECT 1 FROM public.banks b WHERE b.id <> NEW.id
        AND b.deleted_at IS NULL AND b.owner_id IS NULL
        AND public.bank_name_key(b.name) = public.bank_name_key(NEW.name)
    ) THEN
      RAISE EXCEPTION 'Select the existing shared bank instead' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_private_bank BEFORE INSERT OR UPDATE ON public.banks
  FOR EACH ROW EXECUTE FUNCTION public.guard_private_bank();

CREATE FUNCTION public.guard_account_bank()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected_bank public.banks; business_owner UUID;
BEGIN
  IF NEW.bank_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO selected_bank FROM public.banks WHERE id = NEW.bank_id FOR UPDATE;
  SELECT user_id INTO business_owner FROM public.businesses
    WHERE id = NEW.business_id AND deleted_at IS NULL;
  IF selected_bank.id IS NULL OR selected_bank.deleted_at IS NOT NULL
     OR business_owner IS NULL
     OR (selected_bank.owner_id IS NOT NULL AND selected_bank.owner_id <> business_owner) THEN
    RAISE EXCEPTION 'Select an available bank owned by this account user' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_account_bank BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_bank();

REVOKE ALL ON FUNCTION public.guard_private_bank() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_account_bank() FROM PUBLIC;

CREATE FUNCTION public.delete_private_bank(requested_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.banks;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.banks WHERE id = requested_id FOR UPDATE;
  IF target.id IS NULL OR target.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Private bank not found' USING ERRCODE = '42501';
  END IF;
  IF target.deleted_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.banks SET deleted_at = now(), updated_at = now() WHERE id = target.id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_private_bank(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_private_bank(UUID) TO authenticated;
