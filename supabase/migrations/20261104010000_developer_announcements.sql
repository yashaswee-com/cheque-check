CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK(version>0),
  author text NOT NULL CHECK(length(author) BETWEEN 1 AND 120),
  content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'
    AND content ?& ARRAY['en','hi','hi-en']),
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz CHECK(expires_at>publish_at)
);
CREATE INDEX announcements_published_idx ON public.announcements(publish_at DESC,id DESC);
CREATE TABLE public.announcement_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,announcement_id)
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements,public.announcement_reads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.announcements,public.announcement_reads TO service_role;
CREATE FUNCTION public.latest_developer_message() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('id',a.id,'version',a.version,'author',a.author,'content',a.content,
    'read',EXISTS(SELECT 1 FROM public.announcement_reads r WHERE r.user_id=auth.uid() AND r.announcement_id=a.id))
    INTO result FROM public.announcements a WHERE a.publish_at<=now() AND (a.expires_at IS NULL OR a.expires_at>now())
    ORDER BY a.publish_at DESC,a.id DESC LIMIT 1;
  RETURN result;
END $$;
CREATE FUNCTION public.acknowledge_developer_message(requested_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.announcements WHERE id=requested_id AND publish_at<=now()
    AND (expires_at IS NULL OR expires_at>now())) THEN
    RAISE EXCEPTION 'Announcement unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.announcement_reads(user_id,announcement_id) VALUES(auth.uid(),requested_id)
    ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.latest_developer_message(),public.acknowledge_developer_message(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.latest_developer_message(),public.acknowledge_developer_message(uuid) TO authenticated;
INSERT INTO public.announcements(version,author,content) VALUES(1,'The ChequeCheck team',
  jsonb_build_object(
    'en','Welcome to ChequeCheck. We built this app to make tracking cheques simpler. Thank you for using it and helping us improve.',
    'hi','ChequeCheck में आपका स्वागत है। हमने चेक ट्रैकिंग आसान बनाने के लिए यह ऐप बनाया है। इसे इस्तेमाल करने और बेहतर बनाने में मदद के लिए धन्यवाद।',
    'hi-en','ChequeCheck mein aapka swagat hai. Humne cheque tracking aasaan banane ke liye yeh app banaya hai. Ise use karne aur behtar banane mein madad ke liye dhanyavaad.'
  ));
