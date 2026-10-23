-- Casts intentionally fail on unknown stored values; never coerce them to a default.
CREATE TYPE public.profile_currency AS ENUM ('₹','$','€','£');
CREATE TYPE public.profile_date_format AS ENUM ('dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd');
CREATE TYPE public.profile_time_format AS ENUM ('12h','24h');
CREATE TYPE public.profile_language AS ENUM ('en','hi','hi-en');
CREATE TYPE public.tag_entity_type AS ENUM ('cheque','account','party','business');
CREATE TYPE public.notification_channel AS ENUM ('voice','whatsapp','email','push','sms');
CREATE TYPE public.notification_job_status AS ENUM ('pending','processing','sent','failed','skipped','cancelled');
CREATE TYPE public.notification_log_status AS ENUM ('success','failed');
CREATE TYPE public.notification_purpose AS ENUM ('cheque_reminder','sample_voice_test');
CREATE TYPE public.premium_tool_kind AS ENUM ('cheque-template','saved-view','message-template');
CREATE TYPE public.lifecycle_action AS ENUM ('delete','restore','deactivate');
ALTER TABLE public.lifecycle_events DROP CONSTRAINT lifecycle_events_action_check;
ALTER TABLE public.lifecycle_events ALTER COLUMN action TYPE public.lifecycle_action USING action::public.lifecycle_action;

ALTER TABLE public.profiles
  ALTER COLUMN currency DROP DEFAULT, ALTER COLUMN date_format DROP DEFAULT,
  ALTER COLUMN time_format DROP DEFAULT, ALTER COLUMN language DROP DEFAULT;
ALTER TABLE public.profiles
  ALTER COLUMN currency TYPE public.profile_currency USING currency::public.profile_currency,
  ALTER COLUMN date_format TYPE public.profile_date_format USING date_format::public.profile_date_format,
  ALTER COLUMN time_format TYPE public.profile_time_format USING time_format::public.profile_time_format,
  ALTER COLUMN language TYPE public.profile_language USING language::public.profile_language;
ALTER TABLE public.profiles
  ALTER COLUMN currency SET DEFAULT '₹', ALTER COLUMN date_format SET DEFAULT 'dd/MM/yyyy',
  ALTER COLUMN time_format SET DEFAULT '12h', ALTER COLUMN language SET DEFAULT 'en';

ALTER TABLE public.entity_tags DROP CONSTRAINT entity_tags_entity_type_check;
DROP POLICY lifecycle_active ON public.entity_tags;
ALTER TABLE public.entity_tags ALTER COLUMN entity_type TYPE public.tag_entity_type USING entity_type::public.tag_entity_type;
CREATE POLICY lifecycle_active ON public.entity_tags AS RESTRICTIVE FOR ALL TO authenticated
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.deleted_at IS NULL
    AND public.lifecycle_entity_active(entity_type::text,entity_id,t.business_id)))
  WITH CHECK (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.deleted_at IS NULL
    AND public.lifecycle_entity_active(entity_type::text,entity_id,t.business_id)));
ALTER TABLE public.premium_workspace_tools DROP CONSTRAINT premium_workspace_tools_kind_check;
ALTER TABLE public.premium_workspace_tools ALTER COLUMN kind TYPE public.premium_tool_kind USING kind::public.premium_tool_kind;
ALTER TABLE public.notification_jobs DROP CONSTRAINT notification_jobs_channel_check;
ALTER TABLE public.notification_jobs DROP CONSTRAINT notification_jobs_status_check;
ALTER TABLE public.notification_jobs ALTER COLUMN status DROP DEFAULT;
DROP INDEX public.notification_jobs_claim_idx;
ALTER TABLE public.notification_logs DROP CONSTRAINT notification_logs_channel_check;
ALTER TABLE public.notification_logs DROP CONSTRAINT notification_logs_status_check;
ALTER TABLE public.notification_jobs
  ALTER COLUMN channel TYPE public.notification_channel USING channel::public.notification_channel,
  ALTER COLUMN purpose TYPE public.notification_purpose USING purpose::public.notification_purpose,
  ALTER COLUMN status TYPE public.notification_job_status USING status::public.notification_job_status;
ALTER TABLE public.notification_jobs ALTER COLUMN status SET DEFAULT 'pending';
CREATE INDEX notification_jobs_claim_idx ON public.notification_jobs(scheduled_at) WHERE status = 'pending';
ALTER TABLE public.notification_logs
  ALTER COLUMN channel TYPE public.notification_channel USING channel::public.notification_channel,
  ALTER COLUMN purpose TYPE public.notification_purpose USING purpose::public.notification_purpose,
  ALTER COLUMN status TYPE public.notification_log_status USING status::public.notification_log_status;

-- Keep TEXT RPC parameters for API compatibility; cast only at storage boundaries.
DO $$
DECLARE routine regprocedure; definition text;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.lifecycle_set_tag(uuid,text,uuid,boolean)'::regprocedure,
    'public.premium_workspace_save_tool(uuid,text,text,jsonb,uuid)'::regprocedure,
    'public.premium_workspace_apply_tool(uuid)'::regprocedure,
    'public.premium_workspace_message(uuid)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    definition := replace(definition,'VALUES(requested_tag,requested_type,requested_entity)',
      'VALUES(requested_tag,requested_type::public.tag_entity_type,requested_entity)');
    definition := replace(definition,'VALUES(auth.uid(),requested_business,requested_kind,btrim(requested_name),requested_payload)',
      'VALUES(auth.uid(),requested_business,requested_kind::public.premium_tool_kind,btrim(requested_name),requested_payload)');
    definition := replace(definition,'AND kind = requested_kind','AND kind::text = requested_kind');
    definition := replace(definition,'tool.kind,tool.payload','tool.kind::text,tool.payload');
    EXECUTE definition;
  END LOOP;
END $$;

-- Quantities remain numeric: reminder lead days, per-day frequency, NPS scores,
-- quotas, prices and durations are bounded measurements, not categorical labels.
ALTER TABLE public.profiles ADD CONSTRAINT profile_reminders_per_day_range
  CHECK (reminders_per_day BETWEEN 1 AND 3);
ALTER TABLE public.profiles ADD CONSTRAINT profile_default_reminder_days_range
  CHECK (default_reminder_days BETWEEN 0 AND 365);
ALTER TABLE public.cheques ADD CONSTRAINT cheque_reminder_days_range
  CHECK (remind_before_days BETWEEN 0 AND 365);
