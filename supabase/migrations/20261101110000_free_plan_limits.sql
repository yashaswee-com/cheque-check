-- Free plan: at most 50 active published cheques per user (across all of the
-- user's businesses). Drafts and deleted cheques do not count; Lifetime
-- Premium, including an active trial, is unlimited. Service-role writes
-- (auth.uid() IS NULL) are operational and bypass the cap.
CREATE FUNCTION public.free_plan_cheque_limit()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;

CREATE FUNCTION public.count_active_cheques(requested_owner uuid, cap integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM (
    SELECT 1 FROM public.cheques c
    JOIN public.businesses b ON b.id = c.business_id
    WHERE b.user_id = requested_owner AND b.deleted_at IS NULL
      AND NOT c.is_draft AND c.deleted_at IS NULL
    LIMIT cap
  ) bounded;
$$;
REVOKE ALL ON FUNCTION public.count_active_cheques(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.limit_free_cheques()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  IF auth.uid() IS NULL OR NEW.is_draft OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Only rows becoming active (insert, draft publish, restore) consume a slot.
  IF TG_OP = 'UPDATE' AND NOT OLD.is_draft AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_lifetime_premium() THEN RETURN NEW; END IF;
  SELECT user_id INTO owner FROM public.businesses WHERE id = NEW.business_id;
  IF owner IS NULL THEN RETURN NEW; END IF;
  -- Serialise per owner so concurrent inserts cannot overshoot the cap.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('free-cheque-cap:' || owner::text, 0)
  );
  IF public.count_active_cheques(owner, public.free_plan_cheque_limit())
     >= public.free_plan_cheque_limit() THEN
    RAISE EXCEPTION 'Free plan limit of % active cheques reached',
      public.free_plan_cheque_limit()
      USING ERRCODE = '53400',
        HINT = 'Upgrade to Lifetime Premium for unlimited cheques.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_free_cheques() FROM PUBLIC;

-- Named to fire after lifecycle_guard (BEFORE triggers run alphabetically),
-- so ownership is already verified.
CREATE TRIGGER limit_free_cheques
  BEFORE INSERT OR UPDATE OF is_draft, deleted_at ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.limit_free_cheques();

-- New users: 10 AI scans (unchanged) and 10 voice reminders.
CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_quotas (user_id, feature_id, "limit")
  VALUES (NEW.user_id, 'ai_scan', 10), (NEW.user_id, 'voice_reminder', 10)
  ON CONFLICT (user_id, feature_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- One round trip for the free-usage banner. Cheque usage is bounded by the
-- cap, so the query cost does not grow with a premium user's history.
CREATE FUNCTION public.free_plan_usage()
RETURNS TABLE(
  unlimited boolean,
  cheques_used integer, cheques_limit integer,
  ai_scans_used integer, ai_scans_limit integer,
  voice_used integer, voice_limit integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_lifetime_premium(),
    public.count_active_cheques(auth.uid(), public.free_plan_cheque_limit()),
    public.free_plan_cheque_limit(),
    coalesce(ai.used, 0), coalesce(ai."limit", 0),
    coalesce(voice.used, 0), coalesce(voice."limit", 0)
  FROM (SELECT auth.uid() AS uid) caller
  LEFT JOIN public.user_quotas ai ON ai.user_id = caller.uid AND ai.feature_id = 'ai_scan'
  LEFT JOIN public.user_quotas voice ON voice.user_id = caller.uid AND voice.feature_id = 'voice_reminder'
  WHERE caller.uid IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.free_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.free_plan_usage() TO authenticated;
