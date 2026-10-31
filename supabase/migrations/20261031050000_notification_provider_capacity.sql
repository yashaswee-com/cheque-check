-- Pause dispatch during rollout: old workers must not bypass the shared provider gate.
CREATE TABLE public.notification_provider_capacity (
  provider text PRIMARY KEY CHECK (provider = 'twilio_voice'),
  starts_per_second numeric NOT NULL CHECK (starts_per_second > 0 AND starts_per_second <= 100),
  max_in_flight int NOT NULL CHECK (max_in_flight BETWEEN 1 AND 100),
  next_start_at timestamptz NOT NULL DEFAULT '-infinity',
  throttled_total bigint NOT NULL DEFAULT 0,
  last_throttled_at timestamptz
);
INSERT INTO public.notification_provider_capacity(provider,starts_per_second,max_in_flight)
  VALUES ('twilio_voice',1,5);
CREATE TABLE public.notification_provider_slots (
  claim_token uuid PRIMARY KEY REFERENCES public.notification_attempts(claim_token),
  provider text NOT NULL REFERENCES public.notification_provider_capacity(provider),
  expires_at timestamptz NOT NULL
);
CREATE INDEX notification_provider_slots_expiry_idx ON public.notification_provider_slots(expires_at);
ALTER TABLE public.notification_provider_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_provider_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_provider_capacity,public.notification_provider_slots FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.notification_provider_capacity,public.notification_provider_slots TO service_role;

-- Keep quota accounting in its existing transaction, but remove the callable bypass.
ALTER FUNCTION public.start_notification_delivery(uuid,uuid,text) RENAME TO reserve_notification_delivery_quota;
REVOKE ALL ON FUNCTION public.reserve_notification_delivery_quota(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admit_notification_delivery(
  requested_job uuid,requested_token uuid,requested_recipient text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE j public.notification_jobs; capacity public.notification_provider_capacity; admitted_at timestamptz;
BEGIN
  -- Lock order is job then capacity, also used by settlement's slot-release trigger.
  SELECT * INTO j FROM public.notification_jobs WHERE id = requested_job FOR UPDATE;
  IF NOT FOUND OR requested_token IS NULL OR j.status <> 'processing' OR j.claim_token IS DISTINCT FROM requested_token
    OR j.lease_until IS NULL OR j.lease_until <= clock_timestamp() OR j.provider_started_at IS NOT NULL
    OR NOT public.lifecycle_user_active(j.user_id) OR j.channel <> 'voice'
    OR (j.business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.businesses b
      WHERE b.id = j.business_id AND b.user_id = j.user_id AND b.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Delivery claim is no longer valid' USING ERRCODE = '55000';
  END IF;
  IF requested_recipient IS NULL OR requested_recipient !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'Invalid recipient' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO capacity FROM public.notification_provider_capacity WHERE provider = 'twilio_voice' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider capacity configuration unavailable' USING ERRCODE = '55000'; END IF;
  admitted_at := clock_timestamp();
  IF j.lease_until <= admitted_at THEN RAISE EXCEPTION 'Delivery lease expired while waiting' USING ERRCODE = '55000'; END IF;
  DELETE FROM public.notification_provider_slots WHERE provider = capacity.provider AND expires_at <= admitted_at;
  IF capacity.next_start_at > admitted_at OR
    (SELECT count(*) FROM public.notification_provider_slots WHERE provider = capacity.provider) >= capacity.max_in_flight THEN
    UPDATE public.notification_provider_capacity SET throttled_total = throttled_total + 1,last_throttled_at = admitted_at
      WHERE provider = capacity.provider;
    UPDATE public.notification_jobs SET status = 'pending',attempts = greatest(0,attempts - 1),
      scheduled_at = greatest(admitted_at + interval '15 seconds',capacity.next_start_at),
      lease_until = NULL,claim_token = NULL,last_error = 'Provider capacity unavailable; queued',updated_at = admitted_at
      WHERE id = j.id;
    RETURN jsonb_build_object('status','throttled');
  END IF;
  IF NOT public.reserve_notification_delivery_quota(requested_job,requested_token,requested_recipient) THEN
    RETURN jsonb_build_object('status','quota_exhausted');
  END IF;
  admitted_at := clock_timestamp();
  IF j.lease_until <= admitted_at THEN
    RAISE EXCEPTION 'Delivery lease expired during admission' USING ERRCODE = '55000';
  END IF;
  UPDATE public.notification_provider_capacity SET next_start_at = admitted_at + interval '1 second' / capacity.starts_per_second
    WHERE provider = capacity.provider;
  -- A worker has 20 seconds to begin its 10-second HTTP request; crashes hold the slot conservatively.
  INSERT INTO public.notification_provider_slots(claim_token,provider,expires_at)
    VALUES(requested_token,capacity.provider,admitted_at + interval '2 minutes');
  RETURN jsonb_build_object('status','started','start_before',admitted_at + interval '20 seconds');
END $$;
REVOKE ALL ON FUNCTION public.admit_notification_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_notification_delivery(uuid,uuid,text) TO service_role;

-- Fail closed for legacy callers that cannot honor the admission deadline or queued outcome.
CREATE FUNCTION public.start_notification_delivery(requested_job uuid,requested_token uuid,requested_recipient text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Upgrade the dispatcher to admit_notification_delivery' USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION public.start_notification_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_notification_delivery(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.release_notification_provider_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.outcome IN ('accepted','rejected') THEN
    -- Serialization with admission prevents count/delete races across overlapping workers.
    PERFORM 1 FROM public.notification_provider_capacity WHERE provider = 'twilio_voice' FOR UPDATE;
    DELETE FROM public.notification_provider_slots WHERE claim_token = NEW.claim_token;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.release_notification_provider_slot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER release_notification_provider_slot AFTER UPDATE OF outcome ON public.notification_attempts
  FOR EACH ROW EXECUTE FUNCTION public.release_notification_provider_slot();

CREATE FUNCTION public.notification_provider_health()
RETURNS TABLE(starts_per_second double precision,max_in_flight int,in_flight int,expired_slots int,
  next_admission_wait_seconds double precision,throttled_total bigint,last_throttled_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
  SELECT c.starts_per_second::double precision,c.max_in_flight,
    count(s.claim_token) FILTER (WHERE s.expires_at > now())::int,
    count(s.claim_token) FILTER (WHERE s.expires_at <= now())::int,
    greatest(0,extract(epoch FROM c.next_start_at - now()))::double precision,c.throttled_total,c.last_throttled_at
  FROM public.notification_provider_capacity c LEFT JOIN public.notification_provider_slots s ON s.provider = c.provider
  WHERE c.provider = 'twilio_voice' GROUP BY c.provider
$$;
REVOKE ALL ON FUNCTION public.notification_provider_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notification_provider_health() TO service_role;
