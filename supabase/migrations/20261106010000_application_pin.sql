CREATE TABLE public.application_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest text CHECK (digest IS NULL OR digest ~ '^[0-9a-f]{64}$'),
  salt text CHECK (salt IS NULL OR salt ~ '^[0-9a-f]{64}$'),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 5),
  proof_digest text CHECK (proof_digest IS NULL OR proof_digest ~ '^[0-9a-f]{64}$'),
  proof_expires_at timestamptz,
  CHECK ((digest IS NULL) = (salt IS NULL))
);
ALTER TABLE public.application_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_pins FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.application_pins TO service_role;

CREATE FUNCTION public.security_pin_proof(requested_user uuid, requested_proof text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF requested_proof IS NULL OR requested_proof !~ '^[0-9a-f]{64}$' OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id=requested_user AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Invalid proof owner'; END IF;
  INSERT INTO application_pins(user_id,proof_digest,proof_expires_at)
    VALUES(requested_user,requested_proof,clock_timestamp()+interval '5 minutes')
  ON CONFLICT(user_id) DO UPDATE SET proof_digest=EXCLUDED.proof_digest,
    proof_expires_at=EXCLUDED.proof_expires_at;
END $$;

CREATE FUNCTION public.security_pin_manage(requested_user uuid, requested_proof text,
  requested_digest text DEFAULT NULL, requested_salt text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pin application_pins%ROWTYPE;
BEGIN
  SELECT * INTO pin FROM application_pins WHERE user_id=requested_user FOR UPDATE;
  IF NOT FOUND OR requested_proof IS NULL OR pin.proof_digest IS NULL OR
    pin.proof_digest<>requested_proof OR pin.proof_expires_at IS NULL OR
    pin.proof_expires_at<=clock_timestamp() OR NOT EXISTS (
      SELECT 1 FROM profiles WHERE user_id=requested_user AND deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'Fresh authentication required'; END IF;
  UPDATE application_pins SET digest=requested_digest,salt=requested_salt,
    revision=gen_random_uuid(),failures=0,proof_digest=NULL,proof_expires_at=NULL
    WHERE user_id=requested_user;
END $$;

CREATE FUNCTION public.security_pin_check(requested_user uuid, requested_digest text, requested_revision uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pin application_pins%ROWTYPE;
BEGIN
  SELECT * INTO pin FROM application_pins WHERE user_id=requested_user FOR UPDATE;
  IF NOT FOUND OR pin.digest IS NULL OR pin.revision IS DISTINCT FROM requested_revision OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id=requested_user AND deleted_at IS NULL
  ) THEN RETURN jsonb_build_object('status','changed'); END IF;
  IF pin.failures>=5 THEN RETURN jsonb_build_object('status','blocked','remaining',0); END IF;
  IF requested_digest IS NOT NULL AND pin.digest=requested_digest THEN
    UPDATE application_pins SET failures=0 WHERE user_id=requested_user;
    RETURN jsonb_build_object('status','unlocked','revision',pin.revision);
  END IF;
  UPDATE application_pins SET failures=failures+1 WHERE user_id=requested_user;
  RETURN jsonb_build_object('status',CASE WHEN pin.failures+1>=5 THEN 'blocked' ELSE 'incorrect' END,
    'remaining',4-pin.failures);
END $$;
REVOKE ALL ON FUNCTION public.security_pin_proof(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.security_pin_manage(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.security_pin_check(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_pin_proof(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_pin_manage(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_pin_check(uuid,text,uuid) TO service_role;
