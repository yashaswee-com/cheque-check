-- Profiles may only store IANA time zones that PostgreSQL recognises by name,
-- so reminder scheduling (which joins notification_time_zones by name) never
-- silently skips a user. Only changed values are checked; existing rows keep
-- their stored value until the user picks a supported one.
CREATE FUNCTION public.profile_time_zone_valid()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.time_zone IS NOT DISTINCT FROM OLD.time_zone THEN
    RETURN NEW;
  END IF;
  IF NEW.time_zone IS NULL OR btrim(NEW.time_zone) = ''
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'invalid_time_zone' USING ERRCODE = '22023',
      DETAIL = 'Choose a supported time zone.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_time_zone_valid
  BEFORE INSERT OR UPDATE OF time_zone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_time_zone_valid();
