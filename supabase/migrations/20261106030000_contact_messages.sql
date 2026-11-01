CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.contact_message_rate_limits (
  address_hash TEXT NOT NULL CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL CHECK (request_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (address_hash, window_started_at)
);

CREATE INDEX contact_message_rate_limits_expiry_idx
  ON public.contact_message_rate_limits (window_started_at);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_message_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contact_messages, public.contact_message_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_messages, public.contact_message_rate_limits
  TO service_role;

CREATE FUNCTION public.submit_contact_message(
  requested_name TEXT,
  requested_email TEXT,
  requested_message TEXT,
  requested_address_hash TEXT,
  request_limit INT,
  window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_window TIMESTAMPTZ;
  allowed BOOLEAN;
BEGIN
  IF char_length(requested_name) NOT BETWEEN 1 AND 100
    OR char_length(requested_email) NOT BETWEEN 3 AND 254
    OR char_length(requested_message) NOT BETWEEN 10 AND 5000
    OR requested_address_hash !~ '^[0-9a-f]{64}$'
    OR request_limit <> 3
    OR window_seconds <> 3600 THEN
    RAISE EXCEPTION 'Invalid contact submission' USING ERRCODE = '22023';
  END IF;

  current_window := to_timestamp(
    FLOOR(EXTRACT(EPOCH FROM NOW()) / window_seconds) * window_seconds
  );

  DELETE FROM public.contact_message_rate_limits
  WHERE window_started_at < NOW() - INTERVAL '2 days';

  INSERT INTO public.contact_message_rate_limits (
    address_hash,
    window_started_at,
    request_count
  )
  VALUES (requested_address_hash, current_window, 1)
  ON CONFLICT (address_hash, window_started_at) DO UPDATE
    SET request_count = public.contact_message_rate_limits.request_count + 1,
        updated_at = NOW()
    WHERE public.contact_message_rate_limits.request_count < request_limit
  RETURNING TRUE INTO allowed;

  IF NOT COALESCE(allowed, FALSE) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.contact_messages (name, email, message)
  VALUES (trim(requested_name), lower(trim(requested_email)), trim(requested_message));

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, INT, INT)
  TO service_role;
