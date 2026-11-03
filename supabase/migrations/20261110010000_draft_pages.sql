-- One paged, searchable list for cheque, party and account drafts so the
-- unified /drafts page never loads every draft at once. SECURITY INVOKER: the
-- table RLS policies still decide which business rows are visible.
CREATE FUNCTION public.list_drafts_page(
  requested_business uuid, requested_types text[] DEFAULT NULL,
  requested_search text DEFAULT NULL, requested_ascending boolean DEFAULT false,
  requested_page integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public,pg_temp AS $$
DECLARE
  total bigint; items jsonb;
  all_types boolean := coalesce(cardinality(requested_types),0) = 0;
  ascending boolean := coalesce(requested_ascending,false);
  term text := nullif(btrim(coalesce(requested_search,'')),'');
  pattern text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_business IS NULL OR requested_page IS NULL
    OR requested_page < 0 OR requested_page > 199
    OR coalesce(cardinality(requested_types),0) > 3
    OR NOT coalesce(requested_types,'{}') <@ ARRAY['cheque','party','account']
    OR length(coalesce(requested_search,'')) > 100 THEN
    RAISE EXCEPTION 'Invalid drafts page' USING ERRCODE = '22023';
  END IF;
  pattern := CASE WHEN term IS NULL THEN NULL ELSE
    '%' || replace(replace(replace(term,'\','\\'),'%','\%'),'_','\_') || '%' END;

  WITH draft_rows AS (
    SELECT 'cheque'::text AS entity, c.id, c.updated_at, to_jsonb(c) || jsonb_build_object(
      'party', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
        'name',p.name,'color',p.color,'icon',p.icon,'avatar_url',p.avatar_url) END,
      'account', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'account_name',a.account_name,'color',a.color,'icon',a.icon,
        'bank', CASE WHEN b.id IS NULL THEN NULL ELSE
          jsonb_build_object('name',b.name,'logo_url',b.logo_url) END) END) AS draft
    FROM public.cheques c
    LEFT JOIN public.parties p ON p.id = c.party_id
    LEFT JOIN public.accounts a ON a.id = c.account_id
    LEFT JOIN public.banks b ON b.id = a.bank_id
    WHERE (all_types OR 'cheque' = ANY(requested_types))
      AND c.business_id = requested_business AND c.is_draft AND c.deleted_at IS NULL
      AND (pattern IS NULL OR c.cheque_number ILIKE pattern OR p.name ILIKE pattern
        OR a.account_name ILIKE pattern OR c.notes ILIKE pattern)
    UNION ALL
    SELECT 'party', p.id, p.updated_at, to_jsonb(p)
    FROM public.parties p
    WHERE (all_types OR 'party' = ANY(requested_types))
      AND p.business_id = requested_business AND p.is_draft AND p.deleted_at IS NULL
      AND (pattern IS NULL OR p.name ILIKE pattern OR p.contact ILIKE pattern
        OR p.email ILIKE pattern)
    UNION ALL
    SELECT 'account', a.id, a.updated_at, to_jsonb(a) || jsonb_build_object(
      'bank', CASE WHEN b.id IS NULL THEN NULL ELSE
        jsonb_build_object('id',b.id,'name',b.name,'logo_url',b.logo_url) END)
    FROM public.accounts a
    LEFT JOIN public.banks b ON b.id = a.bank_id
    WHERE (all_types OR 'account' = ANY(requested_types))
      AND a.business_id = requested_business AND a.is_draft AND a.deleted_at IS NULL
      AND (pattern IS NULL OR a.account_name ILIKE pattern
        OR a.account_number ILIKE pattern OR b.name ILIKE pattern)
  ), shown AS (
    SELECT entity, id, updated_at, draft FROM draft_rows
    ORDER BY CASE WHEN ascending THEN updated_at END ASC,
      CASE WHEN NOT ascending THEN updated_at END DESC, id
    OFFSET requested_page * 50 LIMIT 50
  )
  SELECT (SELECT count(*) FROM draft_rows),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('entity',entity,'draft',draft)
      ORDER BY CASE WHEN ascending THEN updated_at END ASC,
        CASE WHEN NOT ascending THEN updated_at END DESC, id),'[]') FROM shown)
  INTO total, items;
  RETURN jsonb_build_object('items',items,'total',total,'page',requested_page,'page_size',50);
END $$;
REVOKE ALL ON FUNCTION public.list_drafts_page(uuid,text[],text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_drafts_page(uuid,text[],text,boolean,integer) TO authenticated;

-- Per-type counts for the dashboard card and entity-page draft links.
CREATE FUNCTION public.draft_counts(requested_business uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public,pg_temp AS $$
  SELECT jsonb_build_object(
    'cheque', (SELECT count(*) FROM public.cheques
      WHERE business_id = requested_business AND is_draft AND deleted_at IS NULL),
    'party', (SELECT count(*) FROM public.parties
      WHERE business_id = requested_business AND is_draft AND deleted_at IS NULL),
    'account', (SELECT count(*) FROM public.accounts
      WHERE business_id = requested_business AND is_draft AND deleted_at IS NULL))
$$;
REVOKE ALL ON FUNCTION public.draft_counts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.draft_counts(uuid) TO authenticated;
