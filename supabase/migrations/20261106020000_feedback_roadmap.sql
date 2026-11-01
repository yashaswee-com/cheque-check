CREATE TABLE public.feedback_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'other')),
  title TEXT NOT NULL CHECK (
    char_length(btrim(title)) BETWEEN 3 AND 120
    AND btrim(title) ~ '[^[:space:]]'
  ),
  description TEXT NOT NULL CHECK (
    char_length(btrim(description)) BETWEEN 10 AND 3000
    AND btrim(description) ~ '[^[:space:]]'
  ),
  status TEXT NOT NULL DEFAULT 'under_review'
    CHECK (status IN ('under_review', 'planned', 'in_progress', 'shipped', 'declined')),
  roadmap_published BOOLEAN NOT NULL DEFAULT FALSE,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT roadmap_published OR category = 'feature')
);

CREATE INDEX feedback_items_user_created_idx
  ON public.feedback_items (user_id, created_at DESC, id DESC);
CREATE INDEX feedback_items_admin_created_idx
  ON public.feedback_items (created_at DESC, id DESC);
CREATE INDEX feedback_items_status_created_idx
  ON public.feedback_items (status, created_at DESC, id DESC);
CREATE INDEX feedback_items_roadmap_created_idx
  ON public.feedback_items (created_at DESC, id DESC)
  WHERE category = 'feature' AND roadmap_published;

CREATE TABLE public.feedback_votes (
  feedback_id UUID NOT NULL REFERENCES public.feedback_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feedback_id, user_id)
);

CREATE INDEX feedback_votes_user_idx
  ON public.feedback_votes (user_id, feedback_id);

ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read private submissions and published roadmap items"
  ON public.feedback_items FOR SELECT TO authenticated
  USING (
    public.lifecycle_user_active((SELECT auth.uid()))
    AND (
      user_id = (SELECT auth.uid())
      OR (category = 'feature' AND roadmap_published)
    )
  );
CREATE POLICY "Users can submit private feedback"
  ON public.feedback_items FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.lifecycle_user_active((SELECT auth.uid()))
    AND status = 'under_review'
    AND roadmap_published = FALSE
    AND vote_count = 0
  );
CREATE POLICY "Users can read their own roadmap votes"
  ON public.feedback_votes FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.lifecycle_user_active((SELECT auth.uid()))
  );
CREATE POLICY "Users can vote for published feature requests"
  ON public.feedback_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.lifecycle_user_active((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.feedback_items item
      WHERE item.id = feedback_id
        AND item.category = 'feature'
        AND item.roadmap_published
    )
  );
CREATE POLICY "Users can remove their own roadmap vote"
  ON public.feedback_votes FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.lifecycle_user_active((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.feedback_items item
      WHERE item.id = feedback_id
        AND item.category = 'feature'
        AND item.roadmap_published
    )
  );

REVOKE ALL ON public.feedback_items FROM PUBLIC, anon;
REVOKE ALL ON public.feedback_votes FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.feedback_items TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.feedback_votes TO authenticated;
GRANT ALL ON public.feedback_items, public.feedback_votes TO service_role;

CREATE FUNCTION public.enforce_feedback_submission_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid()
    OR NEW.status <> 'under_review'
    OR NEW.roadmap_published
    OR NEW.vote_count <> 0 THEN
    RAISE EXCEPTION 'Feedback submissions must start private and under review'
      USING ERRCODE = '42501';
  END IF;
  NEW.title := regexp_replace(NEW.title, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  NEW.description := regexp_replace(NEW.description, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  NEW.created_at := NOW();
  NEW.updated_at := NEW.created_at;
  IF NOT public.consume_api_rate_limit('feedback-submit', 5, 3600) THEN
    RAISE EXCEPTION 'Feedback submission limit reached'
      USING ERRCODE = 'P0001', DETAIL = 'feedback_rate_limited';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_feedback_submission_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER feedback_items_submission_limit
  BEFORE INSERT ON public.feedback_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_feedback_submission_limit();

CREATE FUNCTION public.update_feedback_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feedback_items
      SET vote_count = vote_count + 1
      WHERE id = NEW.feedback_id;
    RETURN NEW;
  END IF;

  UPDATE public.feedback_items
    SET vote_count = vote_count - 1
    WHERE id = OLD.feedback_id AND vote_count > 0;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.update_feedback_vote_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER feedback_votes_count
  AFTER INSERT OR DELETE ON public.feedback_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_feedback_vote_count();

CREATE FUNCTION public.list_my_feedback(
  requested_before_created_at TIMESTAMPTZ DEFAULT NULL,
  requested_before_id UUID DEFAULT NULL,
  requested_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  roadmap_published BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT public.lifecycle_user_active(current_user_id) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_limit NOT BETWEEN 1 AND 50
    OR ((requested_before_created_at IS NULL) <> (requested_before_id IS NULL)) THEN
    RAISE EXCEPTION 'Invalid feedback page request' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT item.id, item.category, item.title, item.description, item.status,
      item.roadmap_published, item.created_at
    FROM public.feedback_items item
    WHERE item.user_id = current_user_id
      AND (
        requested_before_created_at IS NULL
        OR (item.created_at, item.id) < (requested_before_created_at, requested_before_id)
      )
    ORDER BY item.created_at DESC, item.id DESC
    LIMIT requested_limit + 1;
END;
$$;

CREATE FUNCTION public.list_feedback_roadmap(
  requested_before_created_at TIMESTAMPTZ DEFAULT NULL,
  requested_before_id UUID DEFAULT NULL,
  requested_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  status TEXT,
  vote_count INTEGER,
  has_voted BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT public.lifecycle_user_active(current_user_id) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_limit NOT BETWEEN 1 AND 50
    OR ((requested_before_created_at IS NULL) <> (requested_before_id IS NULL)) THEN
    RAISE EXCEPTION 'Invalid roadmap page request' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT item.id, item.title, item.description, item.status, item.vote_count,
      EXISTS (
        SELECT 1 FROM public.feedback_votes vote
        WHERE vote.feedback_id = item.id AND vote.user_id = current_user_id
      ),
      item.created_at
    FROM public.feedback_items item
    WHERE item.category = 'feature'
      AND item.roadmap_published
      AND (
        requested_before_created_at IS NULL
        OR (item.created_at, item.id) < (requested_before_created_at, requested_before_id)
      )
    ORDER BY item.created_at DESC, item.id DESC
    LIMIT requested_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.list_feedback_roadmap(TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_feedback_roadmap(TIMESTAMPTZ, UUID, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_feedback(TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_feedback(TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

CREATE FUNCTION public.admin_update_feedback(
  requested_id UUID,
  requested_status TEXT,
  requested_published BOOLEAN,
  requested_operator TEXT,
  requested_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  before_row public.feedback_items%ROWTYPE;
  after_row public.feedback_items%ROWTYPE;
  audit_id UUID;
  publish_value BOOLEAN;
  status_value TEXT;
BEGIN
  IF requested_operator IS NULL OR length(btrim(requested_operator)) = 0 THEN
    RAISE EXCEPTION 'Operator is required' USING ERRCODE = '22023';
  END IF;
  IF requested_status IS NOT NULL
    AND requested_status NOT IN ('under_review', 'planned', 'in_progress', 'shipped', 'declined') THEN
    RAISE EXCEPTION 'Invalid feedback status or publication setting'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row
    FROM public.feedback_items
    WHERE id = requested_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback item not found' USING ERRCODE = 'P0002';
  END IF;
  publish_value := COALESCE(requested_published, before_row.roadmap_published);
  status_value := COALESCE(requested_status, before_row.status);
  IF publish_value AND before_row.category <> 'feature' THEN
    RAISE EXCEPTION 'Only feature requests can be published to the roadmap'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.feedback_items
    SET status = status_value,
        roadmap_published = publish_value,
        updated_at = NOW()
    WHERE id = requested_id
    RETURNING * INTO after_row;

  audit_id := public.admin_write_audit(
    requested_operator,
    'feedback.update',
    before_row.user_id,
    'feedback_item',
    requested_id::TEXT,
    requested_reason,
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object('roadmap_published', publish_value)
  );

  RETURN jsonb_build_object('item', to_jsonb(after_row), 'audit_id', audit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_feedback(UUID, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_feedback(UUID, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;
