ALTER FUNCTION public.free_plan_usage() RENAME TO free_plan_usage_internal;
REVOKE ALL ON FUNCTION public.free_plan_usage_internal() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.free_plan_usage()
RETURNS TABLE(unlimited boolean,cheques_used integer,cheques_limit integer,
  ai_scans_used integer,ai_scans_limit integer,voice_used integer,voice_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT * FROM public.free_plan_usage_internal();
END $$;
REVOKE ALL ON FUNCTION public.free_plan_usage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.free_plan_usage() TO authenticated;
