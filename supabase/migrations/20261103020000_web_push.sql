-- Harden the existing notification-platform table rather than replacing it.
DROP POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
DELETE FROM public.push_subscriptions WHERE endpoint !~
  '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%+.-]+$'
  OR length(endpoint)>2048 OR p256dh !~ '^B[A-Za-z0-9_-]{86}$' OR auth !~ '^[A-Za-z0-9_-]{22}$';
DELETE FROM public.push_subscriptions WHERE id IN (
  SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY last_seen_at DESC,id) AS position
    FROM public.push_subscriptions) devices WHERE position>10
);

CREATE FUNCTION public.register_push_subscription(requested_endpoint text,requested_p256dh text,requested_auth text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.push_subscriptions; result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  -- Restrict outbound provider hosts, preventing user-controlled SSRF endpoints.
  IF requested_endpoint IS NULL OR length(requested_endpoint)>2048 OR requested_endpoint !~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%+.-]+$'
    OR requested_p256dh IS NULL OR requested_p256dh !~ '^B[A-Za-z0-9_-]{86}$'
    OR requested_auth IS NULL OR requested_auth !~ '^[A-Za-z0-9_-]{22}$'
  THEN RAISE EXCEPTION 'Invalid push subscription' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  SELECT * INTO existing FROM public.push_subscriptions WHERE endpoint=requested_endpoint;
  IF FOUND AND existing.user_id<>auth.uid() THEN
    RAISE EXCEPTION 'Subscription belongs to another account; unsubscribe this browser first' USING ERRCODE='42501';
  END IF;
  IF existing.id IS NULL AND (SELECT count(*) FROM public.push_subscriptions WHERE user_id=auth.uid())>=10 THEN
    RAISE EXCEPTION 'Maximum of 10 push devices reached' USING ERRCODE='54000';
  END IF;
  INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth)
    VALUES(auth.uid(),requested_endpoint,requested_p256dh,requested_auth)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,last_seen_at=now()
      WHERE push_subscriptions.user_id=auth.uid() RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Subscription ownership changed' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET push_enabled=true WHERE user_id=auth.uid();
  RETURN result;
END $$;

CREATE FUNCTION public.owns_push_subscription(requested_endpoint text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  RETURN EXISTS(SELECT 1 FROM public.push_subscriptions WHERE user_id=auth.uid() AND endpoint=requested_endpoint);
END $$;
CREATE FUNCTION public.remove_push_subscription(requested_endpoint text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  DELETE FROM public.push_subscriptions WHERE user_id=auth.uid() AND endpoint=requested_endpoint;
END $$;
REVOKE ALL ON FUNCTION public.register_push_subscription(text,text,text),
  public.owns_push_subscription(text),public.remove_push_subscription(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text,text,text),
  public.owns_push_subscription(text),public.remove_push_subscription(text) TO authenticated;

CREATE FUNCTION public.cancel_device_push_jobs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.notification_jobs SET status='cancelled',updated_at=now()
    WHERE channel='push' AND user_id=OLD.user_id AND payload->>'subscription_id'=OLD.id::text
      AND status IN ('pending','processing');
  RETURN OLD;
END $$;
CREATE TRIGGER cancel_device_push_jobs AFTER DELETE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.cancel_device_push_jobs();

CREATE FUNCTION public.cleanup_deactivated_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN DELETE FROM public.push_subscriptions WHERE user_id=NEW.user_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cleanup_deactivated_push AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deactivated_push();

CREATE FUNCTION public.enqueue_inbox_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.notification_jobs(user_id,business_id,channel,purpose,payload,idempotency_key)
    SELECT NEW.user_id,NEW.business_id,'push','inbox_event',
      jsonb_build_object('subscription_id',s.id,'inbox_id',NEW.id::text),
      'push:'||NEW.id||':'||s.id
    FROM public.push_subscriptions s JOIN public.profiles p ON p.user_id=s.user_id
    WHERE s.user_id=NEW.user_id AND p.deleted_at IS NULL AND p.push_enabled;
  RETURN NEW;
END $$;
CREATE TRIGGER enqueue_inbox_push AFTER INSERT ON public.notification_inbox
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_inbox_push();

ALTER TABLE public.notification_provider_capacity DROP CONSTRAINT notification_provider_capacity_provider_check;
ALTER TABLE public.notification_provider_capacity ADD CONSTRAINT notification_provider_capacity_provider_check
  CHECK(provider IN ('twilio_voice','web_push'));
INSERT INTO public.notification_provider_capacity(provider,starts_per_second,max_in_flight)
  VALUES('web_push',10,10);
CREATE OR REPLACE FUNCTION public.release_notification_provider_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE slot_provider text;
BEGIN
  IF NEW.outcome IN ('accepted','rejected') THEN
    SELECT provider INTO slot_provider FROM public.notification_provider_slots WHERE claim_token=NEW.claim_token;
    PERFORM 1 FROM public.notification_provider_capacity WHERE provider=slot_provider FOR UPDATE;
    DELETE FROM public.notification_provider_slots WHERE claim_token=NEW.claim_token;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.admit_push_delivery(requested_job uuid,requested_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.notification_jobs; s public.push_subscriptions; capacity public.notification_provider_capacity; admitted_at timestamptz;
BEGIN
  SELECT * INTO j FROM public.notification_jobs WHERE id=requested_job FOR UPDATE;
  IF NOT FOUND OR j.channel<>'push' OR j.status<>'processing' OR requested_token IS NULL
    OR j.claim_token IS DISTINCT FROM requested_token OR j.provider_started_at IS NOT NULL
    OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'Stale push claim' USING ERRCODE='55000';
  END IF;
  SELECT * INTO s FROM public.push_subscriptions WHERE id::text=j.payload->>'subscription_id' AND user_id=j.user_id;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=j.user_id AND p.deleted_at IS NULL AND p.push_enabled)
    OR NOT EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=j.business_id AND b.user_id=j.user_id AND b.deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.notification_inbox n WHERE n.id::text=j.payload->>'inbox_id' AND n.user_id=j.user_id
      AND n.business_id=j.business_id AND n.created_at >= now()-interval '90 days')
  THEN
    PERFORM public.release_notification_claim(j.id,requested_token,'Push device or event unavailable',true);
    RETURN jsonb_build_object('status','skipped');
  END IF;
  SELECT * INTO capacity FROM public.notification_provider_capacity WHERE provider='web_push' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Push capacity unavailable' USING ERRCODE='55000'; END IF;
  admitted_at:=clock_timestamp();
  IF j.lease_until<=admitted_at THEN RAISE EXCEPTION 'Push lease expired' USING ERRCODE='55000'; END IF;
  DELETE FROM public.notification_provider_slots WHERE provider='web_push' AND expires_at<=admitted_at;
  IF capacity.next_start_at>admitted_at OR
    (SELECT count(*) FROM public.notification_provider_slots WHERE provider='web_push')>=capacity.max_in_flight THEN
    UPDATE public.notification_provider_capacity SET throttled_total=throttled_total+1,last_throttled_at=admitted_at WHERE provider='web_push';
    UPDATE public.notification_jobs SET status='pending',attempts=greatest(0,attempts-1),
      scheduled_at=greatest(admitted_at+interval '15 seconds',capacity.next_start_at),
      lease_until=NULL,claim_token=NULL,last_error='Push capacity unavailable; queued',updated_at=admitted_at WHERE id=j.id;
    RETURN jsonb_build_object('status','throttled');
  END IF;
  UPDATE public.notification_jobs SET provider_started_at=admitted_at,delivery_recipient=s.id::text,updated_at=admitted_at WHERE id=j.id;
  INSERT INTO public.notification_attempts(claim_token,job_id,outcome) VALUES(requested_token,j.id,'started');
  UPDATE public.notification_provider_capacity SET next_start_at=admitted_at+interval '1 second'/capacity.starts_per_second WHERE provider='web_push';
  INSERT INTO public.notification_provider_slots(claim_token,provider,expires_at) VALUES(requested_token,'web_push',admitted_at+interval '2 minutes');
  RETURN jsonb_build_object('status','started','start_before',admitted_at+interval '20 seconds',
    'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)));
END $$;

CREATE FUNCTION public.finish_push_delivery(requested_job uuid,requested_token uuid,requested_outcome text,requested_status int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.notification_jobs; a public.notification_attempts;
BEGIN
  IF requested_outcome IS NULL OR requested_outcome NOT IN ('accepted','rejected','uncertain')
    OR (requested_outcome='accepted' AND (requested_status IS NULL OR requested_status NOT BETWEEN 200 AND 299))
    OR (requested_outcome='rejected' AND (requested_status IS NULL OR requested_status NOT BETWEEN 400 AND 599)) THEN
    RAISE EXCEPTION 'Invalid push outcome' USING ERRCODE='22023';
  END IF;
  SELECT * INTO j FROM public.notification_jobs WHERE id=requested_job FOR UPDATE;
  IF NOT FOUND OR j.channel<>'push' OR requested_token IS NULL OR j.claim_token IS DISTINCT FROM requested_token THEN
    RAISE EXCEPTION 'Stale push claim' USING ERRCODE='55000';
  END IF;
  SELECT * INTO a FROM public.notification_attempts WHERE claim_token=requested_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Push delivery not started' USING ERRCODE='55000'; END IF;
  IF a.outcome IN ('accepted','rejected') THEN
    IF a.outcome<>requested_outcome OR a.provider_message_id IS DISTINCT FROM requested_status::text THEN
      RAISE EXCEPTION 'Conflicting push outcome' USING ERRCODE='55000';
    END IF;
    RETURN;
  END IF;
  UPDATE public.notification_attempts SET outcome=requested_outcome,provider_message_id=requested_status::text,updated_at=now()
    WHERE claim_token=requested_token;
  UPDATE public.notification_jobs SET status=CASE
      WHEN j.status='cancelled' THEN j.status
      WHEN requested_outcome='accepted' THEN 'sent'::public.notification_job_status
      WHEN requested_outcome='rejected' AND requested_status IN (404,410) THEN 'skipped'::public.notification_job_status
      WHEN requested_outcome='rejected' AND requested_status IN (429,500,502,503,504) AND j.attempts<3 THEN 'pending'::public.notification_job_status
      ELSE 'failed'::public.notification_job_status END,
    lease_until=NULL,scheduled_at=now()+CASE WHEN j.attempts=1 THEN interval '10 minutes' ELSE interval '30 minutes' END,
    provider_message_id=requested_status::text,last_error=CASE WHEN requested_outcome='accepted' THEN NULL
      ELSE 'Push provider outcome: '||requested_outcome||coalesce(' HTTP '||requested_status,'') END,updated_at=now()
    WHERE id=j.id;
  IF requested_status IN (404,410) THEN DELETE FROM public.push_subscriptions WHERE id::text=j.payload->>'subscription_id' AND user_id=j.user_id; END IF;
  IF requested_outcome<>'uncertain' THEN
    INSERT INTO public.notification_logs(job_id,user_id,channel,purpose,recipient,status,provider,provider_message_id)
      VALUES(j.id,j.user_id,'push',j.purpose,j.delivery_recipient,
        CASE WHEN requested_outcome='accepted' THEN 'success'::public.notification_log_status ELSE 'failed'::public.notification_log_status END,
        'web_push',requested_status::text);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admit_push_delivery(uuid,uuid),public.finish_push_delivery(uuid,uuid,text,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_push_delivery(uuid,uuid),public.finish_push_delivery(uuid,uuid,text,int) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_device_push_jobs(),public.cleanup_deactivated_push(),public.enqueue_inbox_push() FROM PUBLIC,anon,authenticated;
