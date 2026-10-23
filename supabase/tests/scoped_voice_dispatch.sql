-- Integration assertions for the scoped voice-dispatch claim.
-- Run against a LOCAL/disposable database only:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/scoped_voice_dispatch.sql
-- Everything happens in a transaction that is rolled back.
BEGIN;

DO $$
DECLARE
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  job_a uuid := gen_random_uuid();
  job_b uuid := gen_random_uuid();
  claimed uuid[];
  denied boolean := false;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email)
    VALUES (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', user_a || '@test.invalid'),
           (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', user_b || '@test.invalid');
  -- handle_new_user normally creates profiles; create them if the trigger is absent.
  INSERT INTO public.profiles(user_id) VALUES (user_a), (user_b) ON CONFLICT DO NOTHING;

  INSERT INTO public.notification_jobs(id, user_id, channel, purpose, scheduled_at, idempotency_key, payload)
    VALUES (job_a, user_a, 'voice', 'sample_voice_test', now() - interval '1 minute', 'it:' || job_a, '{}'),
           (job_b, user_b, 'voice', 'sample_voice_test', now() - interval '1 minute', 'it:' || job_b, '{}');

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Targeting user A cannot claim user B, even when B's job id is passed.
  SELECT array_agg(id) INTO claimed FROM public.claim_notification_jobs(50, ARRAY[job_a, job_b], user_a);
  IF claimed IS DISTINCT FROM ARRAY[job_a] THEN
    RAISE EXCEPTION 'scoped claim returned %, expected only %', claimed, job_a;
  END IF;
  IF (SELECT status FROM public.notification_jobs WHERE id = job_b) <> 'pending' THEN
    RAISE EXCEPTION 'user B job must stay pending after a scoped claim for A';
  END IF;

  -- A repeated scoped claim never re-claims an already processing job.
  IF EXISTS (SELECT 1 FROM public.claim_notification_jobs(50, ARRAY[job_a], user_a)) THEN
    RAISE EXCEPTION 'processing job was claimed twice';
  END IF;

  -- The unscoped cron claim still picks up everyone else.
  SELECT array_agg(id) INTO claimed FROM public.claim_notification_jobs(50);
  IF NOT job_b = ANY(claimed) THEN
    RAISE EXCEPTION 'global claim should include user B job';
  END IF;

  -- Incomplete scopes are rejected.
  BEGIN
    PERFORM * FROM public.claim_notification_jobs(50, NULL, user_a);
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'scope without job ids must be rejected'; END IF;

  -- Scoped claims need the service role.
  denied := false;
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM * FROM public.claim_notification_jobs(50, ARRAY[job_a], user_a);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'scoped claim must require service_role'; END IF;
END $$;

ROLLBACK;
