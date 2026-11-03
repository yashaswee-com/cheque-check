-- Lets users choose how long the app may stay in the background before the PIN
-- is required again. No "immediately" option: native camera and file pickers
-- background the app, and locking on return would discard in-progress forms.
ALTER TABLE public.application_pins ADD COLUMN lock_timeout_seconds integer NOT NULL DEFAULT 60
  CHECK (lock_timeout_seconds IN (60,300,900,3600));

CREATE FUNCTION public.security_pin_timeout(requested_user uuid, requested_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF requested_seconds IS NULL OR requested_seconds NOT IN (60,300,900,3600) THEN
    RAISE EXCEPTION 'Invalid lock timeout' USING ERRCODE = '22023';
  END IF;
  UPDATE application_pins SET lock_timeout_seconds=requested_seconds
    WHERE user_id=requested_user AND digest IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE user_id=requested_user AND deleted_at IS NULL
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'PIN lock is not enabled'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.security_pin_timeout(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_pin_timeout(uuid,integer) TO service_role;
