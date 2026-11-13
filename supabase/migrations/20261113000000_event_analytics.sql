CREATE TABLE public.marketing_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('live','test')),
  launched_at timestamptz NOT NULL DEFAULT now(),
  aggregated_at timestamptz
);
INSERT INTO public.marketing_configuration DEFAULT VALUES;

-- Operational milestone baselines are maintained even without marketing consent.
CREATE TABLE public.marketing_user_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  registered_at timestamptz,
  milestones text[] NOT NULL DEFAULT '{}',
  published_count integer NOT NULL DEFAULT 0 CHECK (published_count BETWEEN 0 AND 5),
  context jsonb NOT NULL DEFAULT '{}',
  matching jsonb,
  matching_expires_at timestamptz
);
INSERT INTO public.marketing_user_state(user_id,milestones,published_count)
SELECT u.id,
  CASE WHEN to_jsonb(u)->>'last_sign_in_at' IS NOT NULL AND
    (to_jsonb(u)->>'email_confirmed_at' IS NOT NULL OR to_jsonb(u)->>'phone_confirmed_at' IS NOT NULL)
    THEN ARRAY['signup_success'] ELSE ARRAY[]::text[] END ||
    CASE WHEN EXISTS(SELECT 1 FROM public.businesses existing WHERE existing.user_id=u.id)
      THEN ARRAY['onboarding_started','onboarding_completed'] ELSE ARRAY[]::text[] END ||
    CASE WHEN count(c.id)>0 THEN ARRAY['first_cheque'] ELSE ARRAY[]::text[] END ||
    CASE WHEN count(c.id)>=5 THEN ARRAY['five_cheques'] ELSE ARRAY[]::text[] END,
  least(count(c.id),5)::integer
FROM auth.users u LEFT JOIN public.businesses b ON b.user_id=u.id
LEFT JOIN public.cheques c ON c.business_id=b.id AND NOT c.is_draft
GROUP BY u.id;

ALTER TABLE public.cheques ADD COLUMN marketing_publication_counted boolean NOT NULL DEFAULT false;

CREATE TABLE public.event_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN (
    'landing_page_view','signup_page_view','signup_success','onboarding_started',
    'onboarding_completed','first_cheque','five_cheques','free_limit_completed',
    'lifetime_purchase_started','recharge_purchase_started',
    'lifetime_purchase_finished','recharge_purchase_finished')),
  meta_event_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_id uuid,
  session_id uuid,
  dedupe_key text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  context jsonb NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}',
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','delivered','failed','cancelled')),
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivery_code text,
  delivered_at timestamptz,
  browser_claimed_at timestamptz
);
CREATE INDEX event_analytics_time_idx ON public.event_analytics(occurred_at);
CREATE INDEX event_analytics_owner_idx ON public.event_analytics(user_id,occurred_at DESC);
CREATE INDEX event_analytics_visitor_idx ON public.event_analytics(visitor_id,occurred_at DESC);

-- Matching data is short-lived, separate from the analytics log, and never returned to browsers.
CREATE TABLE public.marketing_delivery_queue (
  event_id uuid PRIMARY KEY REFERENCES public.event_analytics(id) ON DELETE CASCADE,
  matching jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  lease_token uuid,
  lease_until timestamptz
);
CREATE INDEX marketing_delivery_due_idx ON public.marketing_delivery_queue(available_at);
CREATE INDEX marketing_delivery_expiry_idx ON public.marketing_delivery_queue(expires_at);
CREATE INDEX marketing_matching_expiry_idx ON public.marketing_user_state(matching_expires_at)
  WHERE matching_expires_at IS NOT NULL;

CREATE TABLE public.marketing_ingress_windows (
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL,
  PRIMARY KEY(subject_hash,window_started_at)
);

CREATE TABLE public.event_analytics_daily_totals (
  day date NOT NULL,
  event_name text NOT NULL,
  mode text NOT NULL,
  dimensions jsonb NOT NULL,
  event_count bigint NOT NULL,
  unique_users bigint NOT NULL,
  unique_anonymous_visitors bigint NOT NULL,
  revenue_paise bigint NOT NULL,
  delivered bigint NOT NULL,
  failed bigint NOT NULL,
  pending bigint NOT NULL,
  cancelled bigint NOT NULL,
  PRIMARY KEY(day,event_name,mode,dimensions)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_configuration','marketing_user_state','event_analytics',
    'marketing_delivery_queue','event_analytics_daily_totals','marketing_ingress_windows'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE FUNCTION public.marketing_admit_ingress(subject text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE allowed boolean; current_window timestamptz:=date_trunc('minute',now());
BEGIN
  IF subject !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid rate limit subject' USING ERRCODE='22023'; END IF;
  INSERT INTO public.marketing_ingress_windows(subject_hash,window_started_at,requests)
    VALUES(subject,current_window,1)
  ON CONFLICT(subject_hash,window_started_at) DO UPDATE SET requests=marketing_ingress_windows.requests+1
    WHERE marketing_ingress_windows.requests<60 RETURNING true INTO allowed;
  RETURN coalesce(allowed,false);
END $$;

CREATE FUNCTION public.marketing_emit(
  owner uuid, event text, event_key text, event_details jsonb DEFAULT '{}',
  anonymous_context jsonb DEFAULT NULL, anonymous_matching jsonb DEFAULT NULL,
  visitor uuid DEFAULT NULL, session uuid DEFAULT NULL, event_time timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.marketing_user_state; configuration public.marketing_configuration;
  event_context jsonb; match_data jsonb; result uuid; meta_name text;
BEGIN
  SELECT * INTO configuration FROM public.marketing_configuration WHERE singleton;
  IF NOT configuration.enabled THEN RETURN NULL; END IF;
  IF owner IS NOT NULL THEN
    SELECT * INTO s FROM public.marketing_user_state WHERE user_id=owner FOR UPDATE;
    IF NOT s.consent OR s.consent_at>event_time OR NOT public.lifecycle_user_active(owner) THEN RETURN NULL; END IF;
    event_context:=s.context;
    IF s.matching_expires_at>now() THEN match_data:=s.matching; END IF;
  ELSE
    event_context:=anonymous_context; match_data:=anonymous_matching;
  END IF;
  IF event_context IS NULL OR (owner IS NULL AND (match_data IS NULL OR match_data='{}')) THEN RETURN NULL; END IF;
  match_data:=coalesce(match_data,'{}'::jsonb);
  meta_name:=CASE event
    WHEN 'landing_page_view' THEN 'PageView' WHEN 'signup_page_view' THEN 'PageView'
    WHEN 'signup_success' THEN 'CompleteRegistration'
    WHEN 'lifetime_purchase_started' THEN 'InitiateCheckout'
    WHEN 'recharge_purchase_started' THEN 'InitiateCheckout'
    WHEN 'lifetime_purchase_finished' THEN 'Purchase'
    WHEN 'recharge_purchase_finished' THEN 'Purchase'
    WHEN 'onboarding_started' THEN 'OnboardingStarted'
    WHEN 'onboarding_completed' THEN 'OnboardingCompleted'
    WHEN 'first_cheque' THEN 'FirstChequeAdded'
    WHEN 'five_cheques' THEN 'FiveChequesAdded'
    WHEN 'free_limit_completed' THEN 'FreeLimitCompleted' END;
  INSERT INTO public.event_analytics(event_name,meta_event_name,user_id,visitor_id,session_id,
    dedupe_key,mode,context,details,occurred_at)
  VALUES(event,meta_name,owner,visitor,session,event_key,configuration.mode,event_context,event_details,event_time)
  ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO result;
  IF result IS NOT NULL THEN
    INSERT INTO public.marketing_delivery_queue(event_id,matching,expires_at)
    VALUES(result,match_data,least(now()+interval '7 days',event_time+interval '7 days'));
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.marketing_milestone(owner uuid,event text,event_details jsonb DEFAULT '{}',event_time timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
  UPDATE public.marketing_user_state SET milestones=array_append(milestones,event)
    WHERE user_id=owner AND NOT event=ANY(milestones);
  IF FOUND THEN
    result:=public.marketing_emit(owner,event,owner::text||':'||event,event_details,
      event_time=>event_time);
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.marketing_auth_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE signed_at timestamptz;
BEGIN
  INSERT INTO public.marketing_user_state(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  IF (to_jsonb(NEW)->>'email_confirmed_at' IS NOT NULL OR to_jsonb(NEW)->>'phone_confirmed_at' IS NOT NULL)
    AND to_jsonb(NEW)->>'last_sign_in_at' IS NOT NULL THEN
    signed_at:=(to_jsonb(NEW)->>'last_sign_in_at')::timestamptz;
    UPDATE public.marketing_user_state SET registered_at=signed_at
      WHERE user_id=NEW.id AND registered_at IS NULL AND NOT 'signup_success'=ANY(milestones);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_auth_transition AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.marketing_auth_transition();

CREATE FUNCTION public.marketing_cheque_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner uuid; total integer;
BEGIN
  -- The marker is server-owned; restores and repeated draft toggles never count again.
  IF TG_OP='UPDATE' THEN
    NEW.marketing_publication_counted:=OLD.marketing_publication_counted;
    -- Existing published rows are already in the rollout baseline, including deleted rows.
    IF NOT OLD.is_draft THEN NEW.marketing_publication_counted:=true; RETURN NEW; END IF;
  ELSE NEW.marketing_publication_counted:=false; END IF;
  IF NEW.is_draft OR NEW.deleted_at IS NOT NULL OR NEW.marketing_publication_counted THEN RETURN NEW; END IF;
  NEW.marketing_publication_counted:=true;
  SELECT user_id INTO owner FROM public.businesses WHERE id=NEW.business_id;
  UPDATE public.marketing_user_state SET published_count=least(published_count+1,5)
    WHERE user_id=owner AND published_count<5 RETURNING published_count INTO total;
  IF total=1 THEN PERFORM public.marketing_milestone(owner,'first_cheque'); END IF;
  IF total=5 THEN PERFORM public.marketing_milestone(owner,'five_cheques'); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_cheque_transition BEFORE INSERT OR UPDATE ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.marketing_cheque_transition();

CREATE FUNCTION public.marketing_checkout_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text; info jsonb;
BEGIN
  kind:=CASE WHEN NEW.product_snapshot->>'transaction_type'='lifetime' THEN 'lifetime' ELSE 'recharge' END;
  info:=jsonb_build_object('product_id',NEW.product_id,'product_type',kind,
    'feature',NEW.product_snapshot->>'feature_id','amount_paise',NEW.provider_amount,
    'wallet_paise',NEW.wallet_amount,'discount_paise',NEW.discount,'currency',NEW.currency);
  IF OLD.provider_order IS NULL AND NEW.provider_order IS NOT NULL THEN
    PERFORM public.marketing_emit(NEW.user_id,kind||'_purchase_started',NEW.id::text||':started',info);
  END IF;
  IF OLD.status<>'paid' AND NEW.status='paid' THEN
    PERFORM public.marketing_emit(NEW.user_id,kind||'_purchase_finished',NEW.id::text||':finished',info);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_checkout_transition AFTER UPDATE ON public.payment_checkouts
FOR EACH ROW EXECUTE FUNCTION public.marketing_checkout_transition();

CREATE FUNCTION public.marketing_sync(
  owner uuid, accepted boolean, explicit_choice boolean, accepted_at timestamptz,
  event_context jsonb, match_data jsonb, visitor uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.marketing_user_state;
BEGIN
  IF owner IS NULL THEN
    IF NOT accepted THEN
      UPDATE public.event_analytics SET delivery_status='cancelled',delivery_code='consent_withdrawn'
        WHERE visitor_id=visitor AND delivery_status='pending';
      DELETE FROM public.marketing_delivery_queue WHERE event_id IN (
        SELECT id FROM public.event_analytics WHERE visitor_id=visitor AND delivery_status='cancelled');
    END IF;
    RETURN accepted;
  END IF;
  SELECT * INTO s FROM public.marketing_user_state WHERE user_id=owner FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_user_active(owner) THEN RETURN false; END IF;
  IF NOT accepted THEN
    UPDATE public.marketing_user_state SET consent=false,consent_at=coalesce(consent_at,now()),
      context='{}',matching=NULL,matching_expires_at=NULL
      WHERE user_id=owner;
    UPDATE public.event_analytics SET delivery_status='cancelled',delivery_code='consent_withdrawn'
      WHERE (user_id=owner OR visitor_id=visitor) AND delivery_status='pending';
    DELETE FROM public.marketing_delivery_queue WHERE event_id IN (
      SELECT id FROM public.event_analytics WHERE (user_id=owner OR visitor_id=visitor) AND delivery_status='cancelled');
    RETURN false;
  END IF;
  -- A heartbeat from another tab/device must not undo account-level withdrawal.
  IF NOT s.consent AND NOT explicit_choice AND s.consent_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.marketing_user_state SET consent=true,
    consent_at=CASE WHEN NOT s.consent THEN accepted_at ELSE s.consent_at END,
    context=event_context,matching=match_data,matching_expires_at=now()+interval '7 days' WHERE user_id=owner;
  IF s.registered_at IS NOT NULL AND NOT 'signup_success'=ANY(s.milestones) THEN
    PERFORM public.marketing_milestone(owner,'signup_success',event_time=>s.registered_at);
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.marketing_blocked(owner uuid,feature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eligible boolean:=false; q public.user_quotas;
BEGIN
  IF NOT public.lifecycle_user_active(owner) THEN RETURN; END IF;
  IF feature='cheques' THEN
    eligible:=NOT EXISTS(SELECT 1 FROM public.user_entitlements WHERE user_id=owner
      AND feature_id='lifetime_premium' AND status IN ('active','trialing')
      AND (valid_until IS NULL OR valid_until>now()))
      AND public.count_active_cheques(owner,public.free_plan_cheque_limit())>=public.free_plan_cheque_limit();
  ELSIF feature IN ('ai_scan','voice_reminder') THEN
    SELECT * INTO q FROM public.user_quotas WHERE user_id=owner AND feature_id::text=feature;
    eligible:=FOUND AND (q.used>=q."limit" OR q.reset_at<=now())
      AND NOT EXISTS(SELECT 1 FROM public.transactions t JOIN public.payment_products p ON p.id=t.product_id
        WHERE t.user_id=owner AND t.status='captured' AND p.quota_feature_id::text=feature);
  ELSIF feature='trial_expired' THEN
    eligible:=EXISTS(SELECT 1 FROM public.user_entitlements WHERE user_id=owner
      AND feature_id='lifetime_premium' AND status='trialing'
      AND valid_until<=now()) AND NOT EXISTS(SELECT 1 FROM public.user_entitlements
        WHERE user_id=owner AND feature_id='lifetime_premium' AND status='active'
          AND (valid_until IS NULL OR valid_until>now()));
  END IF;
  IF eligible THEN PERFORM public.marketing_milestone(owner,'free_limit_completed',jsonb_build_object('feature',feature)); END IF;
END $$;

CREATE FUNCTION public.marketing_profile_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.marketing_user_state WHERE user_id=NEW.user_id
    AND 'onboarding_started'=ANY(milestones) AND NOT 'onboarding_completed'=ANY(milestones))
    AND EXISTS(SELECT 1 FROM public.businesses WHERE user_id=NEW.user_id AND deleted_at IS NULL) THEN
    PERFORM public.marketing_milestone(NEW.user_id,'onboarding_completed');
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.marketing_user_state SET consent=false,consent_at=coalesce(consent_at,now()),
      context='{}',matching=NULL,matching_expires_at=NULL
      WHERE user_id=NEW.user_id;
    UPDATE public.event_analytics SET delivery_status='cancelled',delivery_code='account_deactivated'
      WHERE user_id=NEW.user_id AND delivery_status='pending';
    DELETE FROM public.marketing_delivery_queue WHERE event_id IN (
      SELECT id FROM public.event_analytics WHERE user_id=NEW.user_id AND delivery_status='cancelled');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_profile_transition AFTER UPDATE OF currency,date_format,time_format,time_zone,
  language,reminders_per_day,default_reminder_days,deleted_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.marketing_profile_transition();

ALTER FUNCTION public.admit_notification_delivery(uuid,uuid,text) RENAME TO admit_notification_delivery_without_marketing;
REVOKE ALL ON FUNCTION public.admit_notification_delivery_without_marketing(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admit_notification_delivery(requested_job uuid,requested_token uuid,requested_recipient text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; owner uuid;
BEGIN
  result:=public.admit_notification_delivery_without_marketing(requested_job,requested_token,requested_recipient);
  IF result->>'status'='quota_exhausted' THEN
    SELECT user_id INTO owner FROM public.notification_jobs WHERE id=requested_job;
    PERFORM public.marketing_blocked(owner,'voice_reminder');
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admit_notification_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_notification_delivery(uuid,uuid,text) TO service_role;

-- A false quota result commits, unlike a raised exception. Keep analytics in that transaction.
ALTER FUNCTION public.consume_user_quota(public.feature_type) RENAME TO consume_user_quota_without_marketing;
REVOKE ALL ON FUNCTION public.consume_user_quota_without_marketing(public.feature_type) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.consume_user_quota(requested_feature public.feature_type) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE allowed boolean;
BEGIN
  allowed:=public.consume_user_quota_without_marketing(requested_feature);
  IF NOT allowed THEN PERFORM public.marketing_blocked(auth.uid(),requested_feature::text); END IF;
  RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.consume_user_quota(public.feature_type) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_user_quota(public.feature_type) TO authenticated;

CREATE FUNCTION public.marketing_onboarding(owner uuid,completed boolean,tracking_allowed boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.lifecycle_user_active(owner) THEN RETURN; END IF;
  IF completed THEN
    IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE user_id=owner AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Onboarding setup not saved' USING ERRCODE='22023';
    END IF;
    IF tracking_allowed THEN PERFORM public.marketing_milestone(owner,'onboarding_completed');
    ELSE UPDATE public.marketing_user_state SET milestones=array_append(milestones,'onboarding_completed')
      WHERE user_id=owner AND NOT 'onboarding_completed'=ANY(milestones); END IF;
  ELSE
    IF tracking_allowed THEN PERFORM public.marketing_milestone(owner,'onboarding_started');
    ELSE UPDATE public.marketing_user_state SET milestones=array_append(milestones,'onboarding_started')
      WHERE user_id=owner AND NOT 'onboarding_started'=ANY(milestones); END IF;
  END IF;
END $$;

CREATE FUNCTION public.marketing_claim_delivery(batch_size integer DEFAULT 25)
RETURNS TABLE(event_id uuid,lease_token uuid,payload jsonb,mode text,owner uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT (SELECT enabled FROM public.marketing_configuration WHERE singleton) THEN RETURN; END IF;
  RETURN QUERY WITH claimed AS (
    UPDATE public.marketing_delivery_queue q SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    WHERE q.event_id IN (
      SELECT pending.event_id FROM public.marketing_delivery_queue pending
      JOIN public.event_analytics e ON e.id=pending.event_id
      LEFT JOIN public.marketing_user_state s ON s.user_id=e.user_id
      WHERE pending.available_at<=now() AND pending.expires_at>now()
        AND (pending.lease_until IS NULL OR pending.lease_until<=now())
        AND e.delivery_status='pending' AND (e.user_id IS NULL OR (s.consent AND public.lifecycle_user_active(e.user_id)))
      ORDER BY pending.available_at LIMIT least(greatest(batch_size,1),50) FOR UPDATE OF pending SKIP LOCKED
    ) RETURNING q.*
  ) SELECT e.id,c.lease_token,jsonb_build_object(
    'event_id',e.id,'event_name',e.meta_event_name,'event_time',floor(extract(epoch FROM e.occurred_at)),
    'action_source','website','event_source_url',e.context->>'source_url','user_data',c.matching,
    'custom_data',e.details || jsonb_build_object('event_category',e.event_name) ||
      CASE WHEN e.details ? 'amount_paise' THEN jsonb_build_object(
        'value',(e.details->>'amount_paise')::numeric/100,'currency',e.details->>'currency',
        'content_type','product','content_ids',jsonb_build_array(e.details->>'product_id'))
      ELSE '{}'::jsonb END),e.mode,e.user_id
    FROM claimed c JOIN public.event_analytics e ON e.id=c.event_id;
END $$;

CREATE FUNCTION public.marketing_browser_events(
  owner uuid,visitor uuid,session uuid,route text,event_context jsonb,match_data jsonb,
  claim_browser boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event text; result jsonb;
BEGIN
  event:=CASE route WHEN '/' THEN 'landing_page_view' WHEN '/signup' THEN 'signup_page_view' END;
  IF event IS NOT NULL AND visitor IS NOT NULL AND session IS NOT NULL THEN
    PERFORM public.marketing_emit(owner,event,visitor::text||':'||session::text||':'||event,
      anonymous_context=>event_context,anonymous_matching=>match_data,visitor=>visitor,session=>session);
  END IF;
  IF owner IS NOT NULL AND route='/onboarding' THEN PERFORM public.marketing_onboarding(owner,false); END IF;
  IF NOT claim_browser THEN RETURN '[]'::jsonb; END IF;
  WITH claimed AS (
    UPDATE public.event_analytics SET browser_claimed_at=now() WHERE id IN (
      SELECT id FROM public.event_analytics WHERE browser_claimed_at IS NULL
        AND occurred_at>now()-interval '1 day' AND mode='live'
        AND delivery_status<>'cancelled'
        AND ((owner IS NOT NULL AND user_id=owner) OR (user_id IS NULL AND visitor_id=visitor))
      ORDER BY occurred_at LIMIT 25 FOR UPDATE SKIP LOCKED
    ) RETURNING id,event_name,meta_event_name,details
  ) SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]') INTO result FROM claimed;
  RETURN result;
END $$;

CREATE FUNCTION public.marketing_settle_delivery(event uuid,token uuid,outcome text,result_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE attempts integer;
BEGIN
  PERFORM 1 FROM public.event_analytics WHERE id=event FOR UPDATE;
  PERFORM 1 FROM public.marketing_delivery_queue WHERE event_id=event AND lease_token=token
    AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketing lease lost' USING ERRCODE='55000'; END IF;
  IF outcome NOT IN ('delivered','failed','retry') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
  UPDATE public.event_analytics SET delivery_attempts=delivery_attempts+1,
    delivery_status=CASE WHEN outcome='retry' AND delivery_attempts<19 THEN 'pending'
      WHEN outcome='retry' THEN 'failed' ELSE outcome END,
    delivery_code=left(result_code,80),delivered_at=CASE WHEN outcome='delivered' THEN now() END
    WHERE id=event RETURNING delivery_attempts INTO attempts;
  IF outcome<>'retry' OR attempts>=20 THEN
    DELETE FROM public.marketing_delivery_queue WHERE event_id=event;
  ELSE
    UPDATE public.marketing_delivery_queue SET lease_token=NULL,lease_until=NULL,
      available_at=now()+make_interval(secs=>least(21600,30*power(2,least(attempts,10))::integer))
      WHERE event_id=event;
  END IF;
END $$;

CREATE FUNCTION public.marketing_delivery_valid(event uuid,token uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.marketing_delivery_queue q
    JOIN public.event_analytics e ON e.id=q.event_id
    LEFT JOIN public.marketing_user_state s ON s.user_id=e.user_id
    WHERE q.event_id=event AND q.lease_token=token AND q.lease_until>now() AND q.expires_at>now()
      AND e.delivery_status='pending'
      AND (SELECT enabled FROM public.marketing_configuration WHERE singleton)
      AND (e.user_id IS NULL OR (s.consent AND public.lifecycle_user_active(e.user_id))));
$$;

CREATE VIEW public.event_analytics_daily_live WITH (security_invoker=true) AS
WITH categorized AS (
SELECT *, (occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
  jsonb_build_object('first_source',context#>>'{first_touch,utm_source}',
    'first_campaign',context#>>'{first_touch,utm_campaign}',
    'last_source',context#>>'{last_touch,utm_source}','last_campaign',context#>>'{last_touch,utm_campaign}',
    'product_type',details->>'product_type','product_id',details->>'product_id',
    'currency',details->>'currency') AS dimensions
FROM public.event_analytics
)
SELECT day,event_name,mode,CASE WHEN grouping(dimensions)=1 THEN '{}'::jsonb ELSE dimensions END AS dimensions,
  count(*) AS event_count,count(DISTINCT user_id) AS unique_users,
  count(DISTINCT visitor_id) FILTER (WHERE user_id IS NULL) AS unique_anonymous_visitors,
  coalesce(sum((details->>'amount_paise')::bigint) FILTER (WHERE meta_event_name='Purchase'),0)::bigint AS revenue_paise,
  count(*) FILTER (WHERE delivery_status='delivered') AS delivered,
  count(*) FILTER (WHERE delivery_status='failed') AS failed,
  count(*) FILTER (WHERE delivery_status='pending') AS pending,
  count(*) FILTER (WHERE delivery_status='cancelled') AS cancelled
FROM categorized GROUP BY GROUPING SETS ((day,event_name,mode,dimensions),(day,event_name,mode));
CREATE VIEW public.event_analytics_daily WITH (security_invoker=true) AS
SELECT * FROM public.event_analytics_daily_totals WHERE day < (now() AT TIME ZONE 'Asia/Kolkata')::date-8
UNION ALL SELECT * FROM public.event_analytics_daily_live WHERE day >= (now() AT TIME ZONE 'Asia/Kolkata')::date-8;
REVOKE ALL ON public.event_analytics_daily,public.event_analytics_daily_live FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.event_analytics_daily,public.event_analytics_daily_live TO service_role;

CREATE FUNCTION public.marketing_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.event_analytics e SET delivery_status='failed',delivery_code='delivery_expired'
    FROM public.marketing_delivery_queue q WHERE q.event_id=e.id AND q.expires_at<=now() AND e.delivery_status='pending';
  DELETE FROM public.marketing_delivery_queue WHERE expires_at<=now();
  DELETE FROM public.marketing_ingress_windows WHERE window_started_at<now()-interval '2 hours';
  UPDATE public.marketing_user_state SET matching=NULL,matching_expires_at=NULL
    WHERE matching_expires_at<=now();
  UPDATE public.marketing_user_state SET context=jsonb_build_object('source_url',context->>'source_url')
    WHERE (context->>'attribution_expires_at')::timestamptz<=now();
  UPDATE public.marketing_configuration SET aggregated_at=now() WHERE singleton AND
    (aggregated_at IS NULL OR (aggregated_at AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.event_analytics_daily_totals SELECT * FROM public.event_analytics_daily_live
  ON CONFLICT(day,event_name,mode,dimensions) DO UPDATE SET
    event_count=EXCLUDED.event_count,unique_users=EXCLUDED.unique_users,
    unique_anonymous_visitors=EXCLUDED.unique_anonymous_visitors,revenue_paise=EXCLUDED.revenue_paise,
    delivered=EXCLUDED.delivered,failed=EXCLUDED.failed,pending=EXCLUDED.pending,cancelled=EXCLUDED.cancelled;
  DELETE FROM public.event_analytics WHERE occurred_at<now()-interval '90 days';
  DELETE FROM public.event_analytics_daily_totals WHERE day<((now() AT TIME ZONE 'Asia/Kolkata')-interval '13 months')::date;
END $$;

CREATE FUNCTION public.marketing_erase_user(owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  DELETE FROM public.event_analytics WHERE user_id=owner;
  UPDATE public.marketing_user_state SET consent=false,consent_at=coalesce(consent_at,now()),
    context='{}',matching=NULL,matching_expires_at=NULL
    WHERE user_id=owner;
END $$;

-- All ingress is validated by server routes. No browser can write events or matching data directly.
DO $$ DECLARE routine regprocedure; BEGIN
  FOR routine IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname LIKE 'marketing_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',routine);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine);
  END LOOP;
END $$;
