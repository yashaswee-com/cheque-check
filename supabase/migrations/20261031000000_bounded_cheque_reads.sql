CREATE INDEX cheques_active_business_date_id_idx
  ON public.cheques(business_id, cheque_date, id)
  WHERE deleted_at IS NULL AND NOT is_draft;
CREATE INDEX businesses_active_owner_idx
  ON public.businesses(user_id, id) WHERE deleted_at IS NULL;

-- Invoker functions deliberately retain the caller's RLS policies.
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
  requested_to date DEFAULT NULL
) RETURNS TABLE(cheque_id uuid, matching_count bigint, active_count bigint)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_business IS NULL OR requested_offset IS NULL OR requested_limit IS NULL
    OR requested_sort IS NULL OR requested_order IS NULL OR requested_search IS NULL
    OR requested_native_search IS NULL OR requested_include_inward IS NULL
    OR requested_offset < 0 OR requested_limit NOT BETWEEN 1 AND 100
    OR requested_sort NOT IN ('date', 'amount') OR requested_order NOT IN ('asc', 'desc')
    OR length(requested_search) > 200 OR length(requested_native_search) > 200 THEN
    RAISE EXCEPTION 'Invalid cheque page request' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH active AS MATERIALIZED (
    SELECT c.*, p.name AS party_name FROM public.cheques c
    LEFT JOIN public.parties p ON p.id = c.party_id
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
      AND (requested_from IS NULL OR a.cheque_date >= requested_from)
      AND (requested_to IS NULL OR a.cheque_date <= requested_to)
  ), page AS (
    SELECT m.id, row_number() OVER (ORDER BY
      CASE WHEN requested_sort = 'date' AND requested_order = 'asc' THEN m.cheque_date END ASC,
      CASE WHEN requested_sort = 'date' AND requested_order = 'desc' THEN m.cheque_date END DESC,
      CASE WHEN requested_sort = 'amount' AND requested_order = 'asc' THEN m.amount END ASC,
      CASE WHEN requested_sort = 'amount' AND requested_order = 'desc' THEN m.amount END DESC,
      m.id) AS position
    FROM matching m
    ORDER BY position LIMIT requested_limit OFFSET requested_offset
  )
  SELECT page.id, totals.matches, totals.active
  FROM (SELECT (SELECT count(*) FROM matching) AS matches,
    (SELECT count(*) FROM active) AS active) totals
  LEFT JOIN page ON true ORDER BY page.position;
END $$;

CREATE FUNCTION public.business_cheque_summaries(requested_today date)
RETURNS TABLE(business_id uuid, upcoming_total numeric)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR requested_today IS NULL THEN
    RAISE EXCEPTION 'Authenticated date required' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT b.id, coalesce(sum(c.amount), 0)
  FROM public.businesses b LEFT JOIN public.cheques c
    ON c.business_id = b.id AND c.deleted_at IS NULL AND NOT c.is_draft
      AND c.status::text IN ('Issued', 'Received') AND c.cheque_date >= requested_today
  WHERE b.user_id = auth.uid() AND b.deleted_at IS NULL GROUP BY b.id;
END $$;

REVOKE ALL ON FUNCTION public.cheque_list_page(uuid,text,text,text,text,int,int,boolean,text,text,text,uuid,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_cheque_summaries(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cheque_list_page(uuid,text,text,text,text,int,int,boolean,text,text,text,uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_cheque_summaries(date) TO authenticated;

CREATE FUNCTION public.cheque_summary(
  requested_business uuid, requested_today date,
  requested_include_inward boolean DEFAULT true,
  requested_from date DEFAULT NULL, requested_to date DEFAULT NULL
) RETURNS TABLE(status text, type text, cheque_count bigint, total_amount numeric,
  today_count bigint, upcoming_count bigint, overdue_count bigint)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR requested_today IS NULL THEN
    RAISE EXCEPTION 'Authenticated date required' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT c.status::text, c.type::text, count(*), coalesce(sum(c.amount), 0),
    count(*) FILTER (WHERE c.cheque_date = requested_today),
    count(*) FILTER (WHERE c.status::text IN ('Issued', 'Received') AND c.cheque_date > requested_today),
    count(*) FILTER (WHERE c.status::text IN ('Issued', 'Received') AND c.cheque_date < requested_today)
  FROM public.cheques c WHERE c.business_id = requested_business
    AND c.deleted_at IS NULL AND NOT c.is_draft
    AND (requested_include_inward OR c.type::text <> 'Inward')
    AND (requested_from IS NULL OR c.cheque_date >= requested_from)
    AND (requested_to IS NULL OR c.cheque_date <= requested_to)
  GROUP BY c.status, c.type;
END $$;
REVOKE ALL ON FUNCTION public.cheque_summary(uuid,date,boolean,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cheque_summary(uuid,date,boolean,date,date) TO authenticated;
