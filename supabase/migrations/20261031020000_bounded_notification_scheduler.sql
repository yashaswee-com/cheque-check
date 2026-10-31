CREATE TABLE public.notification_scheduler_runs (
  run_at timestamptz PRIMARY KEY,
  profile_cursor uuid,
  completed boolean NOT NULL DEFAULT false,
  force_run boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Timezone names change with PostgreSQL tzdata, not per scheduling batch.
CREATE MATERIALIZED VIEW public.notification_time_zones AS SELECT name FROM pg_timezone_names;
CREATE UNIQUE INDEX notification_time_zones_name_idx ON public.notification_time_zones(name);
REVOKE ALL ON public.notification_time_zones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_time_zones TO service_role;
ALTER TABLE public.notification_scheduler_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_scheduler_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_scheduler_runs TO service_role;

CREATE FUNCTION public.schedule_notification_batch(
  requested_now timestamptz DEFAULT now(), requested_force boolean DEFAULT false
) RETURNS TABLE(enqueued int, completed boolean, invalid_timezones int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.notification_scheduler_runs; last_profile uuid; profile_count int; inserted int; invalid int;
BEGIN
  IF requested_now IS NULL THEN RAISE EXCEPTION 'Run time required' USING ERRCODE = '22023'; END IF;
  -- Serialize just the bounded SQL batch, not an entire Edge Function invocation.
  PERFORM pg_advisory_xact_lock(731031);
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
    WHERE p.deleted_at IS NULL AND p.voice_call_enabled AND p.phone IS NOT NULL AND p.time_zone IS NOT NULL
      AND (r.profile_cursor IS NULL OR p.user_id > r.profile_cursor)
    ORDER BY p.user_id LIMIT 200
  ), local_profiles AS MATERIALIZED (
    SELECT p.*, (r.run_at AT TIME ZONE p.time_zone)::date AS local_date,
      extract(hour FROM r.run_at AT TIME ZONE p.time_zone)::int * 60
        + extract(minute FROM r.run_at AT TIME ZONE p.time_zone)::int AS minutes
    FROM profiles_page p JOIN public.notification_time_zones z ON z.name = p.time_zone
  ), matched AS MATERIALIZED (
    SELECT p.*, s.label FROM local_profiles p
    CROSS JOIN LATERAL (
      SELECT slot.label FROM (VALUES
        ('morning', 540),
        ('afternoon', 780),
        ('evening', CASE WHEN p.reminders_per_day = 2 THEN 1020 ELSE 1080 END)
      ) slot(label, minute)
      WHERE (slot.label = 'morning' OR
        (slot.label = 'afternoon' AND p.reminders_per_day = 3) OR
        (slot.label = 'evening' AND p.reminders_per_day >= 2))
        AND ((r.force_run AND slot.label = 'morning') OR
          (NOT r.force_run AND p.minutes >= slot.minute AND p.minutes < slot.minute + 15))
      LIMIT 1
    ) s
  ), jobs AS (
    INSERT INTO public.notification_jobs(user_id, business_id, channel, purpose, payload, scheduled_at, idempotency_key)
    SELECT p.user_id, b.id, 'voice', 'cheque_reminder',
      jsonb_build_object('cheque_ids', jsonb_agg(c.id ORDER BY c.id), 'slot', p.label),
      now(), 'cheque_reminder:voice:' || b.id || ':' || p.local_date || ':' || p.label
    FROM matched p JOIN public.businesses b ON b.user_id = p.user_id AND b.deleted_at IS NULL
    JOIN public.cheques c ON c.business_id = b.id AND c.deleted_at IS NULL AND NOT c.is_draft
      AND c.status::text = 'Issued'
      AND ((c.deposit_date IS NOT NULL AND c.remind_before_days IS NOT NULL
        AND c.deposit_date BETWEEN p.local_date AND p.local_date + c.remind_before_days)
        OR (c.deposit_date IS NULL AND c.cheque_date = p.local_date))
    GROUP BY p.user_id, b.id, p.label, p.local_date
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
  )
  SELECT (SELECT count(*)::int FROM jobs), (SELECT count(*)::int FROM profiles_page),
    (SELECT user_id FROM profiles_page ORDER BY user_id DESC LIMIT 1),
    (SELECT count(*)::int FROM profiles_page p WHERE NOT EXISTS
      (SELECT 1 FROM public.notification_time_zones z WHERE z.name = p.time_zone))
    INTO inserted, profile_count, last_profile, invalid;

  UPDATE public.notification_scheduler_runs SET profile_cursor = coalesce(last_profile, profile_cursor),
    completed = profile_count < 200, updated_at = now() WHERE run_at = r.run_at;
  RETURN QUERY SELECT inserted, profile_count < 200, invalid;
END $$;
REVOKE ALL ON FUNCTION public.schedule_notification_batch(timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_notification_batch(timestamptz,boolean) TO service_role;

-- More frequent invocations resume checkpoints and drain multiple bounded batches.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications-scheduler-tick') THEN
    PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'notifications-scheduler-tick'), schedule := '* * * * *');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications-dispatcher-tick') THEN
    PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'notifications-dispatcher-tick'), schedule := '* * * * *');
  END IF;
END $$;
