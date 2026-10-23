-- Lets the setup CLI provision the Vault entries pg_cron needs (project_url and
-- service_role_key) without anyone pasting SQL into the dashboard editor.
-- Secrets are never stored in a migration or in cron job text. Only the
-- service role can call these functions; the status function returns booleans.

CREATE OR REPLACE FUNCTION public.configure_cron_credentials(
  requested_project_url text,
  requested_service_role_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  entry record;
  existing uuid;
BEGIN
  IF requested_project_url !~ '^https://[a-z0-9-]+\.supabase\.(co|red)$'
     AND requested_project_url !~ '^http://(127\.0\.0\.1|localhost|host\.docker\.internal)(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'Invalid project URL' USING ERRCODE = '22023';
  END IF;
  IF coalesce(requested_service_role_key, '') = '' THEN
    RAISE EXCEPTION 'Service role key is required' USING ERRCODE = '22023';
  END IF;

  FOR entry IN
    SELECT * FROM (VALUES
      ('project_url', requested_project_url),
      ('service_role_key', requested_service_role_key)
    ) AS v(name, secret)
  LOOP
    SELECT id INTO existing FROM vault.secrets WHERE name = entry.name;
    IF existing IS NULL THEN
      PERFORM vault.create_secret(entry.secret, entry.name);
    ELSE
      PERFORM vault.update_secret(existing, entry.secret, entry.name);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_credentials_status()
RETURNS TABLE (project_url boolean, service_role_key boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
  SELECT
    EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url'),
    EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key');
$$;

REVOKE ALL ON FUNCTION public.configure_cron_credentials(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_credentials_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_cron_credentials(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_credentials_status() TO service_role;