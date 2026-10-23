-- Phone OTP authentication policy.
--
-- Supabase Auth remains the OTP/session authority. Hosted Auth settings have no
-- country allow-list, and the anon key is public, so a browser or route-level
-- check alone cannot stop a direct call to the Auth API. This trigger is the
-- database-level backstop: Auth cannot create a phone user or start a phone
-- change for anything other than an Indian (+91) mobile number. Auth stores
-- phone numbers as digits without the leading "+".
--
-- Provider-level geographic permissions (Twilio Geo Permissions) and Auth rate
-- limits/CAPTCHA are configured outside migrations; see docs/phone-auth.md.

CREATE OR REPLACE FUNCTION public.enforce_indian_auth_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone <> ''
     AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone)
     AND NEW.phone !~ '^\+?91[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Only Indian (+91) mobile numbers are supported'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.phone_change IS NOT NULL AND NEW.phone_change <> ''
     AND (TG_OP = 'INSERT' OR NEW.phone_change IS DISTINCT FROM OLD.phone_change)
     AND NEW.phone_change !~ '^\+?91[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Only Indian (+91) mobile numbers are supported'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_indian_auth_phone() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_indian_auth_phone() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS enforce_indian_auth_phone ON auth.users;
CREATE TRIGGER enforce_indian_auth_phone
  BEFORE INSERT OR UPDATE OF phone, phone_change ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_indian_auth_phone();