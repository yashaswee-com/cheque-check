-- FCM registration tokens can contain a colon in the endpoint path.
CREATE OR REPLACE FUNCTION public.register_push_subscription(requested_endpoint text,requested_p256dh text,requested_auth text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.push_subscriptions; result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF requested_endpoint IS NULL OR length(requested_endpoint)>2048 OR requested_endpoint !~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/:?=&%+.-]+$'
    OR requested_p256dh IS NULL OR requested_p256dh !~ '^B[A-Za-z0-9_-]{86}$'
    OR requested_auth IS NULL OR requested_auth !~ '^[A-Za-z0-9_-]{22}$'
  THEN RAISE EXCEPTION 'Invalid push subscription' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  SELECT * INTO existing FROM public.push_subscriptions WHERE endpoint=requested_endpoint;
  IF FOUND AND existing.user_id<>auth.uid() THEN
    RAISE EXCEPTION 'Subscription belongs to another account; unsubscribe this browser first' USING ERRCODE='42501';
  END IF;
  IF existing.id IS NULL AND (SELECT count(*) FROM public.push_subscriptions WHERE user_id=auth.uid())>=10 THEN
    RAISE EXCEPTION 'Maximum of 10 push devices reached' USING ERRCODE='54000';
  END IF;
  INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth)
    VALUES(auth.uid(),requested_endpoint,requested_p256dh,requested_auth)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,last_seen_at=now()
      WHERE push_subscriptions.user_id=auth.uid() RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Subscription ownership changed' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET push_enabled=true WHERE user_id=auth.uid();
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text,text,text) TO authenticated;
