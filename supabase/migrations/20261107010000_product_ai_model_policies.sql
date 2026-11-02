-- Free is a catalog reference, not a payment or a Premium entitlement.
ALTER TABLE public.payment_products
  ADD COLUMN is_free boolean NOT NULL DEFAULT false,
  DROP CONSTRAINT payment_products_amount_check,
  ADD CONSTRAINT payment_products_price_check CHECK (
    (NOT is_free AND amount > 0) OR
    (is_free AND amount = 0 AND NOT active AND transaction_type = 'lifetime'
      AND feature_id = 'ai_scan' AND required_entitlement_id IS NULL
      AND quota_feature_id IS NULL AND quota_increment IS NULL)
  );
CREATE UNIQUE INDEX payment_products_one_free_idx ON public.payment_products(is_free) WHERE is_free;
INSERT INTO public.payment_products(id, name, transaction_type, feature_id, amount, active, is_free)
VALUES ('free', 'Free', 'lifetime', 'ai_scan', 0, false, true);

ALTER TABLE public.ai_model_policies
  ADD COLUMN product_id text REFERENCES public.payment_products(id),
  ADD COLUMN priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10000);
UPDATE public.ai_model_policies SET
  product_id = CASE plan WHEN 'free' THEN 'free'
    WHEN 'ai_scanner' THEN 'ai_scanner_30d' WHEN 'lifetime' THEN 'lifetime_premium' END,
  priority = CASE plan WHEN 'ai_scanner' THEN 20 WHEN 'lifetime' THEN 10 ELSE 0 END;
ALTER TABLE public.ai_model_policies
  ALTER COLUMN product_id SET NOT NULL,
  DROP CONSTRAINT ai_model_policies_pkey,
  DROP COLUMN plan,
  ADD PRIMARY KEY (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_policies TO service_role;

-- One current product per feature entitlement, matching the existing billing model.
ALTER TABLE public.user_entitlements
  ADD COLUMN product_id text REFERENCES public.payment_products(id);
UPDATE public.user_entitlements e SET product_id = coalesce(
  (SELECT t.product_id FROM public.transactions t JOIN public.payment_products p ON p.id = t.product_id
    WHERE t.user_id = e.user_id AND t.feature_id = e.feature_id AND t.status = 'captured'
      AND p.feature_id = e.feature_id AND p.transaction_type IN ('lifetime','subscription')
    ORDER BY t.created_at DESC NULLS LAST, t.id DESC LIMIT 1),
  (SELECT p.id FROM public.payment_products p WHERE p.feature_id = e.feature_id
    AND NOT p.is_free AND p.transaction_type IN ('lifetime','subscription')
    ORDER BY p.created_at, p.id LIMIT 1)
);

CREATE FUNCTION public.validate_entitlement_product()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.product_id IS NULL THEN
    -- Preserve legacy/admin trials that intentionally have no payment record.
    SELECT p.id INTO NEW.product_id FROM public.payment_products p
      WHERE p.feature_id = NEW.feature_id AND NOT p.is_free
        AND p.transaction_type IN ('lifetime','subscription')
      ORDER BY p.created_at, p.id LIMIT 1;
  END IF;
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_products p WHERE p.id = NEW.product_id
      AND p.feature_id = NEW.feature_id AND NOT p.is_free
      AND p.transaction_type IN ('lifetime','subscription')
  ) THEN RAISE EXCEPTION 'Product does not match entitlement' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_entitlement_product BEFORE INSERT OR UPDATE ON public.user_entitlements
FOR EACH ROW EXECUTE FUNCTION public.validate_entitlement_product();

CREATE FUNCTION public.capture_entitlement_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'captured' AND NEW.type IN ('lifetime','subscription')
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'captured') THEN
    UPDATE public.user_entitlements SET product_id = NEW.product_id
      WHERE user_id = NEW.user_id AND feature_id = NEW.feature_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER capture_entitlement_product AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_entitlement_product();

CREATE FUNCTION public.reject_free_product_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_products WHERE id = NEW.product_id AND is_free) THEN
    RAISE EXCEPTION 'Free catalog product is not purchasable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_free_product_transaction BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.reject_free_product_payment();
CREATE TRIGGER reject_free_product_checkout BEFORE INSERT OR UPDATE ON public.payment_checkouts
FOR EACH ROW EXECUTE FUNCTION public.reject_free_product_payment();

CREATE FUNCTION public.validate_ai_product_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_products p WHERE p.id = NEW.product_id
    AND ((p.is_free AND NEW.priority = 0) OR
      (NOT p.is_free AND p.transaction_type IN ('lifetime','subscription') AND NEW.priority > 0))) THEN
    RAISE EXCEPTION 'AI policy requires Free or an entitlement product with a positive priority'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_ai_product_policy BEFORE INSERT OR UPDATE ON public.ai_model_policies
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_product_policy();

DROP FUNCTION public.resolve_ai_scan_model();
CREATE FUNCTION public.resolve_ai_scan_model()
RETURNS TABLE(product_id text, model text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.lifecycle_user_active() THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, policy.model FROM public.ai_model_policies policy
    JOIN public.payment_products p ON p.id = policy.product_id
    WHERE p.is_free OR (
      p.transaction_type IN ('lifetime','subscription') AND EXISTS (
        SELECT 1 FROM public.user_entitlements e WHERE e.user_id = auth.uid()
          AND e.product_id = p.id AND e.feature_id = p.feature_id
          AND ((e.status = 'active' AND
            ((e.valid_until IS NULL AND p.transaction_type = 'lifetime')
              OR (e.valid_until IS NOT NULL AND isfinite(e.valid_until) AND e.valid_until > now())))
            OR (e.status = 'trialing' AND e.valid_until IS NOT NULL
              AND isfinite(e.valid_until) AND e.valid_until > now()))
      )
    )
    ORDER BY policy.priority DESC, p.id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No eligible AI model policy configured' USING ERRCODE = 'P0002';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.resolve_ai_scan_model() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_ai_scan_model() TO authenticated;
REVOKE ALL ON FUNCTION public.validate_entitlement_product(),
  public.capture_entitlement_product(), public.reject_free_product_payment(),
  public.validate_ai_product_policy() FROM PUBLIC, anon, authenticated;
