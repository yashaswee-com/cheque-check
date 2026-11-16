CREATE TABLE public.feedback_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.feedback_items(id) ON DELETE CASCADE,
  filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain')),
  content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 10485760)
);

CREATE INDEX feedback_attachments_feedback_idx ON public.feedback_attachments(feedback_id);
ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_attachments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.feedback_attachments TO service_role;

CREATE FUNCTION public.submit_feedback_with_attachments(
  requested_category TEXT, requested_title TEXT, requested_description TEXT,
  requested_attachments JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_user_id UUID := auth.uid();
  item_id UUID;
  attachment JSONB;
  bytes BYTEA;
  mime TEXT;
  filename TEXT;
  total_bytes INTEGER := 0;
BEGIN
  IF current_user_id IS NULL OR NOT public.lifecycle_user_active(current_user_id) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(requested_attachments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(requested_attachments) > 2
    OR length(requested_attachments::text) > 14000000 THEN
    RAISE EXCEPTION 'Invalid feedback attachments' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.feedback_items(user_id, category, title, description)
    VALUES (current_user_id, requested_category, requested_title, requested_description)
    RETURNING id INTO item_id;

  FOR attachment IN SELECT value FROM jsonb_array_elements(requested_attachments)
  LOOP
    filename := attachment->>'name';
    mime := attachment->>'type';
    IF jsonb_typeof(attachment) <> 'object' OR filename IS NULL
      OR char_length(filename) NOT BETWEEN 1 AND 255
      OR filename ~ '[[:cntrl:]]'
      OR mime IS NULL OR mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain')
      OR attachment->>'data' IS NULL OR length(attachment->>'data') > 13981016 THEN
      RAISE EXCEPTION 'Invalid feedback attachment' USING ERRCODE = '22023';
    END IF;
    bytes := decode(attachment->>'data', 'base64');
    total_bytes := total_bytes + octet_length(bytes);
    IF octet_length(bytes) = 0 OR total_bytes > 10485760
      OR (mime = 'image/jpeg' AND substring(bytes FROM 1 FOR 3) <> decode('ffd8ff','hex'))
      OR (mime = 'image/png' AND substring(bytes FROM 1 FOR 8) <> decode('89504e470d0a1a0a','hex'))
      OR (mime = 'image/webp' AND (substring(bytes FROM 1 FOR 4) <> decode('52494646','hex') OR substring(bytes FROM 9 FOR 4) <> decode('57454250','hex')))
      OR (mime = 'application/pdf' AND substring(bytes FROM 1 FOR 5) <> decode('255044462d','hex')) THEN
      RAISE EXCEPTION 'Invalid feedback attachment content' USING ERRCODE = '22023';
    END IF;
    IF mime = 'text/plain' THEN
      PERFORM convert_from(bytes, 'UTF8');
    END IF;
    INSERT INTO public.feedback_attachments(feedback_id, filename, mime_type, content)
      VALUES (item_id, filename, mime, bytes);
  END LOOP;
  RETURN item_id;
END;
$$;

CREATE FUNCTION public.list_my_feedback_attachments(requested_ids UUID[])
RETURNS TABLE(id UUID, feedback_id UUID, filename TEXT, mime_type TEXT, size_bytes INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.feedback_id, a.filename, a.mime_type, octet_length(a.content)
  FROM public.feedback_attachments a JOIN public.feedback_items f ON f.id = a.feedback_id
  WHERE f.user_id = auth.uid() AND public.lifecycle_user_active(auth.uid())
    AND f.id = ANY(requested_ids) AND cardinality(requested_ids) <= 50;
$$;

CREATE FUNCTION public.read_my_feedback_attachment(requested_id UUID)
RETURNS TABLE(filename TEXT, mime_type TEXT, data TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.filename, a.mime_type, encode(a.content, 'base64')
  FROM public.feedback_attachments a JOIN public.feedback_items f ON f.id = a.feedback_id
  WHERE a.id = requested_id AND f.user_id = auth.uid() AND public.lifecycle_user_active(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.submit_feedback_with_attachments(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_feedback_attachments(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_my_feedback_attachment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_feedback_with_attachments(TEXT,TEXT,TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_feedback_attachments(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_feedback_attachment(UUID) TO authenticated;
