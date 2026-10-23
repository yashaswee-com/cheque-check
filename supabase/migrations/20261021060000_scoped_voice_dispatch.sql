-- Scoped claim for manual (ops) dispatch. With no scope this behaves exactly
-- like the global cron claim; a scope is only honoured for service_role and
-- is enforced inside the claim UPDATE, not by filtering responses.
DROP FUNCTION IF EXISTS public.claim_notification_jobs(int);

CREATE FUNCTION public.claim_notification_jobs(
  p_batch_size int DEFAULT 50,
  p_job_ids uuid[] DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_job_ids IS NOT NULL OR p_user_id IS NOT NULL THEN
    IF coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Scoped claims require the service role' USING ERRCODE = '42501';
    END IF;
    IF p_user_id IS NULL OR p_job_ids IS NULL OR cardinality(p_job_ids) = 0 THEN
      RAISE EXCEPTION 'A scoped claim needs both a user and at least one job id' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 THEN
    RAISE EXCEPTION 'Batch size must be positive' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY UPDATE public.notification_jobs j
  SET status = 'processing', attempts = attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT q.id FROM public.notification_jobs q
    WHERE q.status = 'pending' AND q.scheduled_at <= now()
      AND (p_user_id IS NULL OR q.user_id = p_user_id)
      AND (p_job_ids IS NULL OR q.id = ANY(p_job_ids))
      AND public.lifecycle_user_active(q.user_id)
      AND (q.business_id IS NULL OR EXISTS (SELECT 1 FROM public.businesses b
        WHERE b.id = q.business_id AND b.user_id = q.user_id AND b.deleted_at IS NULL))
    ORDER BY q.scheduled_at LIMIT p_batch_size FOR UPDATE OF q SKIP LOCKED
  ) RETURNING j.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(int, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, uuid[], uuid) TO service_role;