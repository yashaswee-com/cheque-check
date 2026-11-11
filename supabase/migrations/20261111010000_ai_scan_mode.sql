ALTER TABLE public.profiles
  ADD COLUMN ai_scan_enabled boolean NOT NULL DEFAULT true;

CREATE FUNCTION public.validate_ai_scan_enable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.ai_scan_enabled AND NOT OLD.ai_scan_enabled AND NOT EXISTS (
    SELECT 1 FROM public.user_quotas
    WHERE user_id = NEW.user_id AND feature_id = 'ai_scan'
      AND used < "limit" AND (reset_at IS NULL OR reset_at > now())
  ) THEN
    RAISE EXCEPTION 'AI scan access with available credits is required'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_ai_scan_enable
BEFORE UPDATE OF ai_scan_enabled ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_scan_enable();

REVOKE ALL ON FUNCTION public.validate_ai_scan_enable() FROM PUBLIC, anon, authenticated;
