-- Plan -> OCR model mapping, editable without a deploy. Only the server-side
-- resolver reads it; clients never choose a model.
CREATE TABLE public.ai_model_policies (
  plan text PRIMARY KEY CHECK (plan IN ('free', 'ai_scanner', 'lifetime')),
  model text NOT NULL CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_model_policies(plan, model) VALUES
  ('free', 'gpt-4o-mini'),
  ('ai_scanner', 'gpt-4o'),
  ('lifetime', 'gpt-4o');

ALTER TABLE public.ai_model_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_model_policies FROM anon, authenticated;

-- The AI-specific subscription takes precedence over Lifetime Premium so a
-- dedicated scanner model can be configured independently.
CREATE FUNCTION public.resolve_ai_scan_model()
RETURNS TABLE(plan text, model text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH caller_plan AS (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM public.user_entitlements e
        WHERE e.user_id = auth.uid() AND e.feature_id = 'ai_scanner_sub'
          AND (
            (e.status = 'active' AND (e.valid_until IS NULL OR (isfinite(e.valid_until) AND e.valid_until > now())))
            OR (e.status = 'trialing' AND e.valid_until IS NOT NULL AND isfinite(e.valid_until) AND e.valid_until > now())
          )
      ) THEN 'ai_scanner'
      WHEN public.has_lifetime_premium() THEN 'lifetime'
      ELSE 'free'
    END AS plan
  )
  SELECT c.plan, coalesce(p.model, f.model, 'gpt-4o-mini')
  FROM caller_plan c
  LEFT JOIN public.ai_model_policies p ON p.plan = c.plan
  LEFT JOIN public.ai_model_policies f ON f.plan = 'free'
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.resolve_ai_scan_model() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_ai_scan_model() TO authenticated;
