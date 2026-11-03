-- Offset pages with a total so the inbox can show "page / total", sort oldest
-- first and search by event type or business. The snapshot pins the result
-- set so new events never shift rows between pages. Search arrays are resolved
-- on the client from localized labels; a row matches either array.
CREATE FUNCTION public.list_notification_inbox_page(
  requested_business uuid DEFAULT NULL, requested_unread boolean DEFAULT false,
  requested_ascending boolean DEFAULT false, requested_page integer DEFAULT 0,
  requested_snapshot bigint DEFAULT NULL, requested_match_kinds text[] DEFAULT NULL,
  requested_match_businesses uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public,pg_temp AS $$
DECLARE
  snapshot_id bigint; total bigint; items jsonb;
  searching boolean := requested_match_kinds IS NOT NULL OR requested_match_businesses IS NOT NULL;
  unread_only boolean := coalesce(requested_unread,false);
  ascending boolean := coalesce(requested_ascending,false);
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_page IS NULL OR requested_page < 0 OR requested_page > 199 OR requested_snapshot < 0
    OR coalesce(cardinality(requested_match_kinds),0) > 3
    OR coalesce(cardinality(requested_match_businesses),0) > 100 THEN
    RAISE EXCEPTION 'Invalid inbox page' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(requested_snapshot,max(id),0) INTO snapshot_id FROM public.notification_inbox
    WHERE user_id = auth.uid() AND (requested_business IS NULL OR business_id = requested_business);
  SELECT count(*) INTO total FROM public.notification_inbox
    WHERE user_id = auth.uid() AND (requested_business IS NULL OR business_id = requested_business)
      AND created_at >= now() - interval '90 days' AND id <= snapshot_id
      AND (NOT unread_only OR read_at IS NULL)
      AND (NOT searching OR kind = ANY(coalesce(requested_match_kinds,'{}'))
        OR business_id = ANY(coalesce(requested_match_businesses,'{}')));
  WITH shown AS (
    SELECT id,kind,created_at,read_at,business_id FROM public.notification_inbox
    WHERE user_id = auth.uid() AND (requested_business IS NULL OR business_id = requested_business)
      AND created_at >= now() - interval '90 days' AND id <= snapshot_id
      AND (NOT unread_only OR read_at IS NULL)
      AND (NOT searching OR kind = ANY(coalesce(requested_match_kinds,'{}'))
        OR business_id = ANY(coalesce(requested_match_businesses,'{}')))
    ORDER BY CASE WHEN ascending THEN id ELSE -id END
    OFFSET requested_page * 50 LIMIT 50
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,
    'created_at',created_at,'read_at',read_at,'business_id',business_id)
    ORDER BY CASE WHEN ascending THEN id ELSE -id END),'[]') INTO items FROM shown;
  RETURN jsonb_build_object('items',items,'total',total,'page',requested_page,
    'page_size',50,'snapshot',snapshot_id::text);
END $$;
REVOKE ALL ON FUNCTION public.list_notification_inbox_page(uuid,boolean,boolean,integer,bigint,text[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_notification_inbox_page(uuid,boolean,boolean,integer,bigint,text[],uuid[]) TO authenticated;
