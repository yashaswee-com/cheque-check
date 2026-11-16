CREATE FUNCTION public.search_my_feedback(
  requested_before_created_at TIMESTAMPTZ DEFAULT NULL,
  requested_before_id UUID DEFAULT NULL,
  requested_limit INTEGER DEFAULT 25,
  requested_search TEXT DEFAULT '',
  requested_category TEXT DEFAULT NULL,
  requested_status TEXT DEFAULT NULL,
  requested_order TEXT DEFAULT 'desc'
)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, description TEXT, status TEXT,
  roadmap_published BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT public.lifecycle_user_active(current_user_id) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 50
    OR ((requested_before_created_at IS NULL) <> (requested_before_id IS NULL))
    OR requested_search IS NULL OR char_length(requested_search) > 120
    OR (requested_category IS NOT NULL AND requested_category NOT IN ('bug', 'feature', 'other'))
    OR (requested_status IS NOT NULL AND requested_status NOT IN ('under_review', 'planned', 'in_progress', 'shipped', 'declined'))
    OR requested_order IS NULL OR requested_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid feedback page request' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT item.id, item.category, item.title, item.description, item.status,
      item.roadmap_published, item.created_at
    FROM public.feedback_items item
    WHERE item.user_id = current_user_id
      AND (requested_category IS NULL OR item.category = requested_category)
      AND (requested_status IS NULL OR item.status = requested_status)
      AND (requested_search = '' OR strpos(lower(item.title), lower(requested_search)) > 0
        OR strpos(lower(item.description), lower(requested_search)) > 0)
      AND (requested_before_created_at IS NULL
        OR (requested_order = 'desc' AND (item.created_at, item.id) < (requested_before_created_at, requested_before_id))
        OR (requested_order = 'asc' AND (item.created_at, item.id) > (requested_before_created_at, requested_before_id)))
    ORDER BY
      CASE WHEN requested_order = 'desc' THEN item.created_at END DESC,
      CASE WHEN requested_order = 'desc' THEN item.id END DESC,
      CASE WHEN requested_order = 'asc' THEN item.created_at END ASC,
      CASE WHEN requested_order = 'asc' THEN item.id END ASC
    LIMIT requested_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.search_my_feedback(TIMESTAMPTZ, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_my_feedback(TIMESTAMPTZ, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;
