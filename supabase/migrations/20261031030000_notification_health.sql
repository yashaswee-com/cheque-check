CREATE INDEX notification_jobs_health_open_idx ON public.notification_jobs(status, scheduled_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX notification_jobs_health_updated_idx ON public.notification_jobs(updated_at)
  WHERE status IN ('sent', 'failed', 'skipped', 'cancelled');
CREATE INDEX notification_jobs_health_reconcile_idx ON public.notification_jobs(status)
  WHERE quota_reserved AND provider_started_at IS NOT NULL AND provider_message_id IS NULL
    AND status IN ('failed', 'cancelled');

-- Aggregate-only, read-only diagnostics. Never return recipients, payloads or provider identifiers.
CREATE FUNCTION public.notification_health(requested_window_minutes int DEFAULT 60)
RETURNS TABLE(
  pending_due int, pending_future int, processing int, expired_leases int,
  reconciliation_required int, oldest_due_age_seconds double precision,
  sent_in_window int, failed_in_window int, skipped_in_window int, cancelled_in_window int,
  incomplete_scheduler_runs int, oldest_scheduler_age_seconds double precision,
  scheduler_checkpoint_age_seconds double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF requested_window_minutes IS NULL OR requested_window_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Health window must be between 1 and 1440 minutes' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH open_jobs AS (
    SELECT count(*) FILTER (WHERE status = 'pending' AND scheduled_at <= now())::int AS due,
      count(*) FILTER (WHERE status = 'pending' AND scheduled_at > now())::int AS future,
      count(*) FILTER (WHERE status = 'processing')::int AS working,
      count(*) FILTER (WHERE status = 'processing' AND (lease_until IS NULL OR lease_until <= now()))::int AS expired,
      extract(epoch FROM now() - min(scheduled_at) FILTER (WHERE status = 'pending' AND scheduled_at <= now()))::double precision AS age
    FROM public.notification_jobs WHERE status IN ('pending', 'processing')
  ), outcomes AS (
    SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM public.notification_jobs WHERE status IN ('sent', 'failed', 'skipped', 'cancelled')
      AND updated_at >= now() - make_interval(mins => requested_window_minutes)
  ), reconcile AS (
    SELECT count(*)::int AS total FROM public.notification_jobs
    WHERE quota_reserved AND provider_started_at IS NOT NULL AND provider_message_id IS NULL
      AND status IN ('failed', 'cancelled')
  ), scheduler AS (
    SELECT count(*) FILTER (WHERE NOT completed)::int AS incomplete,
      greatest(0, extract(epoch FROM now() - min(run_at) FILTER (WHERE NOT completed)))::double precision AS age,
      extract(epoch FROM now() - max(updated_at))::double precision AS checkpoint_age
    FROM public.notification_scheduler_runs
  )
  SELECT o.due, o.future, o.working, o.expired, r.total, coalesce(o.age, 0),
    x.sent, x.failed, x.skipped, x.cancelled, s.incomplete, coalesce(s.age, 0), s.checkpoint_age
  FROM open_jobs o CROSS JOIN outcomes x CROSS JOIN reconcile r CROSS JOIN scheduler s;
END $$;
REVOKE ALL ON FUNCTION public.notification_health(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_health(int) TO service_role;
