-- User-chosen reminder times (up to 3 per day, local time, 15-minute steps
-- between 06:00 and 22:00). reminders_per_day stays as the derived count for
-- existing readers; explicitly set times are authoritative.
CREATE FUNCTION public.valid_reminder_times(times time[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT times IS NOT NULL AND cardinality(times) BETWEEN 1 AND 3
    AND NOT EXISTS (
      SELECT 1 FROM unnest(times) WITH ORDINALITY t(v, i)
      WHERE v IS NULL OR v < time '06:00' OR v > time '22:00'
        OR extract(second FROM v) <> 0 OR extract(minute FROM v)::int % 15 <> 0
        OR (i > 1 AND v <= times[i - 1])
    );
$$;

-- Keeps the user's existing times when the count shrinks; fills with the
-- historical default slots (09:00, 13:00, 18:00, then 17:00) when it grows.
CREATE FUNCTION public.reminder_times_for_count(existing time[], slot_count integer)
RETURNS time[] LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(v ORDER BY v) FROM (
    SELECT v FROM (
      SELECT DISTINCT ON (v) v, priority, position FROM (
        SELECT v, 0 AS priority, position FROM unnest(coalesce(existing, '{}'::time[])) WITH ORDINALITY a(v, position)
        UNION ALL
        SELECT v, 1, position FROM unnest(
          CASE greatest(1, least(coalesce(slot_count, 1), 3))
            WHEN 2 THEN ARRAY['09:00','17:00','13:00']::time[]
            ELSE ARRAY['09:00','13:00','18:00']::time[] END
        ) WITH ORDINALITY b(v, position)
      ) candidates
      ORDER BY v, priority, position
    ) ranked
    ORDER BY priority, position
    LIMIT greatest(1, least(coalesce(slot_count, 1), 3))
  ) chosen;
$$;

ALTER TABLE public.profiles ADD COLUMN reminder_times time[];
UPDATE public.profiles
  SET reminder_times = public.reminder_times_for_count(NULL, reminders_per_day);
ALTER TABLE public.profiles
  ALTER COLUMN reminder_times SET NOT NULL,
  ADD CONSTRAINT profile_reminder_times_valid
    CHECK (public.valid_reminder_times(reminder_times));

CREATE FUNCTION public.sync_reminder_times()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reminder_times := coalesce(
      NEW.reminder_times,
      public.reminder_times_for_count(NULL, NEW.reminders_per_day)
    );
  ELSIF NEW.reminder_times IS DISTINCT FROM OLD.reminder_times THEN
    NULL; -- explicit times win; the count is derived below
  ELSIF NEW.reminders_per_day IS DISTINCT FROM OLD.reminders_per_day THEN
    NEW.reminder_times := public.reminder_times_for_count(
      OLD.reminder_times, NEW.reminders_per_day
    );
  END IF;
  NEW.reminders_per_day := cardinality(NEW.reminder_times);
  RETURN NEW;
END $$;

CREATE TRIGGER sync_reminder_times
  BEFORE INSERT OR UPDATE OF reminder_times, reminders_per_day ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_reminder_times();

-- Same bounded, set-based scheduler; slots now come from reminder_times and
-- are labelled HH24:MI in the idempotency key.
CREATE OR REPLACE FUNCTION public.schedule_notification_batch(
  requested_now timestamptz DEFAULT now(), requested_force boolean DEFAULT false
) RETURNS TABLE(enqueued int, completed boolean, invalid_timezones int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.notification_scheduler_runs; last_profile uuid; profile_count int; inserted int; invalid int;
BEGIN
  IF requested_now IS NULL THEN RAISE EXCEPTION 'Run time required' USING ERRCODE = '22023'; END IF;
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
      SELECT to_char(slot.v, 'HH24:MI') AS label
      FROM unnest(coalesce(p.reminder_times, public.reminder_times_for_count(NULL, p.reminders_per_day)))
        WITH ORDINALITY slot(v, position)
      WHERE (r.force_run AND slot.position = 1) OR
        (NOT r.force_run
          AND p.minutes >= extract(hour FROM slot.v)::int * 60 + extract(minute FROM slot.v)::int
          AND p.minutes < extract(hour FROM slot.v)::int * 60 + extract(minute FROM slot.v)::int + 15)
      ORDER BY slot.position
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
