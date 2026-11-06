CREATE TABLE public.cheque_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cheque_id uuid NOT NULL REFERENCES public.cheques(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'admin', 'system')),
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'updated',
      'status_changed',
      'tags_changed',
      'image_changed',
      'deleted',
      'restored'
    )
  ),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cheque_audit_events_cheque_created_idx
  ON public.cheque_audit_events (cheque_id, created_at DESC);

CREATE INDEX cheque_audit_events_business_created_idx
  ON public.cheque_audit_events (business_id, created_at DESC);

ALTER TABLE public.cheque_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cheque_audit_events_select_policy
  ON public.cheque_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = cheque_audit_events.business_id
        AND b.user_id = auth.uid()
    )
  );

CREATE POLICY cheque_audit_events_block_insert_policy
  ON public.cheque_audit_events
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY cheque_audit_events_block_update_policy
  ON public.cheque_audit_events
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY cheque_audit_events_block_delete_policy
  ON public.cheque_audit_events
  FOR DELETE
  USING (false);

CREATE OR REPLACE FUNCTION public.record_cheque_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_uuid uuid := auth.uid();
  actor_type text := CASE WHEN actor_uuid IS NOT NULL THEN 'user' ELSE 'system' END;
  audit_changes jsonb := '[]'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cheque_audit_events (
      cheque_id,
      business_id,
      actor_id,
      actor_kind,
      event_type,
      changes
    )
    VALUES (
      NEW.id,
      NEW.business_id,
      actor_uuid,
      actor_type,
      'created',
      jsonb_build_array(
        jsonb_build_object('field', 'record', 'before', NULL, 'after', 'created')
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_draft = false AND COALESCE(OLD.is_draft, false) = true THEN
      INSERT INTO public.cheque_audit_events (
        cheque_id,
        business_id,
        actor_id,
        actor_kind,
        event_type,
        changes
      )
      VALUES (
        NEW.id,
        NEW.business_id,
        actor_uuid,
        actor_type,
        'created',
        jsonb_build_array(
          jsonb_build_object('field', 'record', 'before', NULL, 'after', 'published')
        )
      );
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.cheque_audit_events (
        cheque_id,
        business_id,
        actor_id,
        actor_kind,
        event_type,
        changes
      )
      VALUES (
        NEW.id,
        NEW.business_id,
        actor_uuid,
        actor_type,
        'status_changed',
        jsonb_build_array(
          jsonb_build_object(
            'field', 'status',
            'before', OLD.status,
            'after', NEW.status
          )
        )
      );
    END IF;

    IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
      INSERT INTO public.cheque_audit_events (
        cheque_id,
        business_id,
        actor_id,
        actor_kind,
        event_type,
        changes
      )
      VALUES (
        NEW.id,
        NEW.business_id,
        actor_uuid,
        actor_type,
        'image_changed',
        jsonb_build_array(
          jsonb_build_object(
            'field', 'image_url',
            'before', OLD.image_url,
            'after', NEW.image_url
          )
        )
      );
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      INSERT INTO public.cheque_audit_events (
        cheque_id,
        business_id,
        actor_id,
        actor_kind,
        event_type,
        changes
      )
      VALUES (
        NEW.id,
        NEW.business_id,
        actor_uuid,
        actor_type,
        CASE WHEN NEW.deleted_at IS NOT NULL THEN 'deleted' ELSE 'restored' END,
        jsonb_build_array(
          jsonb_build_object(
            'field', 'deleted_at',
            'before', OLD.deleted_at,
            'after', NEW.deleted_at
          )
        )
      );
    END IF;

    IF NEW.amount IS DISTINCT FROM OLD.amount THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'amount',
          'before', OLD.amount,
          'after', NEW.amount
        )
      );
    END IF;

    IF NEW.cheque_number IS DISTINCT FROM OLD.cheque_number THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'cheque_number',
          'before', OLD.cheque_number,
          'after', NEW.cheque_number
        )
      );
    END IF;

    IF NEW.cheque_date IS DISTINCT FROM OLD.cheque_date THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'cheque_date',
          'before', OLD.cheque_date,
          'after', NEW.cheque_date
        )
      );
    END IF;

    IF NEW.deposit_date IS DISTINCT FROM OLD.deposit_date THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'deposit_date',
          'before', OLD.deposit_date,
          'after', NEW.deposit_date
        )
      );
    END IF;

    IF NEW.party_id IS DISTINCT FROM OLD.party_id THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'party_id',
          'before', OLD.party_id,
          'after', NEW.party_id
        )
      );
    END IF;

    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'account_id',
          'before', OLD.account_id,
          'after', NEW.account_id
        )
      );
    END IF;

    IF NEW.type IS DISTINCT FROM OLD.type THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'type',
          'before', OLD.type,
          'after', NEW.type
        )
      );
    END IF;

    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      audit_changes := audit_changes || jsonb_build_array(
        jsonb_build_object(
          'field', 'notes',
          'before', OLD.notes,
          'after', NEW.notes
        )
      );
    END IF;

    IF jsonb_array_length(audit_changes) > 0 THEN
      INSERT INTO public.cheque_audit_events (
        cheque_id,
        business_id,
        actor_id,
        actor_kind,
        event_type,
        changes
      )
      VALUES (
        NEW.id,
        NEW.business_id,
        actor_uuid,
        actor_type,
        'updated',
        audit_changes
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cheque_audit_event_trigger
AFTER INSERT OR UPDATE OF
  amount,
  cheque_number,
  cheque_date,
  deposit_date,
  party_id,
  account_id,
  status,
  type,
  notes,
  image_url,
  deleted_at,
  is_draft
ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.record_cheque_audit_event();

CREATE FUNCTION public.get_cheque_audit_log(
  requested_cheque uuid,
  requested_limit integer DEFAULT 20,
  requested_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  cheque_id uuid,
  business_id uuid,
  actor_id uuid,
  actor_kind text,
  event_type text,
  changes jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.cheque_id,
    e.business_id,
    e.actor_id,
    e.actor_kind,
    e.event_type,
    e.changes,
    e.created_at
  FROM public.cheque_audit_events e
  WHERE e.cheque_id = requested_cheque
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT requested_limit
  OFFSET requested_offset;
$$;

REVOKE ALL ON FUNCTION public.get_cheque_audit_log(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cheque_audit_log(uuid, integer, integer) TO authenticated;
