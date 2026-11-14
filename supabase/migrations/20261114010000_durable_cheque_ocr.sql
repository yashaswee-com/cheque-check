-- Acceptance is durable; the original deadline includes dispatch and commit time.
CREATE TABLE public.cheque_scan_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  auto_charge_enabled boolean NOT NULL DEFAULT false,
  max_in_flight integer NOT NULL DEFAULT 10 CHECK (max_in_flight BETWEEN 1 AND 1000),
  daily_scan_limit integer NOT NULL DEFAULT 1000 CHECK (daily_scan_limit > 0),
  daily_spend_limit_micros bigint NOT NULL DEFAULT 0 CHECK (daily_spend_limit_micros >= 0),
  scan_cost_ceiling_micros bigint NOT NULL DEFAULT 100000 CHECK (scan_cost_ceiling_micros > 0)
);
INSERT INTO public.cheque_scan_config DEFAULT VALUES;

CREATE TABLE public.cheque_scan_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  version text NOT NULL CHECK (version = '2026-11-14'),
  acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.user_quotas ADD COLUMN quota_period uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION public.rotate_scan_quota_period() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.reset_at IS DISTINCT FROM OLD.reset_at OR
    (NEW.used < OLD.used AND current_setting('cheque_scan.releasing',true) IS DISTINCT FROM 'yes') THEN
    NEW.quota_period := gen_random_uuid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rotate_scan_quota_period BEFORE UPDATE ON public.user_quotas
FOR EACH ROW EXECUTE FUNCTION public.rotate_scan_quota_period();

CREATE TABLE public.cheque_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  draft_id uuid NOT NULL REFERENCES public.cheques(id),
  image_url text NOT NULL,
  request_key uuid NOT NULL,
  consent_version text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('Inward','Outward')),
  request_mode text NOT NULL CHECK (request_mode IN ('Inward','Outward')),
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN
    ('accepted','processing','ready_high','ready_partial','accepted_partial','unusable',
     'failed','timed_out','cancelled','superseded','expired_review')),
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'cheque-front-v2',
  schema_version text NOT NULL DEFAULT 'cheque-fields-v2',
  matching_version text NOT NULL DEFAULT 'exact-bank-v1',
  product_id text NOT NULL,
  auto_charge_enabled boolean NOT NULL,
  details jsonb,
  reliability jsonb,
  error_code text,
  claim_token uuid,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '7 seconds',
  review_expires_at timestamptz,
  finished_at timestamptz,
  spend_day date NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC')::date,
  cost_ceiling_micros bigint NOT NULL,
  UNIQUE(user_id,request_key)
);
CREATE INDEX cheque_scan_owner_image ON public.cheque_scan_jobs(user_id,image_url,created_at DESC,id);
CREATE INDEX cheque_scan_pending ON public.cheque_scan_jobs(deadline_at)
  WHERE status IN ('accepted','processing');
CREATE INDEX cheque_scan_review ON public.cheque_scan_jobs(review_expires_at)
  WHERE status = 'ready_partial';
CREATE INDEX cheque_scan_daily ON public.cheque_scan_jobs(spend_day);
CREATE UNIQUE INDEX cheque_scan_one_processing ON public.cheque_scan_jobs(user_id)
  WHERE status IN ('accepted','processing');

CREATE TABLE public.cheque_scan_credits (
  -- Retained independently of expiring operational jobs to fence old request keys.
  job_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  request_key uuid NOT NULL,
  quota_period uuid NOT NULL,
  quota_reset_at timestamptz,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','charged','released')),
  settled_at timestamptz,
  UNIQUE(user_id,request_key)
);
CREATE TABLE public.cheque_scan_daily_budget (
  day date PRIMARY KEY,
  scans integer NOT NULL DEFAULT 0,
  committed_micros bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.cheque_scan_party_banks (
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  account_number text NOT NULL,
  ifsc_code text NOT NULL,
  confirmed_by uuid NOT NULL REFERENCES auth.users(id),
  source_job uuid REFERENCES public.cheque_scan_jobs(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(business_id,party_id,account_number,ifsc_code)
);
CREATE INDEX cheque_scan_party_identity ON public.cheque_scan_party_banks(business_id,account_number,ifsc_code);
CREATE TABLE public.cheque_scan_entity_intents (
  job_id uuid NOT NULL REFERENCES public.cheque_scan_jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('party','account')),
  entity_id uuid NOT NULL,
  bank_id uuid,
  contact text,
  PRIMARY KEY(job_id,kind)
);

ALTER TABLE public.cheque_scan_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_daily_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_party_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_scan_entity_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cheque_scan_config,public.cheque_scan_consents,public.cheque_scan_jobs,
  public.cheque_scan_credits,public.cheque_scan_daily_budget,public.cheque_scan_party_banks,
  public.cheque_scan_entity_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cheque_scan_config,public.cheque_scan_consents,public.cheque_scan_jobs,
  public.cheque_scan_credits,public.cheque_scan_daily_budget,public.cheque_scan_party_banks,
  public.cheque_scan_entity_intents TO service_role;
-- Full bank identity is intentionally RPC-only, not exposed by a SELECT policy.

CREATE FUNCTION public.scan_job_json(requested_job uuid, worker boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (to_jsonb(j) - 'request_key' - 'consent_version' - 'cost_ceiling_micros' - 'spend_day'
    - 'claim_token' - 'request_mode') || jsonb_build_object('credit_state',c.state) ||
    CASE WHEN worker THEN jsonb_build_object('claim_token',j.claim_token) ELSE '{}'::jsonb END
  FROM public.cheque_scan_jobs j JOIN public.cheque_scan_credits c ON c.job_id=j.id
  WHERE j.id=requested_job
$$;

CREATE FUNCTION public.settle_scan_credit(requested_job uuid, requested_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.cheque_scan_credits; prior text;
BEGIN
  IF requested_state NOT IN ('charged','released') THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  UPDATE public.cheque_scan_credits SET state=requested_state,settled_at=clock_timestamp()
    WHERE job_id=requested_job AND state='reserved' RETURNING * INTO c;
  IF NOT FOUND OR requested_state='charged' THEN RETURN; END IF;
  prior := current_setting('cheque_scan.releasing',true);
  PERFORM set_config('cheque_scan.releasing','yes',true);
  UPDATE public.user_quotas SET used=greatest(used-1,0),updated_at=clock_timestamp()
    WHERE user_id=c.user_id AND feature_id='ai_scan' AND quota_period=c.quota_period
      AND reset_at IS NOT DISTINCT FROM c.quota_reset_at;
  PERFORM set_config('cheque_scan.releasing',coalesce(prior,''),true);
END $$;

CREATE FUNCTION public.reconcile_cheque_scans(requested_user uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs; next_status text; total integer := 0;
BEGIN
  FOR j IN SELECT q.* FROM public.cheque_scan_jobs q
    WHERE (requested_user IS NULL OR q.user_id=requested_user)
      AND q.status IN ('accepted','processing','ready_partial')
      AND (q.deadline_at<=clock_timestamp() AND q.status IN ('accepted','processing')
        OR q.review_expires_at<=clock_timestamp()
        OR NOT public.lifecycle_user_active(q.user_id)
        OR NOT EXISTS (SELECT 1 FROM public.cheques c JOIN public.businesses b ON b.id=c.business_id
          WHERE c.id=q.draft_id AND c.business_id=q.business_id AND b.user_id=q.user_id
            AND c.is_draft AND c.deleted_at IS NULL AND b.deleted_at IS NULL AND c.image_url=q.image_url)
        OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=q.user_id AND p.ai_scan_enabled))
      OR (q.status IN ('accepted','processing') AND (requested_user IS NULL OR q.user_id=requested_user)
        AND NOT (SELECT enabled FROM public.cheque_scan_config WHERE singleton))
    ORDER BY q.id FOR UPDATE SKIP LOCKED
    LIMIT CASE WHEN requested_user IS NULL THEN 500 ELSE 2147483647 END
  LOOP
    next_status := CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.cheques c JOIN public.businesses b ON b.id=c.business_id
        WHERE c.id=j.draft_id AND c.business_id=j.business_id AND b.user_id=j.user_id
          AND c.is_draft AND c.deleted_at IS NULL AND b.deleted_at IS NULL AND c.image_url=j.image_url)
        THEN 'superseded'
      WHEN NOT public.lifecycle_user_active(j.user_id) OR NOT EXISTS
        (SELECT 1 FROM public.profiles p WHERE p.user_id=j.user_id AND p.ai_scan_enabled)
        OR j.status IN ('accepted','processing') AND NOT
          (SELECT enabled FROM public.cheque_scan_config WHERE singleton) THEN 'cancelled'
      WHEN j.status='ready_partial' THEN 'expired_review'
      ELSE 'timed_out' END;
    UPDATE public.cheque_scan_jobs SET status=next_status,error_code=next_status,
      claim_token=NULL,finished_at=clock_timestamp() WHERE id=j.id;
    PERFORM public.settle_scan_credit(j.id,'released');
    total := total+1;
  END LOOP;
  RETURN total;
END $$;

CREATE FUNCTION public.acknowledge_cheque_scan_consent(requested_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF requested_version IS DISTINCT FROM '2026-11-14' THEN
    RAISE EXCEPTION 'CONSENT_REQUIRED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.cheque_scan_consents(user_id,version) VALUES(auth.uid(),requested_version)
    ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version,acknowledged_at=clock_timestamp();
  RETURN jsonb_build_object('version',requested_version,'acknowledged',true);
END $$;

CREATE FUNCTION public.begin_cheque_scan(requested_image text,requested_key uuid,
  requested_consent text,requested_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs; c public.cheques; cfg public.cheque_scan_config;
  q public.user_quotas; policy record; accepted_at timestamptz; budget public.cheque_scan_daily_budget;
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF requested_key IS NULL OR requested_mode IS NULL OR requested_mode NOT IN ('Inward','Outward')
    OR requested_consent IS DISTINCT FROM '2026-11-14'
    OR requested_image IS NULL OR length(requested_image)>1024
    OR requested_image !~ ('^/api/storage/private-cheque-images/' || auth.uid()::text || '/[A-Za-z0-9._/-]+$')
    OR requested_image ~ '(^|/)\.\.?(/|$)' THEN
    RAISE EXCEPTION 'Invalid scan request' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cheque-scan:'||auth.uid()::text,0));
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE user_id=auth.uid() AND request_key=requested_key;
  IF FOUND THEN
    IF j.image_url<>requested_image OR j.request_mode<>requested_mode OR j.consent_version<>requested_consent THEN
      RAISE EXCEPTION 'Conflicting scan request' USING ERRCODE='22023'; END IF;
    RETURN public.scan_job_json(j.id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.cheque_scan_credits WHERE user_id=auth.uid() AND request_key=requested_key) THEN
    -- Results have passed retention; never accept an old logical request again.
    RAISE EXCEPTION 'SCAN_NOT_READY' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cheque_scan_consents WHERE user_id=auth.uid() AND version=requested_consent) THEN
    RAISE EXCEPTION 'CONSENT_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND ai_scan_enabled AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'AI_SCAN_DISABLED' USING ERRCODE='42501'; END IF;
  SELECT x.* INTO c FROM public.cheques x JOIN public.businesses b ON b.id=x.business_id
    WHERE x.image_url=requested_image AND x.is_draft AND x.deleted_at IS NULL
      AND b.user_id=auth.uid() AND b.deleted_at IS NULL ORDER BY x.created_at DESC,x.id LIMIT 1 FOR UPDATE OF x;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT * INTO policy FROM public.resolve_ai_scan_model();
  IF policy.model IS NULL THEN RAISE EXCEPTION 'No eligible AI model policy configured' USING ERRCODE='P0002'; END IF;
  SELECT * INTO cfg FROM public.cheque_scan_config WHERE singleton FOR UPDATE;
  IF NOT cfg.enabled THEN RAISE EXCEPTION 'SCAN_DISABLED' USING ERRCODE='55000'; END IF;
  IF EXISTS (SELECT 1 FROM public.cheque_scan_jobs WHERE user_id=auth.uid() AND status IN ('accepted','processing'))
    OR (SELECT count(*) FROM public.cheque_scan_jobs WHERE status IN ('accepted','processing')
      AND deadline_at>clock_timestamp()) >= cfg.max_in_flight THEN
    RAISE EXCEPTION 'SCAN_BUSY' USING ERRCODE='53300'; END IF;
  accepted_at := clock_timestamp();
  INSERT INTO public.cheque_scan_daily_budget(day) VALUES((accepted_at AT TIME ZONE 'UTC')::date)
    ON CONFLICT DO NOTHING;
  SELECT * INTO budget FROM public.cheque_scan_daily_budget WHERE day=(accepted_at AT TIME ZONE 'UTC')::date FOR UPDATE;
  IF budget.scans>=cfg.daily_scan_limit OR
    budget.committed_micros+cfg.scan_cost_ceiling_micros>cfg.daily_spend_limit_micros THEN
    RAISE EXCEPTION 'SCAN_BUSY' USING ERRCODE='53300'; END IF;
  IF NOT public.consume_api_rate_limit('durable-ocr',10,60) THEN
    RAISE EXCEPTION 'SCAN_BUSY' USING ERRCODE='53300'; END IF;
  UPDATE public.user_quotas SET used=used+1,updated_at=accepted_at
    WHERE user_id=auth.uid() AND feature_id='ai_scan' AND used<"limit"
      AND (reset_at IS NULL OR reset_at>accepted_at) RETURNING * INTO q;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTA_EXHAUSTED' USING ERRCODE='53400'; END IF;
  INSERT INTO public.cheque_scan_jobs(user_id,business_id,draft_id,image_url,request_key,consent_version,
    mode,request_mode,model,product_id,auto_charge_enabled,created_at,deadline_at,cost_ceiling_micros,spend_day)
    VALUES(auth.uid(),c.business_id,c.id,requested_image,requested_key,requested_consent,
      requested_mode,requested_mode,policy.model,policy.product_id,cfg.auto_charge_enabled,accepted_at,
      accepted_at+interval '7 seconds',cfg.scan_cost_ceiling_micros,(accepted_at AT TIME ZONE 'UTC')::date)
    RETURNING * INTO j;
  INSERT INTO public.cheque_scan_credits(job_id,user_id,request_key,quota_period,quota_reset_at)
    VALUES(j.id,j.user_id,j.request_key,q.quota_period,q.reset_at);
  -- Conservatively retain provider spend even after cancellation/timeout.
  UPDATE public.cheque_scan_daily_budget SET scans=scans+1,
    committed_micros=committed_micros+cfg.scan_cost_ceiling_micros WHERE day=j.spend_day;
  RETURN public.scan_job_json(j.id);
END $$;

CREATE FUNCTION public.read_cheque_scan(requested_image text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cheque-scan:'||auth.uid()::text,0));
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT public.scan_job_json(j.id) INTO result FROM public.cheque_scan_jobs j
    JOIN public.cheques c ON c.id=j.draft_id JOIN public.businesses b ON b.id=j.business_id
    WHERE j.user_id=auth.uid() AND j.image_url=requested_image AND b.user_id=auth.uid()
      AND b.deleted_at IS NULL AND c.deleted_at IS NULL
    ORDER BY j.created_at DESC,j.id DESC LIMIT 1;
  RETURN result;
END $$;

CREATE FUNCTION public.mutate_cheque_scan(requested_job uuid,requested_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF requested_action IS NULL OR requested_action NOT IN ('accept','cancel') THEN
    RAISE EXCEPTION 'Invalid scan action' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cheque-scan:'||auth.uid()::text,0));
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id) THEN
    RAISE EXCEPTION 'Scan unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id FOR UPDATE;
  PERFORM 1 FROM public.businesses WHERE id=j.business_id FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE user_id=j.user_id FOR UPDATE;
  PERFORM 1 FROM public.cheque_scan_credits WHERE job_id=j.id FOR UPDATE;
  PERFORM 1 FROM public.user_quotas WHERE user_id=j.user_id AND feature_id='ai_scan' FOR UPDATE;
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job;
  IF requested_action='accept' AND j.status='ready_partial' AND j.review_expires_at>clock_timestamp() THEN
    UPDATE public.cheque_scan_jobs SET status='accepted_partial' WHERE id=j.id;
    PERFORM public.settle_scan_credit(j.id,'charged');
  ELSIF requested_action='cancel' AND j.status IN ('accepted','processing','ready_partial') THEN
    UPDATE public.cheque_scan_jobs SET status='cancelled',claim_token=NULL,finished_at=clock_timestamp() WHERE id=j.id;
    PERFORM public.settle_scan_credit(j.id,'released');
  END IF;
  RETURN public.scan_job_json(j.id);
END $$;

CREATE FUNCTION public.claim_cheque_scan(requested_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  PERFORM public.reconcile_cheque_scans();
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR j.status<>'accepted' OR j.deadline_at<=clock_timestamp() THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id FOR UPDATE;
  PERFORM 1 FROM public.businesses WHERE id=j.business_id FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE user_id=j.user_id FOR UPDATE;
  PERFORM public.reconcile_cheque_scans(j.user_id);
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job;
  IF j.status<>'accepted' THEN RETURN NULL; END IF;
  -- A claimed attempt is never reclaimed: provider execution may already have begun.
  UPDATE public.cheque_scan_jobs SET status='processing',claim_token=gen_random_uuid(),attempts=attempts+1
    WHERE id=j.id RETURNING * INTO j;
  RETURN public.scan_job_json(j.id,true);
END $$;

CREATE FUNCTION public.continue_cheque_scan(requested_job uuid,requested_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job FOR UPDATE;
  IF NOT FOUND OR j.status<>'processing' OR requested_token IS NULL
    OR j.claim_token IS DISTINCT FROM requested_token THEN RETURN false; END IF;
  PERFORM public.reconcile_cheque_scans(j.user_id);
  RETURN EXISTS (
    SELECT 1 FROM public.cheque_scan_jobs q
    JOIN public.cheques c ON c.id=q.draft_id AND c.business_id=q.business_id
    JOIN public.businesses b ON b.id=q.business_id AND b.user_id=q.user_id
    JOIN public.profiles p ON p.user_id=q.user_id
    JOIN public.cheque_scan_config cfg ON cfg.singleton
    WHERE q.id=requested_job AND q.status='processing' AND q.claim_token=requested_token
      AND q.deadline_at>clock_timestamp() AND cfg.enabled
      AND p.deleted_at IS NULL AND p.ai_scan_enabled
      AND c.is_draft AND c.deleted_at IS NULL AND c.image_url=q.image_url
      AND b.deleted_at IS NULL
  );
END $$;

CREATE FUNCTION public.finish_cheque_scan(requested_job uuid,requested_token uuid,requested_status text,
  requested_details jsonb DEFAULT NULL,requested_reliability jsonb DEFAULT NULL,requested_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs; field text; useful boolean := false; all_high boolean := true;
  final_status text := requested_status; value text;
BEGIN
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF j.status<>'processing' OR j.claim_token IS DISTINCT FROM requested_token OR requested_token IS NULL THEN
    RETURN public.scan_job_json(j.id);
  END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id FOR UPDATE;
  PERFORM 1 FROM public.businesses WHERE id=j.business_id FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE user_id=j.user_id FOR UPDATE;
  PERFORM public.reconcile_cheque_scans(j.user_id);
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job;
  IF j.status<>'processing' THEN RETURN public.scan_job_json(j.id); END IF;
  IF requested_status IS NULL OR requested_status NOT IN ('ready_high','ready_partial','unusable','failed','timed_out') THEN
    RAISE EXCEPTION 'Invalid worker outcome' USING ERRCODE='22023'; END IF;
  IF requested_status IN ('ready_high','ready_partial') THEN
    IF jsonb_typeof(requested_details) IS DISTINCT FROM 'object'
      OR jsonb_typeof(requested_reliability) IS DISTINCT FROM 'object'
      OR octet_length(requested_details::text)>8192 OR octet_length(requested_reliability::text)>8192 THEN
      RAISE EXCEPTION 'Invalid scan result' USING ERRCODE='22023'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(requested_details))<>8
      OR (SELECT count(*) FROM jsonb_object_keys(requested_reliability))<>8 THEN
      RAISE EXCEPTION 'Invalid scan result' USING ERRCODE='22023'; END IF;
    FOR field,value IN SELECT key,val::text FROM jsonb_each(requested_details) AS e(key,val) LOOP
      IF field NOT IN ('amount','cheque_number','cheque_date','payee_name','account_number','account_name','ifsc_code','bank_name')
        OR length(value)>202 THEN RAISE EXCEPTION 'Invalid scan field' USING ERRCODE='22023'; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['amount','cheque_number','cheque_date','payee_name','account_number','account_name','ifsc_code','bank_name'] LOOP
      IF NOT requested_details ? field OR NOT requested_reliability ? field
        OR jsonb_typeof(requested_details->field) NOT IN
          ('null',CASE WHEN field='amount' THEN 'number' ELSE 'string' END)
        OR requested_details->>field ~ '[[:cntrl:]<>]'
        OR jsonb_typeof(requested_reliability->field) IS DISTINCT FROM 'object'
        OR requested_reliability->field->>'level' IS NULL
        OR requested_reliability->field->>'level' NOT IN ('high','needs_review','unusable')
        OR requested_reliability->field->>'reason' IS NULL
        OR requested_reliability->field->>'reason' NOT IN ('clear','missing','invalid','uncertain') THEN
        RAISE EXCEPTION 'Invalid scan field' USING ERRCODE='22023'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(requested_reliability->field))<>2
        OR jsonb_typeof(requested_reliability->field->'level') IS DISTINCT FROM 'string'
        OR jsonb_typeof(requested_reliability->field->'reason') IS DISTINCT FROM 'string'
        OR requested_details->>field IS NULL AND requested_reliability->field->>'level'<>'unusable'
        OR requested_reliability->field->>'level'='high'
          AND requested_reliability->field->>'reason'<>'clear' THEN
        RAISE EXCEPTION 'Invalid scan reliability' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF requested_details->>'cheque_number' IS NOT NULL AND requested_details->>'cheque_number' !~ '^[0-9]{6}$'
      OR requested_details->>'account_number' IS NOT NULL AND requested_details->>'account_number' !~ '^[0-9]{6,34}$'
      OR requested_details->>'ifsc_code' IS NOT NULL AND requested_details->>'ifsc_code' !~ '^[A-Z]{4}0[A-Z0-9]{6}$'
      THEN RAISE EXCEPTION 'Invalid scan identity' USING ERRCODE='22023'; END IF;
    IF requested_details->>'amount' IS NOT NULL THEN
      IF jsonb_typeof(requested_details->'amount')<>'number' OR
        (requested_details->>'amount')::numeric<=0 OR (requested_details->>'amount')::numeric>90071992547409.91
        OR round((requested_details->>'amount')::numeric,2)<>(requested_details->>'amount')::numeric THEN
        RAISE EXCEPTION 'Invalid scan amount' USING ERRCODE='22023'; END IF;
    END IF;
    IF requested_details->>'cheque_date' IS NOT NULL THEN
      value := requested_details->>'cheque_date';
      IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (value::date)::text<>value THEN
        RAISE EXCEPTION 'Invalid scan date' USING ERRCODE='22023'; END IF;
    END IF;
    FOREACH field IN ARRAY ARRAY['amount','cheque_number','cheque_date'] LOOP
      IF requested_reliability->field->>'level' IS NULL OR
        requested_reliability->field->>'level' NOT IN ('high','needs_review','unusable')
        OR coalesce(length(requested_reliability->field->>'reason'),0) NOT BETWEEN 1 AND 64 THEN
        RAISE EXCEPTION 'Invalid scan reliability' USING ERRCODE='22023'; END IF;
      useful := useful OR (requested_details->>field IS NOT NULL
        AND requested_reliability->field->>'level' IN ('high','needs_review')
        AND requested_reliability->field->>'reason'='clear');
      all_high := all_high AND requested_details->>field IS NOT NULL AND requested_reliability->field->>'level'='high';
    END LOOP;
    IF NOT useful THEN final_status:='unusable';
    ELSIF requested_status='ready_high' AND (NOT all_high OR NOT j.auto_charge_enabled
      OR NOT (SELECT auto_charge_enabled FROM public.cheque_scan_config WHERE singleton)) THEN final_status:='ready_partial';
    END IF;
  END IF;
  -- Acquire accounting/config locks before the final clock check, not afterwards.
  PERFORM 1 FROM public.cheque_scan_config WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.cheque_scan_credits WHERE job_id=j.id FOR UPDATE;
  PERFORM 1 FROM public.user_quotas WHERE user_id=j.user_id AND feature_id='ai_scan' FOR UPDATE;
  IF final_status='ready_high' AND NOT
    (SELECT auto_charge_enabled FROM public.cheque_scan_config WHERE singleton) THEN final_status:='ready_partial'; END IF;
  -- Recheck after validation; transaction-start now() would allow late charges.
  IF j.deadline_at<=clock_timestamp() THEN
    final_status:='timed_out';
  END IF;
  UPDATE public.cheque_scan_jobs SET status=final_status,
    details=CASE WHEN final_status IN ('ready_high','ready_partial') THEN requested_details ELSE NULL END,
    reliability=CASE WHEN final_status IN ('ready_high','ready_partial') THEN requested_reliability ELSE NULL END,
    error_code=CASE WHEN final_status IN ('failed','unusable') THEN
      CASE WHEN requested_error ~ '^[a-z0-9_]{1,64}$' THEN requested_error ELSE final_status END
      WHEN final_status='timed_out' THEN final_status ELSE NULL END,
    finished_at=clock_timestamp(),claim_token=NULL,
    review_expires_at=CASE WHEN final_status='ready_partial' THEN clock_timestamp()+interval '24 hours' END
    WHERE id=j.id;
  IF final_status='ready_high' THEN PERFORM public.settle_scan_credit(j.id,'charged');
  ELSIF final_status<>'ready_partial' THEN PERFORM public.settle_scan_credit(j.id,'released'); END IF;
  RETURN public.scan_job_json(j.id);
END $$;

CREATE FUNCTION public.dispatch_cheque_scan(requested_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE project text; credential text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cheque_scan_jobs WHERE id=requested_job AND status='accepted'
    AND deadline_at>clock_timestamp()) THEN RETURN; END IF;
  SELECT decrypted_secret INTO project FROM vault.decrypted_secrets WHERE name='project_url';
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='service_role_key';
  IF project IS NULL OR credential IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=project||'/functions/v1/cheque-ocr',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
    body:=jsonb_build_object('job_id',requested_job),timeout_milliseconds:=7000);
EXCEPTION WHEN OTHERS THEN
  -- Dispatch failure leaves the committed job for recovery; never expose credentials.
  RETURN;
END $$;
CREATE FUNCTION public.dispatch_new_cheque_scan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.dispatch_cheque_scan(NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER dispatch_new_cheque_scan AFTER INSERT ON public.cheque_scan_jobs
FOR EACH ROW EXECUTE FUNCTION public.dispatch_new_cheque_scan();
CREATE FUNCTION public.recover_cheque_scans() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job uuid; total integer;
BEGIN
  total:=public.reconcile_cheque_scans();
  FOR job IN SELECT id FROM public.cheque_scan_jobs WHERE status='accepted'
    AND deadline_at>clock_timestamp() ORDER BY deadline_at LIMIT 100
  LOOP PERFORM public.dispatch_cheque_scan(job); END LOOP;
  PERFORM public.cleanup_cheque_scans();
  RETURN total;
END $$;
SELECT cron.schedule('cheque-ocr-recovery','* * * * *','SELECT public.recover_cheque_scans()');

CREATE FUNCTION public.scan_normalized_name(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT left(lower(regexp_replace(normalize(left(value,240),NFC),'[[:space:][:punct:]]','','g')),80)
$$;
CREATE FUNCTION public.scan_name_similarity(first_name text,second_name text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE a text:=public.scan_normalized_name(first_name); b text:=public.scan_normalized_name(second_name);
  previous integer[]; current_row integer[]; i integer; k integer; n integer; m integer;
BEGIN
  n:=coalesce(length(a),0); m:=coalesce(length(b),0);
  IF n=0 OR m=0 OR abs(n-m)>greatest(n,m)*0.3 THEN RETURN 0; END IF;
  IF a=b THEN RETURN 1; END IF;
  previous:=ARRAY(SELECT generate_series(0,m));
  FOR i IN 1..n LOOP
    current_row:=ARRAY[i];
    FOR k IN 1..m LOOP
      current_row:=array_append(current_row,least(current_row[k]+1,previous[k+1]+1,
        previous[k]+CASE WHEN substr(a,i,1)=substr(b,k,1) THEN 0 ELSE 1 END));
    END LOOP;
    previous:=current_row;
  END LOOP;
  RETURN 1-previous[m+1]::numeric/greatest(n,m);
END $$;
REVOKE ALL ON FUNCTION public.scan_normalized_name(text),public.scan_name_similarity(text,text)
  FROM PUBLIC,anon,authenticated;
CREATE INDEX cheque_scan_account_identity ON public.accounts(business_id,account_number,ifsc_code)
  WHERE deleted_at IS NULL AND NOT is_draft;

CREATE FUNCTION public.scan_entity_candidates(requested_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs; parties jsonb; accounts jsonb; party_name text; target_account_name text;
BEGIN
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid();
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id) OR
    j.status NOT IN ('ready_high','ready_partial','accepted_partial') THEN
    RAISE EXCEPTION 'Scan unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cheques WHERE id=j.draft_id AND business_id=j.business_id
    AND is_draft AND deleted_at IS NULL AND image_url=j.image_url) THEN
    RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  party_name:=CASE j.mode WHEN 'Inward' THEN j.details->>'account_name' ELSE j.details->>'payee_name' END;
  target_account_name:=CASE j.mode WHEN 'Inward' THEN j.details->>'payee_name' ELSE j.details->>'account_name' END;
  -- Fuzzy work is capped at 500 names per entity type and 80 code points per name.
  -- Full bank evidence is selected independently, so it cannot be lost to that cap.
  WITH identity AS MATERIALIZED (
    SELECT p.id,p.name,true AS bank_match FROM public.cheque_scan_party_banks x
    JOIN public.parties p ON p.id=x.party_id AND p.business_id=x.business_id
    WHERE x.business_id=j.business_id AND j.mode='Inward'
      AND x.account_number=j.details->>'account_number' AND x.ifsc_code=j.details->>'ifsc_code'
      AND p.deleted_at IS NULL AND NOT p.is_draft
    ORDER BY p.id LIMIT 5
  ), names AS MATERIALIZED (
    SELECT p.id,p.name,false AS bank_match FROM public.parties p
    WHERE p.business_id=j.business_id AND p.deleted_at IS NULL AND NOT p.is_draft
    ORDER BY p.id LIMIT 500
  ), pool AS (
    SELECT * FROM identity UNION ALL SELECT * FROM names WHERE id NOT IN (SELECT id FROM identity)
  ), scored AS MATERIALIZED (
    SELECT p.*,public.scan_name_similarity(p.name,party_name) AS similarity FROM pool p
  )
  SELECT coalesce(jsonb_agg(to_jsonb(candidate)),'[]') INTO parties FROM (
    SELECT p.id,p.name,
      CASE WHEN p.bank_match THEN 1.0 ELSE p.similarity*0.8 END AS score,
      CASE WHEN p.bank_match THEN 'confirmed_bank_identity'
        WHEN p.similarity=1 THEN 'normalized_name' ELSE 'similar_name' END AS reason
    FROM scored p WHERE p.bank_match OR p.similarity>=0.7
    ORDER BY score DESC,p.id LIMIT 5
  ) candidate;
  WITH identity AS MATERIALIZED (
    SELECT a.*,true AS bank_match FROM public.accounts a
    WHERE a.business_id=j.business_id AND a.deleted_at IS NULL AND NOT a.is_draft
      AND j.mode='Outward' AND a.account_number=j.details->>'account_number'
      AND a.ifsc_code=j.details->>'ifsc_code' ORDER BY a.id LIMIT 5
  ), names AS MATERIALIZED (
    SELECT a.*,false AS bank_match FROM public.accounts a
    WHERE a.business_id=j.business_id AND a.deleted_at IS NULL AND NOT a.is_draft
    ORDER BY a.id LIMIT 500
  ), pool AS (
    SELECT * FROM identity UNION ALL SELECT * FROM names WHERE id NOT IN (SELECT id FROM identity)
  ), scored AS MATERIALIZED (
    SELECT a.*,public.scan_name_similarity(a.account_name,target_account_name) AS similarity FROM pool a
  )
  SELECT coalesce(jsonb_agg(to_jsonb(candidate)),'[]') INTO accounts FROM (
    SELECT a.id,a.account_name || ' · ••••' || right(a.account_number,4) AS name,
      CASE WHEN a.bank_match THEN 1.0 ELSE a.similarity*0.8 END AS score,
      CASE WHEN a.bank_match THEN 'exact_bank_identity'
        WHEN a.similarity=1 THEN 'normalized_name' ELSE 'similar_name' END AS reason,
      (a.bank_match
        AND j.reliability->'account_number'->>'level'='high'
        AND j.reliability->'ifsc_code'->>'level'='high'
        AND (SELECT count(*) FROM public.accounts x WHERE x.business_id=j.business_id
          AND x.deleted_at IS NULL AND NOT x.is_draft AND x.account_number=a.account_number AND x.ifsc_code=a.ifsc_code)=1) IS TRUE AS exact
    FROM scored a WHERE a.bank_match OR a.similarity>=0.7
    ORDER BY score DESC,a.id LIMIT 5
  ) candidate;
  RETURN jsonb_build_object('parties',parties,'accounts',accounts);
END $$;

CREATE FUNCTION public.confirm_scan_party(requested_job uuid,requested_party uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id) OR
    j.status NOT IN ('ready_high','ready_partial','accepted_partial') OR NOT EXISTS (
      SELECT 1 FROM public.parties p WHERE p.id=requested_party AND p.business_id=j.business_id
        AND p.deleted_at IS NULL AND NOT p.is_draft) THEN
    RAISE EXCEPTION 'Party unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id AND business_id=j.business_id
    AND is_draft AND deleted_at IS NULL AND image_url=j.image_url FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF j.mode='Inward' AND j.details->>'account_number' ~ '^[0-9]{6,34}$'
    AND j.details->>'ifsc_code' ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
    AND j.reliability->'account_number'->>'reason'='clear'
    AND j.reliability->'ifsc_code'->>'reason'='clear' THEN
    INSERT INTO public.cheque_scan_party_banks(business_id,party_id,account_number,ifsc_code,confirmed_by,source_job)
      VALUES(j.business_id,requested_party,j.details->>'account_number',j.details->>'ifsc_code',auth.uid(),j.id)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('party_id',requested_party,'confirmed',true);
END $$;

CREATE FUNCTION public.create_scan_entity(requested_job uuid,requested_kind text,requested_bank uuid DEFAULT NULL,
  requested_allow_duplicate boolean DEFAULT false,requested_contact text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs; intent public.cheque_scan_entity_intents; entity uuid; entity_name text; candidates jsonb;
BEGIN
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id)
    OR j.status NOT IN ('ready_high','ready_partial','accepted_partial') THEN
    RAISE EXCEPTION 'Scan unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id AND business_id=j.business_id
    AND is_draft AND deleted_at IS NULL AND image_url=j.image_url FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF requested_kind IS NULL OR requested_kind NOT IN ('party','account') OR requested_allow_duplicate IS NULL THEN
    RAISE EXCEPTION 'Invalid entity kind' USING ERRCODE='22023'; END IF;
  SELECT * INTO intent FROM public.cheque_scan_entity_intents WHERE job_id=j.id AND kind=requested_kind;
  IF FOUND THEN
    IF intent.bank_id IS DISTINCT FROM requested_bank OR intent.contact IS DISTINCT FROM requested_contact THEN
      RAISE EXCEPTION 'Conflicting creation intent' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('id',intent.entity_id,'kind',requested_kind,'created',false);
  END IF;
  -- Also coordinates distinct scans/devices; direct entity writes lock this row via lifecycle_guard.
  PERFORM 1 FROM public.businesses WHERE id=j.business_id FOR UPDATE;
  IF requested_kind='party' THEN
    entity_name:=btrim(CASE j.mode WHEN 'Inward' THEN j.details->>'account_name' ELSE j.details->>'payee_name' END);
    IF coalesce(length(entity_name),0) NOT BETWEEN 2 AND 120 THEN
      RAISE EXCEPTION 'SCAN_NOT_READY' USING ERRCODE='22023'; END IF;
    IF coalesce(btrim(requested_contact),'') !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'CONTACT_REQUIRED' USING ERRCODE='22023'; END IF;
    SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) INTO candidates FROM public.parties
      WHERE business_id=j.business_id AND deleted_at IS NULL AND lower(btrim(name))=lower(entity_name);
    IF candidates IS NOT NULL AND NOT requested_allow_duplicate THEN
      RAISE EXCEPTION 'DUPLICATE_ENTITY' USING ERRCODE='23505'; END IF;
    INSERT INTO public.parties(business_id,name,contact) VALUES(j.business_id,entity_name,btrim(requested_contact))
      RETURNING id INTO entity;
  ELSE
    IF j.mode<>'Outward' THEN RAISE EXCEPTION 'Receiving account requires manual selection' USING ERRCODE='22023'; END IF;
    entity_name:=btrim(j.details->>'account_name');
    IF coalesce(length(entity_name),0) NOT BETWEEN 2 AND 120 OR
      coalesce(j.details->>'account_number','') !~ '^[0-9]{6,34}$' OR requested_bank IS NULL OR NOT EXISTS
      (SELECT 1 FROM public.banks WHERE id=requested_bank AND deleted_at IS NULL
        AND (owner_id IS NULL OR owner_id=auth.uid())) THEN
      RAISE EXCEPTION 'Account details and available bank required' USING ERRCODE='22023'; END IF;
    SELECT jsonb_agg(jsonb_build_object('id',id,'name',account_name) ORDER BY id) INTO candidates FROM public.accounts
      WHERE business_id=j.business_id AND deleted_at IS NULL AND
        (account_number=j.details->>'account_number' OR lower(btrim(account_name))=lower(entity_name));
    IF candidates IS NOT NULL AND NOT requested_allow_duplicate THEN
      RAISE EXCEPTION 'DUPLICATE_ENTITY' USING ERRCODE='23505'; END IF;
    INSERT INTO public.accounts(business_id,account_name,account_number,ifsc_code,bank_id)
      VALUES(j.business_id,entity_name,j.details->>'account_number',j.details->>'ifsc_code',requested_bank)
      RETURNING id INTO entity;
  END IF;
  INSERT INTO public.cheque_scan_entity_intents(job_id,kind,entity_id,bank_id,contact)
    VALUES(j.id,requested_kind,entity,requested_bank,requested_contact);
  RETURN jsonb_build_object('id',entity,'kind',requested_kind,'created',true);
END $$;

CREATE FUNCTION public.remap_cheque_scan(requested_job uuid,requested_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF requested_mode IS NULL OR requested_mode NOT IN ('Inward','Outward') THEN
    RAISE EXCEPTION 'Invalid scan mode' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cheque-scan:'||auth.uid()::text,0));
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id) THEN
    RAISE EXCEPTION 'Scan unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id AND is_draft AND deleted_at IS NULL
    AND image_url=j.image_url AND business_id=j.business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF j.status NOT IN ('ready_high','ready_partial','accepted_partial') OR
    EXISTS (SELECT 1 FROM public.cheque_scan_entity_intents WHERE job_id=j.id) THEN
    RAISE EXCEPTION 'SCAN_NOT_READY' USING ERRCODE='22023'; END IF;
  UPDATE public.cheque_scan_jobs SET mode=requested_mode WHERE id=j.id;
  RETURN public.scan_job_json(j.id);
END $$;

CREATE FUNCTION public.cleanup_cheque_scans()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE total integer;
BEGIN
  UPDATE public.cheque_scan_jobs SET details=NULL,reliability=NULL
    WHERE id IN (SELECT id FROM public.cheque_scan_jobs WHERE created_at<clock_timestamp()-interval '7 days'
      AND status NOT IN ('accepted','processing','ready_partial') AND (details IS NOT NULL OR reliability IS NOT NULL)
      ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED);
  DELETE FROM public.cheque_scan_jobs WHERE id IN (
    SELECT j.id FROM public.cheque_scan_jobs j JOIN public.cheque_scan_credits c ON c.job_id=j.id
      WHERE j.created_at<clock_timestamp()-interval '30 days'
        AND j.status NOT IN ('accepted','processing','ready_partial') AND c.state<>'reserved'
      ORDER BY j.created_at LIMIT 500 FOR UPDATE OF j SKIP LOCKED);
  GET DIAGNOSTICS total=ROW_COUNT;
  DELETE FROM public.cheque_scan_daily_budget WHERE day<(clock_timestamp() AT TIME ZONE 'UTC')::date-30;
  RETURN total;
END $$;

ALTER TABLE public.cheques ADD COLUMN scan_duplicate_override boolean NOT NULL DEFAULT false;
CREATE TABLE public.cheque_scan_duplicate_confirmations (
  job_id uuid PRIMARY KEY REFERENCES public.cheque_scan_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  draft_id uuid NOT NULL REFERENCES public.cheques(id),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  cheque_number text NOT NULL CHECK (cheque_number ~ '^[0-9]{6}$'),
  image_url text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours'
);
ALTER TABLE public.cheque_scan_duplicate_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cheque_scan_duplicate_confirmations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cheque_scan_duplicate_confirmations TO service_role;

CREATE FUNCTION public.confirm_scan_duplicate(requested_job uuid,requested_account uuid,requested_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.cheque_scan_jobs;
BEGIN
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM public.reconcile_cheque_scans(auth.uid());
  SELECT * INTO j FROM public.cheque_scan_jobs WHERE id=requested_job AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_business_active(j.business_id) THEN
    RAISE EXCEPTION 'Scan unavailable' USING ERRCODE='42501'; END IF;
  IF j.status NOT IN ('ready_high','ready_partial','accepted_partial') OR j.details IS NULL THEN
    RAISE EXCEPTION 'SCAN_NOT_READY' USING ERRCODE='22023'; END IF;
  IF requested_number IS NULL OR requested_number !~ '^[0-9]{6}$'
    OR requested_number IS DISTINCT FROM j.details->>'cheque_number' THEN
    RAISE EXCEPTION 'SCAN_NOT_READY' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.cheques WHERE id=j.draft_id AND business_id=j.business_id
    AND is_draft AND deleted_at IS NULL AND image_url=j.image_url FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.businesses WHERE id=j.business_id FOR UPDATE;
  PERFORM 1 FROM public.accounts WHERE id=requested_account AND business_id=j.business_id
    AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.cheque_scan_duplicate_confirmations(job_id,user_id,draft_id,business_id,
    account_id,cheque_number,image_url)
    VALUES(j.id,j.user_id,j.draft_id,j.business_id,requested_account,requested_number,j.image_url)
    ON CONFLICT(job_id) DO UPDATE SET account_id=EXCLUDED.account_id,
      cheque_number=EXCLUDED.cheque_number,confirmed_at=clock_timestamp(),
      expires_at=clock_timestamp()+interval '24 hours';
  RETURN jsonb_build_object('confirmed',true,'job_id',j.id,'draft_id',j.draft_id,
    'account_id',requested_account,'cheque_number',requested_number);
END $$;

CREATE FUNCTION public.derive_scan_duplicate_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.scan_duplicate_override:=false;
  IF NEW.is_draft THEN RETURN NEW; END IF;
  -- Existing deliberate duplicates remain valid after operational job retention.
  IF TG_OP='UPDATE' AND NOT OLD.is_draft AND OLD.scan_duplicate_override
    AND OLD.business_id=NEW.business_id AND OLD.account_id IS NOT DISTINCT FROM NEW.account_id
    AND OLD.cheque_number IS NOT DISTINCT FROM NEW.cheque_number THEN
    NEW.scan_duplicate_override:=true;
    RETURN NEW;
  END IF;
  NEW.scan_duplicate_override:=EXISTS (
    SELECT 1 FROM public.cheque_scan_duplicate_confirmations d
    JOIN public.cheque_scan_jobs j ON j.id=d.job_id
    JOIN public.businesses b ON b.id=d.business_id AND b.user_id=d.user_id
    JOIN public.accounts a ON a.id=d.account_id AND a.business_id=d.business_id
    WHERE d.draft_id=NEW.id AND d.business_id=NEW.business_id AND d.account_id=NEW.account_id
      AND d.cheque_number=NEW.cheque_number AND d.image_url=NEW.image_url
      AND d.expires_at>clock_timestamp() AND b.deleted_at IS NULL
      AND a.deleted_at IS NULL AND NOT a.is_draft AND public.lifecycle_user_active(d.user_id)
      AND (auth.uid() IS NULL OR auth.uid()=d.user_id)
      AND j.user_id=d.user_id AND j.draft_id=NEW.id AND j.business_id=NEW.business_id
      AND j.image_url=NEW.image_url AND j.status IN ('ready_high','ready_partial','accepted_partial')
      AND (j.status<>'ready_partial' OR j.review_expires_at>clock_timestamp())
  );
  RETURN NEW;
END $$;
CREATE TRIGGER scan_duplicate_override BEFORE INSERT OR UPDATE ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.derive_scan_duplicate_override();
DROP INDEX public.cheques_business_account_number_key;
CREATE UNIQUE INDEX cheques_business_account_number_key
  ON public.cheques(business_id,account_id,cheque_number)
  WHERE NOT is_draft AND deleted_at IS NULL AND NOT scan_duplicate_override;
REVOKE ALL ON FUNCTION public.derive_scan_duplicate_override() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.confirm_scan_duplicate(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_scan_duplicate(uuid,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.rotate_scan_quota_period(),public.scan_job_json(uuid,boolean),
  public.settle_scan_credit(uuid,text),public.reconcile_cheque_scans(uuid),
  public.dispatch_cheque_scan(uuid),public.dispatch_new_cheque_scan(),public.recover_cheque_scans(),
  public.claim_cheque_scan(uuid),public.finish_cheque_scan(uuid,uuid,text,jsonb,jsonb,text),public.cleanup_cheque_scans()
  ,public.continue_cheque_scan(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_cheque_scans(),public.claim_cheque_scan(uuid),
  public.finish_cheque_scan(uuid,uuid,text,jsonb,jsonb,text),public.cleanup_cheque_scans(),
  public.continue_cheque_scan(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.acknowledge_cheque_scan_consent(text),public.begin_cheque_scan(text,uuid,text,text),
  public.read_cheque_scan(text),public.mutate_cheque_scan(uuid,text),public.scan_entity_candidates(uuid),
  public.confirm_scan_party(uuid,uuid),public.create_scan_entity(uuid,text,uuid,boolean,text),
  public.remap_cheque_scan(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_cheque_scan_consent(text),public.begin_cheque_scan(text,uuid,text,text),
  public.read_cheque_scan(text),public.mutate_cheque_scan(uuid,text),public.scan_entity_candidates(uuid),
  public.confirm_scan_party(uuid,uuid),public.create_scan_entity(uuid,text,uuid,boolean,text),
  public.remap_cheque_scan(uuid,text) TO authenticated;
