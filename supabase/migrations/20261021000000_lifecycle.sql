-- Retained user data: deletion is an authorized operation, never a physical DELETE.
CREATE TABLE public.lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('delete','restore','deactivate')),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lifecycle_events TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','businesses','parties','accounts','cheques',
    'tags','entity_tags','premium_workspace_tools','premium_workspace_print_layouts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN deletion_batch_id uuid', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(deletion_batch_id) WHERE deletion_batch_id IS NOT NULL', t || '_deletion_batch_idx', t);
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated, anon', t);
  END LOOP;
END $$;

ALTER TABLE public.tags DROP CONSTRAINT tags_business_id_name_key;
CREATE UNIQUE INDEX tags_active_name_key ON public.tags(business_id,name) WHERE deleted_at IS NULL;
ALTER TABLE public.premium_workspace_tools DROP CONSTRAINT premium_workspace_tools_user_id_business_id_kind_name_key;
CREATE UNIQUE INDEX premium_tools_active_name_key
  ON public.premium_workspace_tools(user_id,business_id,kind,name) WHERE deleted_at IS NULL;
DROP INDEX public.cheques_business_account_number_key;
CREATE UNIQUE INDEX cheques_business_account_number_key
  ON public.cheques(business_id,account_id,cheque_number) WHERE NOT is_draft AND deleted_at IS NULL;

CREATE FUNCTION public.lifecycle_user_active(requested_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT requested_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = requested_user AND deleted_at IS NULL
  )
$$;
CREATE FUNCTION public.lifecycle_business_active(requested_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = requested_business
    AND b.user_id = auth.uid() AND b.deleted_at IS NULL AND public.lifecycle_user_active(b.user_id))
$$;
CREATE FUNCTION public.lifecycle_entity_active(requested_type text, requested_id uuid, requested_business uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.lifecycle_business_active(requested_business) THEN RETURN false; END IF;
  CASE requested_type
    WHEN 'business' THEN RETURN requested_id = requested_business;
    WHEN 'cheque' THEN RETURN EXISTS (SELECT 1 FROM public.cheques c WHERE c.id = requested_id AND c.business_id = requested_business AND c.deleted_at IS NULL
      AND (c.party_id IS NULL OR EXISTS (SELECT 1 FROM public.parties p WHERE p.id = c.party_id AND p.business_id = c.business_id AND p.deleted_at IS NULL AND NOT p.is_draft))
      AND (c.account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = c.account_id AND a.business_id = c.business_id AND a.deleted_at IS NULL AND NOT a.is_draft)));
    WHEN 'party' THEN RETURN EXISTS (SELECT 1 FROM public.parties WHERE id = requested_id AND business_id = requested_business AND deleted_at IS NULL);
    WHEN 'account' THEN RETURN EXISTS (SELECT 1 FROM public.accounts WHERE id = requested_id AND business_id = requested_business AND deleted_at IS NULL);
    ELSE RETURN false;
  END CASE;
END $$;

CREATE POLICY lifecycle_active_business ON public.notification_jobs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (business_id IS NULL OR public.lifecycle_business_active(business_id))
  WITH CHECK (business_id IS NULL OR public.lifecycle_business_active(business_id));

-- Restrictive policies also constrain existing policies; privileged RPCs are guarded below.
DO $$
DECLARE t text; predicate text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','businesses','parties','accounts','cheques','tags',
    'entity_tags','premium_workspace_tools','premium_workspace_print_layouts'] LOOP
    predicate := CASE
      WHEN t = 'profiles' THEN 'deleted_at IS NULL AND user_id = auth.uid()'
      WHEN t = 'businesses' THEN 'deleted_at IS NULL AND user_id = auth.uid() AND public.lifecycle_user_active()'
      WHEN t = 'cheques' THEN 'deleted_at IS NULL AND public.lifecycle_business_active(business_id)
        AND (party_id IS NULL OR EXISTS (SELECT 1 FROM public.parties p WHERE p.id = cheques.party_id AND p.business_id = cheques.business_id AND p.deleted_at IS NULL AND NOT p.is_draft))
        AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = cheques.account_id AND a.business_id = cheques.business_id AND a.deleted_at IS NULL AND NOT a.is_draft))'
      WHEN t = 'entity_tags' THEN 'deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.deleted_at IS NULL AND public.lifecycle_entity_active(entity_type::text,entity_id,t.business_id))'
      WHEN t = 'premium_workspace_print_layouts' THEN 'deleted_at IS NULL AND user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.deleted_at IS NULL AND public.lifecycle_business_active(a.business_id))'
      ELSE 'deleted_at IS NULL AND public.lifecycle_business_active(business_id)' END;
    EXECUTE format('CREATE POLICY lifecycle_active ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', t, predicate, predicate);
  END LOOP;
  -- Financial/delivery history is retained, but inaccessible after deactivation.
  FOREACH t IN ARRAY ARRAY['user_entitlements','user_quotas','transactions','notification_jobs','notification_logs','nps_responses','push_subscriptions','api_rate_limits'] LOOP
    EXECUTE format('CREATE POLICY lifecycle_active_user ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.lifecycle_user_active()) WITH CHECK (public.lifecycle_user_active())', t);
  END LOOP;
END $$;

-- Serialize child writes and lifecycle operations on the business row. Parent row locks
-- below also protect dependencies from a concurrent direct write or Premium import.
CREATE FUNCTION public.lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE body jsonb := to_jsonb(NEW); old_body jsonb; bid uuid; owner uuid; parent record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Retained rows cannot be physically deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_body := to_jsonb(OLD);
    IF current_user IN ('authenticated','anon') AND (
      OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.deletion_batch_id IS DISTINCT FROM OLD.deletion_batch_id
    ) THEN RAISE EXCEPTION 'Use an authorized lifecycle operation' USING ERRCODE = '42501'; END IF;
    IF (body->>'business_id') IS DISTINCT FROM (old_body->>'business_id')
      OR (body->>'user_id') IS DISTINCT FROM (old_body->>'user_id')
      OR (body->>'id') IS DISTINCT FROM (old_body->>'id')
      OR (TG_TABLE_NAME = 'entity_tags' AND (
        body->>'tag_id' IS DISTINCT FROM old_body->>'tag_id' OR body->>'entity_id' IS DISTINCT FROM old_body->>'entity_id'
        OR body->>'entity_type' IS DISTINCT FROM old_body->>'entity_type')) THEN
      RAISE EXCEPTION 'Row ownership and identity cannot change' USING ERRCODE = '42501';
    END IF;
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Deleted records cannot be mutated' USING ERRCODE = '42501';
    END IF;
  ELSIF current_user IN ('authenticated','anon') AND (
    NEW.deleted_at IS NOT NULL OR NEW.deletion_batch_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'Invalid deletion metadata' USING ERRCODE = '42501'; END IF;
  -- Deletion and admin restoration are performed as the migration owner.
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'profiles' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'businesses' THEN
    owner := NEW.user_id;
  ELSE
    IF TG_TABLE_NAME = 'entity_tags' THEN
      SELECT business_id INTO bid FROM public.tags WHERE id = NEW.tag_id AND deleted_at IS NULL FOR UPDATE;
    ELSIF TG_TABLE_NAME = 'premium_workspace_print_layouts' THEN
      SELECT business_id INTO bid FROM public.accounts WHERE id = NEW.account_id AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
    ELSE bid := (body->>'business_id')::uuid;
    END IF;
    SELECT * INTO parent FROM public.businesses WHERE id = bid FOR UPDATE;
    IF NOT FOUND OR parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Business unavailable' USING ERRCODE = '23503';
    END IF;
    owner := parent.user_id;
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = owner AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account deactivated' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> owner THEN
    RAISE EXCEPTION 'Not owned' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'cheques' THEN
    IF NEW.party_id IS NOT NULL THEN
      PERFORM 1 FROM public.parties WHERE id = NEW.party_id AND business_id = bid
        AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Party unavailable' USING ERRCODE = '23503'; END IF;
    END IF;
    IF NEW.account_id IS NOT NULL THEN
      PERFORM 1 FROM public.accounts WHERE id = NEW.account_id AND business_id = bid
        AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '23503'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'entity_tags' THEN
    -- Do not use auth-dependent RLS for service-role restoration.
    CASE NEW.entity_type::text
      WHEN 'cheque' THEN PERFORM 1 FROM public.cheques WHERE id = NEW.entity_id AND business_id = bid AND deleted_at IS NULL FOR UPDATE;
      WHEN 'party' THEN PERFORM 1 FROM public.parties WHERE id = NEW.entity_id AND business_id = bid AND deleted_at IS NULL FOR UPDATE;
      WHEN 'account' THEN PERFORM 1 FROM public.accounts WHERE id = NEW.entity_id AND business_id = bid AND deleted_at IS NULL FOR UPDATE;
      WHEN 'business' THEN PERFORM 1 FROM public.businesses WHERE id = NEW.entity_id AND id = bid AND deleted_at IS NULL FOR UPDATE;
      ELSE RAISE EXCEPTION 'Invalid entity type';
    END CASE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tagged entity unavailable' USING ERRCODE = '23503'; END IF;
  ELSIF TG_TABLE_NAME = 'premium_workspace_tools' THEN
    IF NEW.user_id <> owner THEN RAISE EXCEPTION 'Tool owner mismatch'; END IF;
    IF NEW.payload ? 'party_id' THEN
      PERFORM 1 FROM public.parties WHERE id = (NEW.payload->>'party_id')::uuid
        AND business_id = bid AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Saved party unavailable' USING ERRCODE = '23503'; END IF;
    END IF;
    IF NEW.payload ? 'account_id' THEN
      PERFORM 1 FROM public.accounts WHERE id = (NEW.payload->>'account_id')::uuid
        AND business_id = bid AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Saved account unavailable' USING ERRCODE = '23503'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','businesses','parties','accounts','cheques','tags',
    'entity_tags','premium_workspace_tools','premium_workspace_print_layouts'] LOOP
    EXECUTE format('CREATE TRIGGER lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lifecycle_guard()',t);
  END LOOP;
END $$;

CREATE FUNCTION public.lifecycle_delete(requested_table text, requested_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE bid uuid; owner uuid; batch uuid; row_data jsonb; t text;
BEGIN
  IF requested_table NOT IN ('businesses','parties','accounts','cheques','tags','premium_workspace_tools','premium_workspace_print_layouts') THEN
    RAISE EXCEPTION 'Unsupported lifecycle table';
  END IF;
  -- Locate without locking first; all writers subsequently lock the business.
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE %I = $1', requested_table,
    CASE WHEN requested_table = 'premium_workspace_print_layouts' THEN 'account_id' ELSE 'id' END)
    INTO row_data USING requested_id;
  IF row_data IS NULL THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE = '42501'; END IF;
  bid := CASE WHEN requested_table = 'businesses' THEN requested_id
    WHEN requested_table = 'premium_workspace_print_layouts' THEN (SELECT business_id FROM public.accounts WHERE id = requested_id)
    ELSE (row_data->>'business_id')::uuid END;
  SELECT user_id INTO owner FROM public.businesses WHERE id = bid FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE user_id = owner AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not owned or deactivated' USING ERRCODE = '42501';
  END IF;
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE %I = $1 FOR UPDATE', requested_table,
    CASE WHEN requested_table = 'premium_workspace_print_layouts' THEN 'account_id' ELSE 'id' END)
    INTO row_data USING requested_id;
  IF row_data->>'deleted_at' IS NOT NULL THEN RETURN (row_data->>'deletion_batch_id')::uuid; END IF;
  IF requested_table <> 'businesses' AND NOT public.lifecycle_business_active(bid) THEN RAISE EXCEPTION 'Business unavailable'; END IF;
  IF requested_table IN ('accounts','parties') THEN
    IF EXISTS (SELECT 1 FROM public.cheques WHERE business_id = bid AND deleted_at IS NULL
      AND CASE requested_table WHEN 'accounts' THEN account_id = requested_id ELSE party_id = requested_id END) THEN
      RAISE EXCEPTION 'Active cheques or drafts reference this record' USING ERRCODE = '23503';
    END IF;
  END IF;
  batch := gen_random_uuid();
  IF requested_table = 'businesses' THEN
    UPDATE public.notification_jobs SET status = 'cancelled',updated_at = now()
      WHERE business_id = bid AND status IN ('pending','processing');
    UPDATE public.entity_tags SET deleted_at = now(), deletion_batch_id = batch
      WHERE deleted_at IS NULL AND tag_id IN (SELECT id FROM public.tags WHERE business_id = bid);
    UPDATE public.premium_workspace_print_layouts SET deleted_at = now(), deletion_batch_id = batch
      WHERE deleted_at IS NULL AND account_id IN (SELECT id FROM public.accounts WHERE business_id = bid);
    FOREACH t IN ARRAY ARRAY['cheques','premium_workspace_tools','tags','parties','accounts'] LOOP
      EXECUTE format('UPDATE public.%I SET deleted_at = now(), deletion_batch_id = $1 WHERE business_id = $2 AND deleted_at IS NULL',t) USING batch,bid;
    END LOOP;
  ELSE
    UPDATE public.entity_tags SET deleted_at = now(), deletion_batch_id = batch WHERE deleted_at IS NULL AND
      ((requested_table = 'tags' AND tag_id = requested_id)
      OR (entity_id = requested_id AND entity_type::text = CASE requested_table
        WHEN 'cheques' THEN 'cheque' WHEN 'parties' THEN 'party' WHEN 'accounts' THEN 'account' ELSE '' END));
    IF requested_table = 'accounts' THEN
      UPDATE public.premium_workspace_print_layouts SET deleted_at = now(), deletion_batch_id = batch
        WHERE account_id = requested_id AND deleted_at IS NULL;
    END IF;
    IF requested_table IN ('accounts','parties') THEN
      UPDATE public.premium_workspace_tools SET deleted_at = now(), deletion_batch_id = batch
        WHERE business_id = bid AND deleted_at IS NULL
          AND payload->>CASE requested_table WHEN 'accounts' THEN 'account_id' ELSE 'party_id' END = requested_id::text;
    END IF;
  END IF;
  EXECUTE format('UPDATE public.%I SET deleted_at = now(), deletion_batch_id = $1 WHERE %I = $2',requested_table,
    CASE WHEN requested_table = 'premium_workspace_print_layouts' THEN 'account_id' ELSE 'id' END) USING batch,requested_id;
  INSERT INTO public.lifecycle_events(batch_id,actor_id,action,entity_table,entity_id)
    VALUES(batch,auth.uid(),'delete',requested_table,requested_id);
  RETURN batch;
END $$;

-- Admin-only recovery: transaction rollback (including its audit) on any constraint conflict.
CREATE FUNCTION public.lifecycle_restore(requested_table text, requested_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE row_data jsonb; batch uuid; t text;
BEGIN
  IF requested_table NOT IN ('profiles','businesses','parties','accounts','cheques','tags','premium_workspace_tools','premium_workspace_print_layouts','banks') THEN RAISE EXCEPTION 'Unsupported lifecycle table'; END IF;
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE %I = $1 FOR UPDATE', requested_table,
    CASE WHEN requested_table = 'premium_workspace_print_layouts' THEN 'account_id' ELSE 'id' END) INTO row_data USING requested_id;
  IF row_data IS NULL OR row_data->>'deleted_at' IS NULL THEN RAISE EXCEPTION 'Record is not deleted'; END IF;
  batch := (row_data->>'deletion_batch_id')::uuid;
  -- The selected root must precede its descendants. Earlier deletions never share its batch.
  IF requested_table = 'banks' THEN
    EXECUTE 'UPDATE public.banks SET deleted_at = NULL WHERE id = $1' USING requested_id;
  ELSE
    EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deletion_batch_id = NULL WHERE %I = $1',requested_table,
      CASE WHEN requested_table = 'premium_workspace_print_layouts' THEN 'account_id' ELSE 'id' END) USING requested_id;
  END IF;
  IF batch IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['businesses','parties','accounts','tags','cheques','premium_workspace_tools','premium_workspace_print_layouts','entity_tags'] LOOP
      EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deletion_batch_id = NULL WHERE deletion_batch_id = $1',t) USING batch;
    END LOOP;
  END IF;
  INSERT INTO public.lifecycle_events(batch_id,action,entity_table,entity_id)
    VALUES(coalesce(batch,gen_random_uuid()),'restore',requested_table,requested_id);
  RETURN batch;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Restore conflicts with an active identifier or name; resolve the conflict first' USING ERRCODE = '23505';
END $$;

CREATE FUNCTION public.lifecycle_set_tag(requested_tag uuid, requested_type text, requested_entity uuid, requested_attached boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE bid uuid; batch uuid := gen_random_uuid(); old_batch uuid;
BEGIN
  SELECT business_id INTO bid FROM public.tags WHERE id = requested_tag AND deleted_at IS NULL;
  PERFORM 1 FROM public.businesses WHERE id = bid AND user_id = auth.uid() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_entity_active(requested_type,requested_entity,bid) THEN
    RAISE EXCEPTION 'Tag or entity unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = auth.uid() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account deactivated' USING ERRCODE = '42501'; END IF;
  IF requested_attached THEN
    SELECT deletion_batch_id INTO old_batch FROM public.entity_tags
      WHERE tag_id = requested_tag AND entity_type::text = requested_type AND entity_id = requested_entity AND deleted_at IS NOT NULL;
    INSERT INTO public.entity_tags(tag_id,entity_type,entity_id) VALUES(requested_tag,requested_type,requested_entity)
      ON CONFLICT (tag_id,entity_type,entity_id) DO UPDATE SET deleted_at = NULL,deletion_batch_id = NULL;
    IF old_batch IS NOT NULL THEN
      INSERT INTO public.lifecycle_events(batch_id,actor_id,action,entity_table,entity_id)
        VALUES(old_batch,auth.uid(),'restore','entity_tags',requested_entity);
    END IF;
  ELSE
    UPDATE public.entity_tags SET deleted_at = now(),deletion_batch_id = batch
      WHERE tag_id = requested_tag AND entity_type::text = requested_type AND entity_id = requested_entity AND deleted_at IS NULL;
    IF FOUND THEN INSERT INTO public.lifecycle_events(batch_id,actor_id,action,entity_table,entity_id)
      VALUES(batch,auth.uid(),'delete','entity_tags',requested_entity); END IF;
  END IF;
END $$;

CREATE FUNCTION public.duplicate_cheque_draft(requested_cheque uuid)
RETURNS public.cheques LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source public.cheques; result public.cheques; zone text; bid uuid;
BEGIN
  SELECT business_id INTO bid FROM public.cheques WHERE id = requested_cheque;
  PERFORM public.premium_workspace_assert_owner(bid);
  PERFORM 1 FROM public.businesses WHERE id = bid AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO source FROM public.cheques WHERE id = requested_cheque AND deleted_at IS NULL AND NOT is_draft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cheque unavailable' USING ERRCODE = '42501'; END IF;
  SELECT time_zone INTO zone FROM public.profiles WHERE user_id = auth.uid() AND deleted_at IS NULL;
  INSERT INTO public.cheques(business_id,party_id,account_id,amount,type,notes,remind_before_days,cheque_date,is_draft)
    VALUES(source.business_id,source.party_id,source.account_id,source.amount,source.type,source.notes,
      source.remind_before_days,(now() AT TIME ZONE coalesce(zone,'UTC'))::date,true) RETURNING * INTO result;
  INSERT INTO public.entity_tags(tag_id,entity_type,entity_id)
    SELECT et.tag_id,'cheque',result.id FROM public.entity_tags et JOIN public.tags t ON t.id = et.tag_id
      WHERE et.entity_type::text = 'cheque' AND et.entity_id = source.id
        AND et.deleted_at IS NULL AND t.deleted_at IS NULL AND t.business_id = source.business_id;
  RETURN result;
END $$;

-- Preserve signatures used by deployed clients while replacing destructive behavior.
CREATE OR REPLACE FUNCTION public.premium_workspace_delete_tool(requested_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN PERFORM public.lifecycle_delete('premium_workspace_tools',requested_id); END $$;

-- Keep all existing API signatures. Their SECURITY DEFINER reads bypass RLS,
-- therefore every saved-tool, import, bulk and report path needs explicit filters.
DO $$
DECLARE routine regprocedure; definition text;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.premium_workspace_assert_owner(uuid)'::regprocedure,
    'public.premium_workspace_save_tool(uuid,text,text,jsonb,uuid)'::regprocedure,
    'public.premium_workspace_apply_tool(uuid)'::regprocedure,
    'public.premium_workspace_message(uuid)'::regprocedure,
    'public.premium_workspace_import(uuid,text,jsonb)'::regprocedure,
    'public.premium_workspace_bulk_status(uuid,uuid[],public.cheque_status)'::regprocedure,
    'public.premium_workspace_snapshot(uuid[],uuid,date,date)'::regprocedure,
    'public.premium_workspace_print_layout(uuid,jsonb)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    definition := replace(definition,'auth.uid() IS NULL OR NOT public.has_lifetime_premium()',
      'auth.uid() IS NULL OR NOT public.lifecycle_user_active() OR NOT public.has_lifetime_premium()');
    definition := replace(definition,'WHERE id = requested_id AND user_id = auth.uid()',
      'WHERE deleted_at IS NULL AND id = requested_id AND user_id = auth.uid()');
    definition := replace(definition,'WHERE user_id = auth.uid() AND (requested_business',
      'WHERE deleted_at IS NULL AND user_id = auth.uid() AND (requested_business');
    definition := replace(definition,'AND c.account_id = account AND c.cheque_number = number_text AND NOT c.is_draft',
      'AND c.deleted_at IS NULL AND c.account_id = account AND c.cheque_number = number_text AND NOT c.is_draft');
    definition := replace(definition,'WHERE id = ANY(requested_ids) AND business_id = requested_business',
      'WHERE deleted_at IS NULL AND id = ANY(requested_ids) AND business_id = requested_business');
    definition := replace(definition,'WHERE c.business_id = ANY(requested_businesses) AND NOT c.is_draft',
      'WHERE c.deleted_at IS NULL AND public.lifecycle_entity_active(''cheque'',c.id,c.business_id) AND c.business_id = ANY(requested_businesses) AND NOT c.is_draft');
    definition := replace(definition,'WHERE account_id = requested_account AND user_id = auth.uid()',
      'WHERE deleted_at IS NULL AND account_id = requested_account AND user_id = auth.uid()');
    EXECUTE definition;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_batch_size int DEFAULT 50)
RETURNS SETOF public.notification_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY UPDATE public.notification_jobs j SET status = 'processing', attempts = attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT q.id FROM public.notification_jobs q WHERE q.status = 'pending' AND q.scheduled_at <= now()
      AND public.lifecycle_user_active(q.user_id)
      AND (q.business_id IS NULL OR EXISTS (SELECT 1 FROM public.businesses b
        WHERE b.id = q.business_id AND b.user_id = q.user_id AND b.deleted_at IS NULL))
    ORDER BY q.scheduled_at LIMIT p_batch_size FOR UPDATE OF q SKIP LOCKED
  ) RETURNING j.*;
END $$;

DO $$
DECLARE routine regprocedure; definition text;
BEGIN
  definition := pg_get_functiondef('public.has_lifetime_premium()'::regprocedure);
  EXECUTE replace(definition,'SELECT EXISTS (','SELECT public.lifecycle_user_active() AND EXISTS (');
  FOREACH routine IN ARRAY ARRAY[
    'public.consume_api_rate_limit(text,integer,integer)'::regprocedure,
    'public.consume_user_quota(public.feature_type)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    EXECUTE replace(definition,'IF current_user_id IS NULL THEN',
      'IF current_user_id IS NULL OR NOT public.lifecycle_user_active(current_user_id) THEN');
  END LOOP;
END $$;

CREATE FUNCTION public.lifecycle_deactivate()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE batch uuid := gen_random_uuid(); pid uuid; profile_deleted timestamptz;
BEGIN
  SELECT id,deletion_batch_id,deleted_at INTO pid,batch,profile_deleted FROM public.profiles WHERE user_id = auth.uid() FOR UPDATE;
  IF pid IS NULL THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE = '42501'; END IF;
  IF profile_deleted IS NOT NULL THEN RETURN batch; END IF;
  batch := gen_random_uuid();
  UPDATE public.profiles SET deleted_at = now(),deletion_batch_id = batch WHERE id = pid;
  UPDATE public.notification_jobs SET status = 'cancelled',updated_at = now()
    WHERE user_id = auth.uid() AND status IN ('pending','processing');
  INSERT INTO public.lifecycle_events(batch_id,actor_id,action,entity_table,entity_id)
    VALUES(batch,auth.uid(),'deactivate','profiles',pid);
  RETURN batch;
END $$;

REVOKE ALL ON FUNCTION public.lifecycle_delete(text,uuid), public.lifecycle_set_tag(uuid,text,uuid,boolean),
  public.duplicate_cheque_draft(uuid), public.lifecycle_deactivate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_delete(text,uuid), public.lifecycle_set_tag(uuid,text,uuid,boolean),
  public.duplicate_cheque_draft(uuid), public.lifecycle_deactivate() TO authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_restore(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_restore(text,uuid) TO service_role;

-- Only active references grant read access. Replaced/deleted objects are retained, not writable.
CREATE FUNCTION public.lifecycle_media_active(requested_bucket text, requested_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE media text := '/api/storage/' || requested_bucket || '/' || requested_path;
BEGIN
  IF split_part(requested_path,'/',1) <> auth.uid()::text OR NOT public.lifecycle_user_active() THEN RETURN false; END IF;
  IF requested_bucket = 'private-cheque-images' THEN
    RETURN EXISTS (SELECT 1 FROM public.cheques c WHERE c.deleted_at IS NULL
      AND public.lifecycle_entity_active('cheque',c.id,c.business_id) AND c.image_url = media);
  ELSIF requested_bucket = 'private-avatars' THEN
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND deleted_at IS NULL AND avatar_url = media)
      OR EXISTS (SELECT 1 FROM public.businesses WHERE user_id = auth.uid() AND deleted_at IS NULL AND logo_url = media)
      OR EXISTS (SELECT 1 FROM public.parties WHERE deleted_at IS NULL AND public.lifecycle_business_active(business_id) AND avatar_url = media);
  END IF;
  RETURN false;
END $$;
DROP POLICY "Users can read their private media" ON storage.objects;
DROP POLICY "Users can update their private media" ON storage.objects;
DROP POLICY "Users can delete their private media" ON storage.objects;
DROP POLICY "Users can upload their private media" ON storage.objects;
CREATE POLICY lifecycle_media_read ON storage.objects FOR SELECT TO authenticated
  USING (public.lifecycle_media_active(bucket_id,name));
CREATE POLICY lifecycle_media_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('private-cheque-images','private-avatars')
    AND split_part(name,'/',1) = auth.uid()::text AND public.lifecycle_user_active());
