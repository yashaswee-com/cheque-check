-- Closed party classification. Nullable: existing parties stay unclassified.
CREATE TYPE public.party_type AS ENUM ('customer','supplier','vendor');

ALTER TABLE public.parties ADD COLUMN party_type public.party_type;

CREATE INDEX parties_business_party_type_idx
  ON public.parties (business_id, party_type)
  WHERE deleted_at IS NULL AND is_draft = false;
