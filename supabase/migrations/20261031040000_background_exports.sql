CREATE TABLE public.report_export_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  business_id uuid NOT NULL,
  format text NOT NULL CHECK (format IN ('csv','json')),
  include_inward boolean NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed','expired')),
  row_count int NOT NULL DEFAULT 0,
  next_part int NOT NULL DEFAULT 0,
  part_count int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  claim_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  cleaned_at timestamptz
);
CREATE INDEX report_export_owner_idx ON public.report_export_jobs(user_id, created_at DESC);
CREATE INDEX report_export_queue_idx ON public.report_export_jobs(created_at) WHERE status IN ('queued','processing');
CREATE INDEX report_export_cleanup_idx ON public.report_export_jobs(expires_at) WHERE cleaned_at IS NULL;
CREATE INDEX report_export_retention_idx ON public.report_export_jobs(cleaned_at) WHERE cleaned_at IS NOT NULL;
CREATE TABLE public.report_export_rows (
  job_id uuid NOT NULL REFERENCES public.report_export_jobs(id) ON DELETE CASCADE,
  "position" int NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(job_id, "position")
);
ALTER TABLE public.report_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_export_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_export_jobs, public.report_export_rows FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.report_export_jobs, public.report_export_rows TO service_role;
GRANT SELECT ON public.report_export_jobs TO authenticated;
CREATE POLICY export_job_owner ON public.report_export_jobs FOR SELECT TO authenticated
  USING(user_id = auth.uid() AND public.lifecycle_user_active());

INSERT INTO storage.buckets(id,name,public) VALUES('report-exports','report-exports',false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
CREATE FUNCTION public.report_export_access(requested_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.lifecycle_user_active() AND public.has_lifetime_premium() AND EXISTS (
    SELECT 1 FROM public.report_export_jobs j JOIN public.businesses b ON b.id = j.business_id
    WHERE j.user_id = auth.uid() AND b.user_id = auth.uid() AND b.deleted_at IS NULL
      AND j.status = 'ready' AND j.expires_at > now()
      AND requested_path = j.user_id || '/' || j.id || '/' ||
        split_part(requested_path,'/',3)
      AND split_part(requested_path,'/',3) ~ '^[0-9]+\.part$'
      AND CASE WHEN split_part(requested_path,'/',3) ~ '^[0-9]{1,3}\.part$'
        THEN replace(split_part(requested_path,'/',3),'.part','')::numeric < j.part_count ELSE false END
  )
$$;
REVOKE ALL ON FUNCTION public.report_export_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_export_access(text) TO authenticated;
CREATE POLICY export_object_owner ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id = 'report-exports' AND public.report_export_access(name));

CREATE FUNCTION public.request_report_export(
  requested_id uuid, requested_business uuid, requested_format text, requested_include_inward boolean
) RETURNS public.report_export_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.report_export_jobs; total int; bytes bigint;
BEGIN
  PERFORM public.premium_workspace_assert_owner(requested_business);
  IF NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '42501'; END IF;
  IF requested_id IS NULL OR requested_format IS NULL OR requested_format NOT IN ('csv','json')
    OR requested_include_inward IS NULL THEN RAISE EXCEPTION 'Invalid export request' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 5400));
  SELECT * INTO j FROM public.report_export_jobs WHERE id = requested_id;
  IF FOUND THEN
    IF j.user_id <> auth.uid() OR j.business_id <> requested_business OR j.format <> requested_format
      OR j.include_inward <> requested_include_inward THEN
      RAISE EXCEPTION 'Conflicting export request' USING ERRCODE = '22023';
    END IF;
    RETURN j;
  END IF;
  IF EXISTS(SELECT 1 FROM public.report_export_jobs WHERE user_id = auth.uid()
    AND status IN ('queued','processing') AND expires_at > now()) THEN
    RAISE EXCEPTION 'An export is already in progress' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.report_export_jobs WHERE user_id = auth.uid()
    AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'Daily export request limit reached' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.report_export_jobs(id,user_id,business_id,format,include_inward)
    VALUES(requested_id,auth.uid(),requested_business,requested_format,requested_include_inward);
  -- One SQL statement freezes scalar fields AND relations under a single MVCC snapshot.
  INSERT INTO public.report_export_rows(job_id,"position",payload)
  SELECT requested_id, row_number() OVER(ORDER BY c.cheque_date,c.id)::int - 1,
    jsonb_build_object(
      'id',c.id,'business_id',c.business_id,'party_id',c.party_id,'account_id',c.account_id,
      'cheque_number',c.cheque_number,'amount',c.amount,'cheque_date',c.cheque_date,
      'deposit_date',c.deposit_date,'remind_before_days',c.remind_before_days,'status',c.status,
      'type',c.type,'notes',c.notes,'image_url',c.image_url,'created_at',c.created_at,'updated_at',c.updated_at,
      'party', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'contact',p.contact,'color',p.color,'icon',p.icon,'avatar_url',p.avatar_url) END,
      'account', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('account_name',a.account_name,'color',a.color,'icon',a.icon,
        'bank', CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object('name',k.name,'logo_url',k.logo_url) END) END)
  FROM public.cheques c
  LEFT JOIN public.parties p ON p.id = c.party_id AND p.business_id = c.business_id AND p.deleted_at IS NULL
  LEFT JOIN public.accounts a ON a.id = c.account_id AND a.business_id = c.business_id AND a.deleted_at IS NULL
  LEFT JOIN public.banks k ON k.id = a.bank_id AND k.deleted_at IS NULL
  WHERE c.business_id = requested_business AND NOT c.is_draft AND c.deleted_at IS NULL
    AND (requested_include_inward OR c.type::text <> 'Inward')
  ORDER BY c.cheque_date,c.id LIMIT 50001;
  SELECT count(*)::int, coalesce(sum(octet_length(payload::text)),0) INTO total,bytes
    FROM public.report_export_rows WHERE job_id = requested_id;
  IF total = 0 THEN RAISE EXCEPTION 'No cheques to export' USING ERRCODE = '22023'; END IF;
  IF total > 50000 OR bytes > 52428800 THEN
    RAISE EXCEPTION 'Export exceeds 50000 rows or 50 MiB snapshot limit' USING ERRCODE = '22023';
  END IF;
  UPDATE public.report_export_jobs SET row_count = total,part_count = (total + 499)/500
    WHERE id = requested_id RETURNING * INTO j;
  RETURN j;
END $$;

CREATE FUNCTION public.claim_report_export() RETURNS SETOF public.report_export_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.report_export_jobs SET status = 'failed', error_code = 'attempts_exhausted',lease_until = NULL
    WHERE status = 'processing' AND lease_until <= now() AND attempts >= 3;
  RETURN QUERY UPDATE public.report_export_jobs j SET status = 'processing',
    attempts = attempts + 1,claim_token = gen_random_uuid(),lease_until = now() + interval '2 minutes'
  WHERE j.id = (SELECT q.id FROM public.report_export_jobs q
    WHERE (q.status = 'queued' OR (q.status = 'processing' AND q.lease_until <= now()))
      AND q.attempts < 3 AND q.expires_at > now()
      AND public.lifecycle_user_active(q.user_id)
      AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id = q.business_id AND b.user_id = q.user_id AND b.deleted_at IS NULL)
    ORDER BY q.created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;

CREATE FUNCTION public.report_export_batch(requested_job uuid,requested_token uuid)
RETURNS TABLE("position" int,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.report_export_jobs;
BEGIN
  SELECT * INTO j FROM public.report_export_jobs WHERE id = requested_job;
  IF NOT FOUND OR j.status <> 'processing' OR requested_token IS NULL OR j.claim_token IS DISTINCT FROM requested_token
    OR j.lease_until IS NULL OR j.lease_until <= now() OR j.expires_at <= now()
    OR NOT public.lifecycle_user_active(j.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.businesses b WHERE b.id = j.business_id AND b.user_id = j.user_id AND b.deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Stale export claim'; END IF;
  RETURN QUERY SELECT r.position,r.payload FROM public.report_export_rows r
    WHERE r.job_id = j.id AND r.position >= j.next_part * 500 AND r.position < (j.next_part + 1)*500
    ORDER BY r.position;
END $$;

CREATE FUNCTION public.advance_report_export(requested_job uuid,requested_token uuid,requested_part int)
RETURNS public.report_export_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.report_export_jobs;
BEGIN
  SELECT * INTO j FROM public.report_export_jobs WHERE id = requested_job FOR UPDATE;
  IF NOT FOUND OR requested_token IS NULL OR j.claim_token IS DISTINCT FROM requested_token OR j.expires_at <= now() THEN
    RAISE EXCEPTION 'Stale export claim';
  END IF;
  IF j.next_part = requested_part + 1 AND
    (j.status = 'ready' OR (j.status = 'processing' AND j.lease_until > now())) THEN RETURN j; END IF;
  IF j.status <> 'processing' OR j.lease_until IS NULL OR j.lease_until <= now() OR requested_part IS DISTINCT FROM j.next_part THEN RAISE EXCEPTION 'Stale export part'; END IF;
  UPDATE public.report_export_jobs SET next_part = next_part + 1,
    status = CASE WHEN next_part + 1 = part_count THEN 'ready' ELSE 'processing' END,
    lease_until = now() + interval '2 minutes'
    WHERE id = j.id RETURNING * INTO j;
  IF j.status = 'ready' THEN DELETE FROM public.report_export_rows WHERE job_id = j.id; END IF;
  RETURN j;
END $$;

CREATE FUNCTION public.release_report_export(requested_job uuid,requested_token uuid,requested_failed boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.report_export_jobs SET status = CASE WHEN requested_failed AND attempts >= 3 THEN 'failed' ELSE 'queued' END,
    error_code = CASE WHEN requested_failed AND attempts >= 3 THEN 'generation_failed' ELSE NULL END,
    attempts = CASE WHEN requested_failed THEN attempts ELSE greatest(0,attempts - 1) END,
    lease_until = CASE WHEN requested_failed THEN lease_until ELSE NULL END
  WHERE id = requested_job AND claim_token = requested_token AND status = 'processing';
END $$;
CREATE FUNCTION public.cancel_report_export(requested_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.report_export_jobs SET status = 'expired',expires_at = now()
    WHERE id = requested_job AND user_id = auth.uid() AND public.lifecycle_user_active();
  IF NOT FOUND THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE = '42501'; END IF;
END $$;

CREATE FUNCTION public.report_export_download(requested_job uuid)
RETURNS public.report_export_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.report_export_jobs;
BEGIN
  SELECT * INTO j FROM public.report_export_jobs WHERE id = requested_job AND user_id = auth.uid();
  IF NOT FOUND OR j.status <> 'ready' OR j.expires_at <= now() OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Export unavailable or expired' USING ERRCODE = '42501';
  END IF;
  PERFORM public.premium_workspace_assert_owner(j.business_id);
  RETURN j;
END $$;
CREATE FUNCTION public.expired_report_exports()
RETURNS SETOF public.report_export_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.report_export_jobs WHERE cleaned_at < now() - interval '7 days';
  RETURN QUERY UPDATE public.report_export_jobs j SET status = CASE WHEN j.status = 'failed' THEN 'failed' ELSE 'expired' END,lease_until = NULL
  WHERE j.id IN (SELECT q.id FROM public.report_export_jobs q WHERE q.cleaned_at IS NULL
    AND (q.expires_at <= now() OR q.status = 'failed' OR NOT public.lifecycle_user_active(q.user_id)
      OR NOT EXISTS(SELECT 1 FROM public.businesses b WHERE b.id = q.business_id AND b.user_id = q.user_id AND b.deleted_at IS NULL))
    AND (q.lease_until IS NULL OR q.lease_until < now() - interval '1 minute')
    ORDER BY q.created_at LIMIT 5 FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;
CREATE FUNCTION public.clean_report_export(requested_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.report_export_rows WHERE job_id = requested_job
    AND EXISTS(SELECT 1 FROM public.report_export_jobs WHERE id = requested_job AND status IN ('expired','failed'));
  UPDATE public.report_export_jobs SET cleaned_at = now() WHERE id = requested_job AND status IN ('expired','failed');
END $$;

REVOKE ALL ON FUNCTION public.request_report_export(uuid,uuid,text,boolean),public.cancel_report_export(uuid),
  public.report_export_download(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_report_export(uuid,uuid,text,boolean),public.cancel_report_export(uuid),
  public.report_export_download(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_report_export(),public.report_export_batch(uuid,uuid),
  public.advance_report_export(uuid,uuid,int),public.release_report_export(uuid,uuid,boolean),
  public.expired_report_exports(),public.clean_report_export(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_export(),public.report_export_batch(uuid,uuid),
  public.advance_report_export(uuid,uuid,int),public.release_report_export(uuid,uuid,boolean),
  public.expired_report_exports(),public.clean_report_export(uuid) TO service_role;

-- Start paused: deploy the worker and validate a private QA download before enabling.
SELECT cron.schedule('report-exports-tick','* * * * *',$cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/report-exports',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
    body := '{}'::jsonb);
$cron$);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'report-exports-tick'),active := false);
