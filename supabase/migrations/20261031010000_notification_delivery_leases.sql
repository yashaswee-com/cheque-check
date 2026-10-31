ALTER TABLE public.notification_jobs
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN provider_started_at timestamptz,
  ADD COLUMN provider_message_id text,
  ADD COLUMN delivery_recipient text,
  ADD COLUMN quota_reserved boolean NOT NULL DEFAULT false,
  ADD COLUMN quota_reset_at timestamptz;

CREATE TABLE public.notification_attempts (
  claim_token uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.notification_jobs(id),
  outcome text NOT NULL CHECK (outcome IN ('started', 'accepted', 'rejected', 'uncertain')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_attempts TO service_role;
CREATE INDEX notification_jobs_expired_lease_idx
  ON public.notification_jobs(lease_until) WHERE status = 'processing';

-- Pre-migration workers have no ownership token or known provider outcome.
-- Deploy with dispatch paused; reconcile these instead of redelivering them.
UPDATE public.notification_jobs SET status = 'failed',
  last_error = 'Legacy processing job; provider reconciliation required', updated_at = now()
  WHERE status = 'processing';
UPDATE public.notification_jobs SET status = 'failed',
  last_error = 'Retry attempts exhausted', updated_at = now()
  WHERE status = 'pending' AND attempts >= 3;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
  p_batch_size int DEFAULT 50, p_job_ids uuid[] DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  IF (p_job_ids IS NOT NULL OR p_user_id IS NOT NULL) AND
    (p_job_ids IS NULL OR cardinality(p_job_ids) = 0 OR p_user_id IS NULL OR
      coalesce(auth.role(), '') <> 'service_role') THEN
    RAISE EXCEPTION 'Invalid service-role scope' USING ERRCODE = '42501';
  END IF;

  -- A terminated worker is retryable only if it never began a provider request.
  WITH expired AS (
    SELECT id FROM public.notification_jobs
    WHERE status = 'processing' AND lease_until < now()
    ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED
  ), recovered AS (
    UPDATE public.notification_jobs j
    SET status = CASE WHEN provider_started_at IS NULL AND attempts < 3
        THEN 'pending'::public.notification_job_status ELSE 'failed'::public.notification_job_status END,
      last_error = CASE WHEN provider_started_at IS NULL THEN 'Worker lease expired'
        ELSE 'Provider outcome uncertain; reconciliation required' END,
      lease_until = NULL, updated_at = now()
    WHERE j.id IN (SELECT id FROM expired) RETURNING j.*
  )
  UPDATE public.notification_attempts a SET outcome = 'uncertain',
    error = 'Worker lease expired; reconciliation required', updated_at = now()
  FROM recovered r WHERE a.claim_token = r.claim_token AND a.outcome = 'started';

  RETURN QUERY UPDATE public.notification_jobs j
  SET status = 'processing', attempts = attempts + 1, claim_token = gen_random_uuid(),
    lease_until = now() + interval '2 minutes', provider_started_at = NULL, updated_at = now()
  WHERE j.id IN (
    SELECT q.id FROM public.notification_jobs q
    WHERE q.status = 'pending' AND q.scheduled_at <= now() AND q.attempts < 3
      AND (p_user_id IS NULL OR q.user_id = p_user_id)
      AND (p_job_ids IS NULL OR q.id = ANY(p_job_ids))
      AND public.lifecycle_user_active(q.user_id)
      AND (q.business_id IS NULL OR EXISTS (SELECT 1 FROM public.businesses b
        WHERE b.id = q.business_id AND b.user_id = q.user_id AND b.deleted_at IS NULL))
    ORDER BY q.scheduled_at, q.id LIMIT p_batch_size FOR UPDATE OF q SKIP LOCKED
  ) RETURNING j.*;
END $$;

CREATE FUNCTION public.start_notification_delivery(
  requested_job uuid, requested_token uuid, requested_recipient text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.notification_jobs; q public.user_quotas;
BEGIN
  SELECT * INTO j FROM public.notification_jobs WHERE id = requested_job FOR UPDATE;
  IF NOT FOUND OR requested_token IS NULL OR j.status <> 'processing' OR j.claim_token IS DISTINCT FROM requested_token
    OR j.lease_until IS NULL OR j.lease_until <= now() OR j.provider_started_at IS NOT NULL
    OR NOT public.lifecycle_user_active(j.user_id) THEN
    RAISE EXCEPTION 'Delivery claim is no longer valid' USING ERRCODE = '55000';
  END IF;
  IF requested_recipient IS NULL OR requested_recipient !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'Invalid recipient' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO q FROM public.user_quotas WHERE user_id = j.user_id
    AND feature_id = 'voice_reminder' FOR UPDATE;
  IF NOT FOUND OR q.used >= q."limit" OR (q.reset_at IS NOT NULL AND q.reset_at <= now()) THEN
    RETURN false;
  END IF;
  UPDATE public.user_quotas SET used = used + 1, updated_at = now() WHERE id = q.id;
  UPDATE public.notification_jobs SET quota_reserved = true, quota_reset_at = q.reset_at,
    provider_started_at = now(), delivery_recipient = requested_recipient, updated_at = now()
    WHERE id = j.id;
  INSERT INTO public.notification_attempts(claim_token, job_id, outcome)
    VALUES(requested_token, j.id, 'started');
  RETURN true;
END $$;

-- Acceptance/rejection, quota settlement and the audit are a single transaction.
-- The same token can safely be finalized again after a lost database response.
CREATE FUNCTION public.finish_notification_delivery(
  requested_job uuid, requested_token uuid, requested_outcome text,
  requested_provider_id text DEFAULT NULL, requested_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.notification_jobs; a public.notification_attempts;
BEGIN
  IF requested_outcome IS NULL OR requested_outcome NOT IN ('accepted', 'rejected', 'uncertain')
    OR (requested_outcome = 'accepted' AND coalesce(requested_provider_id, '') = '') THEN
    RAISE EXCEPTION 'Invalid provider outcome' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO j FROM public.notification_jobs WHERE id = requested_job FOR UPDATE;
  IF NOT FOUND OR j.claim_token IS DISTINCT FROM requested_token THEN
    RAISE EXCEPTION 'Stale delivery claim' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO a FROM public.notification_attempts WHERE claim_token = requested_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery has not started' USING ERRCODE = '55000'; END IF;
  IF a.outcome IN ('accepted', 'rejected') THEN
    IF a.outcome <> requested_outcome OR
      (a.outcome = 'accepted' AND a.provider_message_id IS DISTINCT FROM requested_provider_id) THEN
      RAISE EXCEPTION 'Conflicting delivery outcome' USING ERRCODE = '55000';
    END IF;
    RETURN;
  END IF;
  UPDATE public.notification_attempts SET outcome = requested_outcome,
    provider_message_id = requested_provider_id, error = requested_error, updated_at = now()
    WHERE claim_token = requested_token;
  IF requested_outcome = 'rejected' AND j.quota_reserved THEN
    -- Never refund a reservation into a different quota period.
    UPDATE public.user_quotas SET used = greatest(used - 1, 0), updated_at = now()
      WHERE user_id = j.user_id AND feature_id = 'voice_reminder'
        AND reset_at IS NOT DISTINCT FROM j.quota_reset_at;
  END IF;
  UPDATE public.notification_jobs SET
    status = CASE WHEN j.status = 'cancelled' THEN j.status
      WHEN requested_outcome = 'accepted' THEN 'sent'::public.notification_job_status
      WHEN requested_outcome = 'rejected' AND j.attempts < 3 THEN 'pending'::public.notification_job_status
      ELSE 'failed'::public.notification_job_status END,
    scheduled_at = CASE WHEN requested_outcome = 'rejected'
      THEN now() + CASE WHEN j.attempts = 1 THEN interval '10 minutes' ELSE interval '30 minutes' END
      ELSE scheduled_at END,
    lease_until = NULL, quota_reserved = requested_outcome <> 'rejected',
    provider_message_id = requested_provider_id, last_error = requested_error, updated_at = now()
    WHERE id = requested_job;
  IF requested_outcome <> 'uncertain' THEN
    INSERT INTO public.notification_logs(job_id, user_id, channel, purpose, recipient,
      status, provider, provider_message_id, error)
    VALUES(j.id, j.user_id, j.channel, j.purpose, j.delivery_recipient,
      CASE WHEN requested_outcome = 'accepted' THEN 'success'::public.notification_log_status
        ELSE 'failed'::public.notification_log_status END,
      'twilio_voice', requested_provider_id, requested_error);
  END IF;
END $$;

CREATE FUNCTION public.release_notification_claim(
  requested_job uuid, requested_token uuid, requested_error text, requested_skip boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.notification_jobs SET
    status = CASE WHEN requested_skip THEN 'skipped'::public.notification_job_status
      WHEN attempts < 3 THEN 'pending'::public.notification_job_status
      ELSE 'failed'::public.notification_job_status END,
    scheduled_at = now() + interval '10 minutes', lease_until = NULL,
    last_error = requested_error, updated_at = now()
  WHERE id = requested_job AND claim_token = requested_token
    AND status = 'processing' AND provider_started_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale or started delivery claim' USING ERRCODE = '55000'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.start_notification_delivery(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(int,uuid[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int,uuid[],uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finish_notification_delivery(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_notification_claim(uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_notification_delivery(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_notification_delivery(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_notification_claim(uuid,uuid,text,boolean) TO service_role;
