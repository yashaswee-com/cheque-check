-- Authenticated API calls and anonymous contact submissions share storage,
-- but never share identity namespaces or client-write permissions.
ALTER TABLE public.api_rate_limits
  DROP CONSTRAINT api_rate_limits_pkey,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN address_hash text,
  ADD COLUMN subject_key text GENERATED ALWAYS AS (
    CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id::text
      ELSE 'address:' || address_hash END
  ) STORED,
  ADD CONSTRAINT api_rate_limits_subject_check CHECK (
    (user_id IS NOT NULL AND address_hash IS NULL)
    OR (user_id IS NULL AND address_hash IS NOT NULL
      AND address_hash ~ '^[0-9a-f]{64}$' AND endpoint = 'contact-message')
  ),
  ADD PRIMARY KEY (subject_key, endpoint, window_started_at),
  ADD CONSTRAINT api_rate_limits_user_window_key UNIQUE (user_id, endpoint, window_started_at);

CREATE UNIQUE INDEX api_rate_limits_address_window_key
  ON public.api_rate_limits(address_hash, endpoint, window_started_at)
  WHERE address_hash IS NOT NULL;
CREATE INDEX api_rate_limits_address_expiry_idx
  ON public.api_rate_limits(window_started_at) WHERE address_hash IS NOT NULL;

REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

INSERT INTO public.api_rate_limits(address_hash, endpoint, window_started_at, request_count, created_at, updated_at)
SELECT address_hash, 'contact-message', window_started_at, request_count, created_at, updated_at
FROM public.contact_message_rate_limits;

CREATE OR REPLACE FUNCTION public.submit_contact_message(
  requested_name text, requested_email text, requested_message text,
  requested_address_hash text, request_limit int, window_seconds int
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_window timestamptz; allowed boolean;
BEGIN
  IF requested_name IS NULL OR requested_email IS NULL OR requested_message IS NULL
    OR requested_address_hash IS NULL OR request_limit IS DISTINCT FROM 3
    OR window_seconds IS DISTINCT FROM 3600
    OR char_length(trim(requested_name)) NOT BETWEEN 1 AND 100
    OR char_length(trim(requested_email)) NOT BETWEEN 3 AND 254
    OR char_length(trim(requested_message)) NOT BETWEEN 10 AND 5000
    OR requested_address_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid contact submission' USING ERRCODE = '22023';
  END IF;
  current_window := to_timestamp(floor(extract(epoch FROM now()) / window_seconds) * window_seconds);
  DELETE FROM public.api_rate_limits
    WHERE address_hash IS NOT NULL AND window_started_at < now() - interval '2 days';
  INSERT INTO public.api_rate_limits(address_hash, endpoint, window_started_at, request_count)
  VALUES (requested_address_hash, 'contact-message', current_window, 1)
  ON CONFLICT (address_hash, endpoint, window_started_at) WHERE address_hash IS NOT NULL
  DO UPDATE SET request_count = public.api_rate_limits.request_count + 1, updated_at = now()
    WHERE public.api_rate_limits.request_count < request_limit
  RETURNING true INTO allowed;
  IF NOT coalesce(allowed, false) THEN RETURN false; END IF;
  INSERT INTO public.contact_messages(name, email, message)
    VALUES (trim(requested_name), lower(trim(requested_email)), trim(requested_message));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.submit_contact_message(text,text,text,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text,text,text,text,int,int) TO service_role;
DROP TABLE public.contact_message_rate_limits;
