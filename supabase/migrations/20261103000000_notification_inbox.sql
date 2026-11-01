CREATE TABLE public.notification_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cheque_reminder','export_ready','export_failed')),
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz
);
CREATE INDEX notification_inbox_owner_idx ON public.notification_inbox(user_id,id DESC);
CREATE INDEX notification_inbox_business_idx ON public.notification_inbox(user_id,business_id,id DESC);
CREATE INDEX notification_inbox_unread_idx ON public.notification_inbox(user_id,business_id,id DESC) WHERE read_at IS NULL;
CREATE INDEX notification_inbox_retention_idx ON public.notification_inbox(created_at,id);
ALTER TABLE public.notification_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY inbox_owner ON public.notification_inbox FOR SELECT TO authenticated USING (
  user_id = auth.uid() AND public.lifecycle_user_active() AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid() AND b.deleted_at IS NULL
  )
);
REVOKE ALL ON public.notification_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.notification_inbox TO authenticated;
GRANT ALL ON public.notification_inbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notification_inbox_id_seq TO service_role;

CREATE FUNCTION public.list_notification_inbox(
  requested_business uuid DEFAULT NULL, requested_unread boolean DEFAULT false,
  requested_before bigint DEFAULT NULL, requested_snapshot bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public,pg_temp AS $$
DECLARE snapshot_id bigint; items jsonb; next_id text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_before < 0 OR requested_snapshot < 0 THEN
    RAISE EXCEPTION 'Invalid inbox cursor' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(requested_snapshot,max(id),0) INTO snapshot_id FROM public.notification_inbox
    WHERE user_id = auth.uid() AND (requested_business IS NULL OR business_id = requested_business);
  WITH page AS MATERIALIZED (
    SELECT id,kind,created_at,read_at,business_id FROM public.notification_inbox
    WHERE user_id = auth.uid() AND (requested_business IS NULL OR business_id = requested_business)
      AND created_at >= now() - interval '90 days' AND id <= snapshot_id
      AND (requested_before IS NULL OR id < requested_before)
      AND (NOT requested_unread OR read_at IS NULL)
    ORDER BY id DESC LIMIT 51
  ), shown AS (SELECT * FROM page ORDER BY id DESC LIMIT 50)
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,
    'created_at',created_at,'read_at',read_at,'business_id',business_id) ORDER BY id DESC) FROM shown),'[]'),
    CASE WHEN (SELECT count(*) FROM page) > 50 THEN (SELECT min(id)::text FROM shown) END
    INTO items,next_id;
  RETURN jsonb_build_object('items',items,'next_cursor',next_id,'snapshot',snapshot_id::text);
END $$;

CREATE FUNCTION public.count_unread_notifications(requested_business uuid DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*) FROM public.notification_inbox WHERE user_id = auth.uid()
    AND read_at IS NULL AND created_at >= now() - interval '90 days'
    AND (requested_business IS NULL OR business_id = requested_business));
END $$;

CREATE FUNCTION public.mark_notifications_read(
  requested_id bigint DEFAULT NULL, requested_snapshot bigint DEFAULT NULL,
  requested_business uuid DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE changed int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF (requested_id IS NULL) = (requested_snapshot IS NULL) OR requested_id < 1 OR requested_snapshot < 0 THEN
    RAISE EXCEPTION 'Provide one notification or snapshot' USING ERRCODE = '22023';
  END IF;
  IF requested_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notification_inbox n JOIN public.businesses b ON b.id=n.business_id
    WHERE n.id=requested_id AND n.user_id=auth.uid() AND b.user_id=auth.uid() AND b.deleted_at IS NULL
      AND (requested_business IS NULL OR n.business_id=requested_business)
      AND n.created_at >= now() - interval '90 days'
  ) THEN RAISE EXCEPTION 'Notification unavailable' USING ERRCODE = '42501'; END IF;
  UPDATE public.notification_inbox n SET read_at = clock_timestamp()
    WHERE n.user_id=auth.uid() AND n.read_at IS NULL AND n.created_at >= now() - interval '90 days'
      AND (requested_business IS NULL OR n.business_id=requested_business)
      AND ((requested_id IS NOT NULL AND n.id=requested_id) OR
        (requested_snapshot IS NOT NULL AND n.id<=requested_snapshot))
      AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=n.business_id AND b.user_id=auth.uid() AND b.deleted_at IS NULL);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.list_notification_inbox(uuid,boolean,bigint,bigint),
  public.count_unread_notifications(uuid),public.mark_notifications_read(bigint,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_notification_inbox(uuid,boolean,bigint,bigint),
  public.count_unread_notifications(uuid),public.mark_notifications_read(bigint,bigint,uuid) TO authenticated;

-- Preserve the existing checkpoint, slot and voice behavior while generating
-- inbox reminders for users regardless of voice subscription or phone.
CREATE OR REPLACE FUNCTION public.schedule_notification_batch(
  requested_now timestamptz DEFAULT now(), requested_force boolean DEFAULT false
) RETURNS TABLE(enqueued int, completed boolean, invalid_timezones int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.notification_scheduler_runs; last_profile uuid; profile_count int; inserted int; invalid int;
BEGIN
  IF requested_now IS NULL THEN RAISE EXCEPTION 'Run time required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(731031);
  DELETE FROM public.notification_inbox WHERE id IN (
    SELECT id FROM public.notification_inbox WHERE created_at < now() - interval '90 days'
      ORDER BY created_at,id LIMIT 5000
  );
  DELETE FROM public.notification_scheduler_runs s WHERE s.completed AND s.run_at < now() - interval '7 days';
  SELECT * INTO r FROM public.notification_scheduler_runs WHERE NOT notification_scheduler_runs.completed
    ORDER BY run_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.notification_scheduler_runs(run_at, force_run)
      VALUES(to_timestamp(floor(extract(epoch FROM requested_now) / 900) * 900), requested_force)
      ON CONFLICT DO NOTHING;
    SELECT * INTO r FROM public.notification_scheduler_runs
      WHERE run_at = to_timestamp(floor(extract(epoch FROM requested_now) / 900) * 900) FOR UPDATE;
  END IF;
  IF r.completed THEN RETURN QUERY SELECT 0, true, 0; RETURN; END IF;
  WITH profiles_page AS MATERIALIZED (
    SELECT p.* FROM public.profiles p
    WHERE p.deleted_at IS NULL AND p.time_zone IS NOT NULL
      AND (r.profile_cursor IS NULL OR p.user_id > r.profile_cursor)
    ORDER BY p.user_id LIMIT 200
  ), local_profiles AS MATERIALIZED (
    SELECT p.*, (r.run_at AT TIME ZONE p.time_zone)::date AS local_date,
      extract(hour FROM r.run_at AT TIME ZONE p.time_zone)::int * 60
        + extract(minute FROM r.run_at AT TIME ZONE p.time_zone)::int AS minutes
    FROM profiles_page p JOIN public.notification_time_zones z ON z.name = p.time_zone
  ), matched AS MATERIALIZED (
    SELECT p.*, s.label FROM local_profiles p CROSS JOIN LATERAL (
      SELECT to_char(slot.v,'HH24:MI') AS label
      FROM unnest(coalesce(p.reminder_times,public.reminder_times_for_count(NULL,p.reminders_per_day)))
        WITH ORDINALITY slot(v,position)
      WHERE (r.force_run AND slot.position=1) OR (NOT r.force_run
        AND p.minutes >= extract(hour FROM slot.v)::int*60+extract(minute FROM slot.v)::int
        AND p.minutes < extract(hour FROM slot.v)::int*60+extract(minute FROM slot.v)::int+15)
      ORDER BY slot.position LIMIT 1
    ) s
  ), eligible AS MATERIALIZED (
    SELECT p.user_id,b.id AS business_id,p.label,p.local_date,p.voice_call_enabled,p.phone,
      jsonb_agg(c.id ORDER BY c.id) AS cheque_ids
    FROM matched p JOIN public.businesses b ON b.user_id=p.user_id AND b.deleted_at IS NULL
    JOIN public.cheques c ON c.business_id=b.id AND c.deleted_at IS NULL AND NOT c.is_draft
      AND c.status::text='Issued'
      AND ((c.deposit_date IS NOT NULL AND c.remind_before_days IS NOT NULL
        AND c.deposit_date BETWEEN p.local_date AND p.local_date+c.remind_before_days)
        OR (c.deposit_date IS NULL AND c.cheque_date=p.local_date))
    GROUP BY p.user_id,b.id,p.label,p.local_date,p.voice_call_enabled,p.phone
  ), inbox AS (
    INSERT INTO public.notification_inbox(user_id,business_id,kind,event_key)
    SELECT user_id,business_id,'cheque_reminder',
      'cheque_reminder:'||business_id||':'||local_date||':'||label FROM eligible
    ON CONFLICT(event_key) DO NOTHING RETURNING id
  ), jobs AS (
    INSERT INTO public.notification_jobs(user_id,business_id,channel,purpose,payload,scheduled_at,idempotency_key)
    SELECT user_id,business_id,'voice','cheque_reminder',
      jsonb_build_object('cheque_ids',cheque_ids,'slot',label),now(),
      'cheque_reminder:voice:'||business_id||':'||local_date||':'||label
    FROM eligible WHERE voice_call_enabled AND phone IS NOT NULL
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
  )
  SELECT (SELECT count(*)::int FROM jobs),(SELECT count(*)::int FROM profiles_page),
    (SELECT user_id FROM profiles_page ORDER BY user_id DESC LIMIT 1),
    (SELECT count(*)::int FROM profiles_page p WHERE NOT EXISTS
      (SELECT 1 FROM public.notification_time_zones z WHERE z.name=p.time_zone))
    INTO inserted,profile_count,last_profile,invalid;
  UPDATE public.notification_scheduler_runs SET profile_cursor=coalesce(last_profile,profile_cursor),
    completed=profile_count<200,updated_at=now() WHERE run_at=r.run_at;
  RETURN QUERY SELECT inserted,profile_count<200,invalid;
END $$;
REVOKE ALL ON FUNCTION public.schedule_notification_batch(timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_notification_batch(timestamptz,boolean) TO service_role;
