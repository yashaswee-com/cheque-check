-- Entity detail pages (business, party, account) share the /cheques server
-- filters. Accounts need their own scope; the new argument is optional, so
-- callers that omit it keep the previous behaviour.
DROP FUNCTION public.cheque_list_page(uuid,text,text,text,text,int,int,boolean,text,text,text,uuid,date,date,text[],text,date,date,numeric,numeric,uuid[],boolean);

CREATE FUNCTION public.cheque_list_page(
  requested_business uuid,
  requested_search text DEFAULT '',
  requested_status text DEFAULT NULL,
  requested_sort text DEFAULT 'date',
  requested_order text DEFAULT 'desc',
  requested_offset int DEFAULT 0,
  requested_limit int DEFAULT 50,
  requested_include_inward boolean DEFAULT true,
  requested_native_search text DEFAULT '',
  requested_native_status text DEFAULT NULL,
  requested_type text DEFAULT NULL,
  requested_party uuid DEFAULT NULL,
  requested_from date DEFAULT NULL,
  requested_to date DEFAULT NULL,
  requested_statuses text[] DEFAULT NULL,
  requested_party_type text DEFAULT NULL,
  requested_due_from date DEFAULT NULL,
  requested_due_to date DEFAULT NULL,
  requested_min_amount numeric DEFAULT NULL,
  requested_max_amount numeric DEFAULT NULL,
  requested_banks uuid[] DEFAULT NULL,
  requested_unknown_bank boolean DEFAULT false,
  requested_account uuid DEFAULT NULL
) RETURNS TABLE(cheque_id uuid, matching_count bigint, active_count bigint)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_business IS NULL OR requested_offset IS NULL OR requested_limit IS NULL
    OR requested_sort IS NULL OR requested_order IS NULL OR requested_search IS NULL
    OR requested_native_search IS NULL OR requested_include_inward IS NULL
    OR requested_unknown_bank IS NULL
    OR requested_offset < 0 OR requested_limit NOT BETWEEN 1 AND 100
    OR requested_sort NOT IN ('date', 'amount') OR requested_order NOT IN ('asc', 'desc')
    OR length(requested_search) > 200 OR length(requested_native_search) > 200
    OR requested_from > requested_to OR requested_due_from > requested_due_to
    OR requested_min_amount < 0 OR requested_max_amount < 0
    OR requested_min_amount > requested_max_amount
    OR requested_min_amount::text IN ('NaN','Infinity','-Infinity')
    OR requested_max_amount::text IN ('NaN','Infinity','-Infinity')
    OR requested_party_type NOT IN ('customer','supplier','vendor','unclassified')
    OR (requested_statuses IS NOT NULL AND (
      cardinality(requested_statuses) NOT BETWEEN 1 AND 4
      OR NOT requested_statuses <@ ARRAY['Issued','Received','Cleared','Bounced']::text[]
      OR array_position(requested_statuses, NULL) IS NOT NULL))
    OR (requested_banks IS NOT NULL AND (
      cardinality(requested_banks) NOT BETWEEN 1 AND 100
      OR array_position(requested_banks, NULL) IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid cheque page request' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH active AS MATERIALIZED (
    SELECT c.*, p.name AS party_name, p.party_type, a.bank_id
    FROM public.cheques c
    LEFT JOIN public.parties p ON p.id = c.party_id
    LEFT JOIN public.accounts a ON a.id = c.account_id
    WHERE c.business_id = requested_business AND c.deleted_at IS NULL AND NOT c.is_draft
      AND (requested_include_inward OR c.type::text <> 'Inward')
  ), matching AS MATERIALIZED (
    SELECT a.* FROM active a
    WHERE (requested_search = '' OR
      strpos(lower(coalesce(a.cheque_number, '')), lower(requested_search)) > 0 OR
      strpos(lower(coalesce(a.party_name, '')), lower(requested_search)) > 0 OR
      strpos(trim_scale(a.amount)::text, requested_search) > 0)
      AND (requested_status IS NULL OR a.status::text = requested_status)
      AND (requested_native_search = '' OR strpos(
        lower(trim(coalesce(a.cheque_number, '') || ' ' || coalesce(a.notes, ''))),
        lower(trim(requested_native_search))) > 0)
      AND (requested_native_status IS NULL OR a.status::text = requested_native_status)
      AND (requested_type IS NULL OR a.type::text = requested_type)
      AND (requested_party IS NULL OR a.party_id = requested_party)
      AND (requested_account IS NULL OR a.account_id = requested_account)
      AND (requested_from IS NULL OR a.cheque_date >= requested_from)
      AND (requested_to IS NULL OR a.cheque_date <= requested_to)
      AND (requested_due_from IS NULL OR a.deposit_date >= requested_due_from)
      AND (requested_due_to IS NULL OR a.deposit_date <= requested_due_to)
      AND (requested_statuses IS NULL OR a.status::text = ANY(requested_statuses))
      AND (requested_party_type IS NULL OR
        (requested_party_type = 'unclassified' AND a.party_type IS NULL) OR
        a.party_type::text = requested_party_type)
      AND (requested_min_amount IS NULL OR a.amount >= requested_min_amount)
      AND (requested_max_amount IS NULL OR a.amount <= requested_max_amount)
      AND ((requested_banks IS NULL AND NOT requested_unknown_bank)
        OR a.bank_id = ANY(requested_banks)
        OR (requested_unknown_bank AND a.bank_id IS NULL))
  ), page AS (
    SELECT m.id, row_number() OVER (ORDER BY
      CASE WHEN requested_sort = 'date' AND requested_order = 'asc' THEN m.cheque_date END ASC,
      CASE WHEN requested_sort = 'date' AND requested_order = 'desc' THEN m.cheque_date END DESC,
      CASE WHEN requested_sort = 'amount' AND requested_order = 'asc' THEN m.amount END ASC,
      CASE WHEN requested_sort = 'amount' AND requested_order = 'desc' THEN m.amount END DESC,
      m.id) AS position
    FROM matching m ORDER BY position LIMIT requested_limit OFFSET requested_offset
  )
  SELECT page.id, totals.matches, totals.active
  FROM (SELECT (SELECT count(*) FROM matching) AS matches,
    (SELECT count(*) FROM active) AS active) totals
  LEFT JOIN page ON true ORDER BY page.position;
END $$;

REVOKE ALL ON FUNCTION public.cheque_list_page(uuid,text,text,text,text,int,int,boolean,text,text,text,uuid,date,date,text[],text,date,date,numeric,numeric,uuid[],boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cheque_list_page(uuid,text,text,text,text,int,int,boolean,text,text,text,uuid,date,date,text[],text,date,date,numeric,numeric,uuid[],boolean,uuid) TO authenticated;

-- Amount-filter slider ceiling: highest active cheque amount per business.
CREATE INDEX IF NOT EXISTS cheques_active_business_amount_idx
  ON public.cheques(business_id, amount DESC)
  WHERE deleted_at IS NULL AND NOT is_draft;
