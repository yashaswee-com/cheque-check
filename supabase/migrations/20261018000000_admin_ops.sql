-- Admin operations backing the ops CLI (scripts/cli.ts, `npm run ops`).
--
-- 1. admin_audit_log: append-only record of every support/admin mutation
--    (who, what, target, before/after, reason). Never exposed to app users.
-- 2. Atomic, service-role-only RPCs for entitlement/quota grants and refunds,
--    each writing its own audit row in the same transaction so a grant can
--    never succeed without being audited (or vice versa).
--
-- Admin grants are recorded as ₹0 captured transactions with `admin_`
-- prefixed Razorpay ids so they show in the user's purchase history while
-- remaining distinguishable from real payments.

CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator TEXT NOT NULL CHECK (length(trim(operator)) > 0),
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  before JSONB,
  after JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_user_idx ON public.admin_audit_log (target_user_id, created_at DESC);
CREATE INDEX admin_audit_log_action_idx ON public.admin_audit_log (action, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;

-- Internal helpers -----------------------------------------------------------

CREATE FUNCTION public.admin_assert_context(p_user_id UUID, p_operator TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_operator IS NULL OR length(trim(p_operator)) = 0 THEN
    RAISE EXCEPTION 'Operator is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User % does not exist', p_user_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.admin_write_audit(
  p_operator TEXT,
  p_action TEXT,
  p_target_user_id UUID,
  p_target_type TEXT,
  p_target_id TEXT,
  p_reason TEXT,
  p_before JSONB,
  p_after JSONB,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO admin_audit_log (
    operator, action, target_user_id, target_type, target_id,
    reason, before, after, metadata
  )
  VALUES (
    p_operator, p_action, p_target_user_id, p_target_type, p_target_id,
    nullif(trim(p_reason), ''), p_before, p_after, coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO audit_id;
  RETURN audit_id;
END;
$$;

CREATE FUNCTION public.admin_record_grant_transaction(p_user_id UUID, p_product_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product payment_products%ROWTYPE;
  grant_ref TEXT := gen_random_uuid()::text;
  transaction_id UUID;
BEGIN
  SELECT * INTO product FROM payment_products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment product %', p_product_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO transactions (
    user_id, razorpay_order_id, razorpay_payment_id, amount, currency,
    status, type, feature_id, product_id
  )
  VALUES (
    p_user_id, 'admin_order_' || grant_ref, 'admin_pay_' || grant_ref, 0,
    product.currency, 'captured', product.transaction_type, product.feature_id,
    product.id
  )
  RETURNING id INTO transaction_id;
  RETURN transaction_id;
END;
$$;

-- Entitlements ---------------------------------------------------------------

-- Sets an on/off entitlement (Lifetime Premium or a subscription flag) to an
-- explicit state. Used for lifetime grants, trials, pause/resume/cancel,
-- revoke, and expiry changes. Quotas are managed separately.
CREATE FUNCTION public.admin_set_entitlement(
  p_user_id UUID,
  p_feature_id feature_type,
  p_status entitlement_status,
  p_valid_until TIMESTAMPTZ,
  p_operator TEXT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_record_transaction BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row user_entitlements%ROWTYPE;
  after_row user_entitlements%ROWTYPE;
  product_id TEXT;
  transaction_id UUID;
  audit_id UUID;
BEGIN
  PERFORM admin_assert_context(p_user_id, p_operator);

  IF p_feature_id NOT IN ('lifetime_premium', 'ai_scanner_sub', 'voice_reminder_sub') THEN
    RAISE EXCEPTION '% is a metered quota, not an entitlement', p_feature_id
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'trialing' AND (p_valid_until IS NULL OR p_valid_until <= NOW()) THEN
    RAISE EXCEPTION 'A trial requires a future end date' USING ERRCODE = '22023';
  END IF;

  IF p_status IN ('active', 'trialing') AND p_valid_until IS NOT NULL
    AND p_valid_until <= NOW() THEN
    RAISE EXCEPTION 'Expiry must be in the future for an active grant'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row FROM user_entitlements
  WHERE user_id = p_user_id AND feature_id = p_feature_id
  FOR UPDATE;

  INSERT INTO user_entitlements (user_id, feature_id, status, valid_until)
  VALUES (p_user_id, p_feature_id, p_status, p_valid_until)
  ON CONFLICT (user_id, feature_id) DO UPDATE
    SET status = EXCLUDED.status,
        valid_until = EXCLUDED.valid_until,
        updated_at = NOW()
  RETURNING * INTO after_row;

  IF p_record_transaction THEN
    SELECT id INTO product_id FROM payment_products
    WHERE feature_id = p_feature_id
      AND transaction_type IN ('lifetime', 'subscription')
    ORDER BY active DESC, id
    LIMIT 1;
    IF product_id IS NULL THEN
      RAISE EXCEPTION 'No payment product exists for %', p_feature_id
        USING ERRCODE = '22023';
    END IF;
    transaction_id := admin_record_grant_transaction(p_user_id, product_id);
  END IF;

  audit_id := admin_write_audit(
    p_operator, p_action, p_user_id, 'user_entitlement', after_row.id::text,
    p_reason,
    CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    to_jsonb(after_row),
    jsonb_build_object('transaction_id', transaction_id)
  );

  RETURN jsonb_build_object(
    'before', CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    'after', to_jsonb(after_row),
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
END;
$$;

-- Grants or extends a 30-day-style subscription and its quota pool. Extends
-- from the current expiry when still active; carries over remaining quota
-- (same rule as fulfill_payment_order) only if the pool has not expired.
CREATE FUNCTION public.admin_grant_subscription(
  p_user_id UUID,
  p_feature_id feature_type,
  p_days INT,
  p_quota INT,
  p_operator TEXT,
  p_reason TEXT DEFAULT NULL,
  p_record_transaction BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product payment_products%ROWTYPE;
  before_entitlement user_entitlements%ROWTYPE;
  after_entitlement user_entitlements%ROWTYPE;
  before_quota user_quotas%ROWTYPE;
  after_quota user_quotas%ROWTYPE;
  base_time TIMESTAMPTZ := NOW();
  new_expiry TIMESTAMPTZ;
  remaining INT := 0;
  transaction_id UUID;
  audit_id UUID;
BEGIN
  PERFORM admin_assert_context(p_user_id, p_operator);

  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'Days must be a positive number' USING ERRCODE = '22023';
  END IF;
  IF p_quota IS NULL OR p_quota < 0 THEN
    RAISE EXCEPTION 'Quota must be zero or more' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO product FROM payment_products
  WHERE feature_id = p_feature_id AND transaction_type = 'subscription'
  ORDER BY active DESC, id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% is not a subscription feature', p_feature_id
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_entitlement FROM user_entitlements
  WHERE user_id = p_user_id AND feature_id = p_feature_id
  FOR UPDATE;

  IF before_entitlement.id IS NOT NULL
    AND before_entitlement.status = 'active'
    AND before_entitlement.valid_until IS NOT NULL
    AND before_entitlement.valid_until > NOW() THEN
    base_time := before_entitlement.valid_until;
  END IF;
  new_expiry := base_time + make_interval(days => p_days);

  INSERT INTO user_entitlements (user_id, feature_id, status, valid_until)
  VALUES (p_user_id, p_feature_id, 'active', new_expiry)
  ON CONFLICT (user_id, feature_id) DO UPDATE
    SET status = 'active', valid_until = EXCLUDED.valid_until, updated_at = NOW()
  RETURNING * INTO after_entitlement;

  SELECT * INTO before_quota FROM user_quotas
  WHERE user_id = p_user_id AND feature_id = product.quota_feature_id
  FOR UPDATE;

  IF before_quota.id IS NOT NULL THEN
    IF before_quota.reset_at IS NULL OR before_quota.reset_at > NOW() THEN
      remaining := GREATEST(before_quota."limit" - before_quota.used, 0);
    END IF;
    UPDATE user_quotas
    SET used = 0,
        "limit" = remaining + p_quota,
        reset_at = new_expiry,
        updated_at = NOW()
    WHERE id = before_quota.id
    RETURNING * INTO after_quota;
  ELSE
    INSERT INTO user_quotas (user_id, feature_id, used, "limit", reset_at)
    VALUES (p_user_id, product.quota_feature_id, 0, p_quota, new_expiry)
    RETURNING * INTO after_quota;
  END IF;

  IF p_record_transaction THEN
    transaction_id := admin_record_grant_transaction(p_user_id, product.id);
  END IF;

  audit_id := admin_write_audit(
    p_operator, 'subscription.grant', p_user_id, 'user_entitlement',
    after_entitlement.id::text, p_reason,
    jsonb_build_object(
      'entitlement', CASE WHEN before_entitlement.id IS NULL THEN NULL ELSE to_jsonb(before_entitlement) END,
      'quota', CASE WHEN before_quota.id IS NULL THEN NULL ELSE to_jsonb(before_quota) END
    ),
    jsonb_build_object('entitlement', to_jsonb(after_entitlement), 'quota', to_jsonb(after_quota)),
    jsonb_build_object('days', p_days, 'quota', p_quota, 'transaction_id', transaction_id)
  );

  RETURN jsonb_build_object(
    'entitlement', to_jsonb(after_entitlement),
    'quota', to_jsonb(after_quota),
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
END;
$$;

-- Quotas ---------------------------------------------------------------------

-- Adds p_amount to the quota limit (used is untouched).
CREATE FUNCTION public.admin_topup_quota(
  p_user_id UUID,
  p_feature_id feature_type,
  p_amount INT,
  p_operator TEXT,
  p_reason TEXT DEFAULT NULL,
  p_record_transaction BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row user_quotas%ROWTYPE;
  after_row user_quotas%ROWTYPE;
  product_id TEXT;
  transaction_id UUID;
  audit_id UUID;
BEGIN
  PERFORM admin_assert_context(p_user_id, p_operator);

  IF p_feature_id NOT IN ('ai_scan', 'voice_reminder') THEN
    RAISE EXCEPTION '% is not a metered quota', p_feature_id USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be a positive number' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row FROM user_quotas
  WHERE user_id = p_user_id AND feature_id = p_feature_id
  FOR UPDATE;

  INSERT INTO user_quotas (user_id, feature_id, used, "limit")
  VALUES (p_user_id, p_feature_id, 0, p_amount)
  ON CONFLICT (user_id, feature_id) DO UPDATE
    SET "limit" = user_quotas."limit" + EXCLUDED."limit", updated_at = NOW()
  RETURNING * INTO after_row;

  IF p_record_transaction THEN
    SELECT id INTO product_id FROM payment_products
    WHERE transaction_type = 'top_up' AND quota_feature_id = p_feature_id
    ORDER BY active DESC, id
    LIMIT 1;
    IF product_id IS NULL THEN
      RAISE EXCEPTION 'No top-up product exists for %', p_feature_id
        USING ERRCODE = '22023';
    END IF;
    transaction_id := admin_record_grant_transaction(p_user_id, product_id);
  END IF;

  audit_id := admin_write_audit(
    p_operator, 'quota.topup', p_user_id, 'user_quota', after_row.id::text, p_reason,
    CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    to_jsonb(after_row),
    jsonb_build_object('amount', p_amount, 'transaction_id', transaction_id)
  );

  RETURN jsonb_build_object(
    'before', CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    'after', to_jsonb(after_row),
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
END;
$$;

-- Overwrites limit/used/reset_at (advanced correction tool).
CREATE FUNCTION public.admin_set_quota(
  p_user_id UUID,
  p_feature_id feature_type,
  p_limit INT,
  p_used INT,
  p_reset_at TIMESTAMPTZ,
  p_operator TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row user_quotas%ROWTYPE;
  after_row user_quotas%ROWTYPE;
  audit_id UUID;
BEGIN
  PERFORM admin_assert_context(p_user_id, p_operator);

  IF p_feature_id NOT IN ('ai_scan', 'voice_reminder') THEN
    RAISE EXCEPTION '% is not a metered quota', p_feature_id USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 0 OR p_used IS NULL OR p_used < 0 THEN
    RAISE EXCEPTION 'Limit and used must be zero or more' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row FROM user_quotas
  WHERE user_id = p_user_id AND feature_id = p_feature_id
  FOR UPDATE;

  INSERT INTO user_quotas (user_id, feature_id, used, "limit", reset_at)
  VALUES (p_user_id, p_feature_id, p_used, p_limit, p_reset_at)
  ON CONFLICT (user_id, feature_id) DO UPDATE
    SET used = EXCLUDED.used,
        "limit" = EXCLUDED."limit",
        reset_at = EXCLUDED.reset_at,
        updated_at = NOW()
  RETURNING * INTO after_row;

  audit_id := admin_write_audit(
    p_operator, 'quota.set', p_user_id, 'user_quota', after_row.id::text, p_reason,
    CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    to_jsonb(after_row)
  );

  RETURN jsonb_build_object(
    'before', CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,
    'after', to_jsonb(after_row),
    'audit_id', audit_id
  );
END;
$$;

-- Payments -------------------------------------------------------------------

-- Marks a captured Razorpay payment refunded (the money itself is refunded in
-- the Razorpay dashboard) and, when p_revoke, removes what it granted -
-- unless a newer captured purchase of the same feature has replaced it.
CREATE FUNCTION public.admin_refund_transaction(
  p_transaction_id UUID,
  p_operator TEXT,
  p_reason TEXT DEFAULT NULL,
  p_revoke BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx transactions%ROWTYPE;
  after_tx transactions%ROWTYPE;
  product payment_products%ROWTYPE;
  before_entitlement user_entitlements%ROWTYPE;
  after_entitlement user_entitlements%ROWTYPE;
  before_quota user_quotas%ROWTYPE;
  after_quota user_quotas%ROWTYPE;
  revoke_outcome TEXT := 'not_requested';
  audit_id UUID;
BEGIN
  SELECT * INTO tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % does not exist', p_transaction_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM admin_assert_context(tx.user_id, p_operator);

  IF tx.razorpay_order_id LIKE 'admin\_%' THEN
    RAISE EXCEPTION 'Admin grants are not payments; revoke them with the premium/quota commands instead'
      USING ERRCODE = '22023';
  END IF;
  IF tx.status <> 'captured' THEN
    RAISE EXCEPTION 'Only captured payments can be refunded (current status: %)', tx.status
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO product FROM payment_products WHERE id = tx.product_id;

  UPDATE transactions SET status = 'refunded', updated_at = NOW()
  WHERE id = tx.id
  RETURNING * INTO after_tx;

  IF p_revoke THEN
    IF tx.type IN ('lifetime', 'subscription') AND EXISTS (
      SELECT 1 FROM transactions newer
      WHERE newer.user_id = tx.user_id
        AND newer.feature_id = tx.feature_id
        AND newer.status = 'captured'
        AND newer.id <> tx.id
        AND newer.created_at > tx.created_at
    ) THEN
      revoke_outcome := 'skipped_newer_purchase';
    ELSE
      IF tx.type IN ('lifetime', 'subscription') THEN
        SELECT * INTO before_entitlement FROM user_entitlements
        WHERE user_id = tx.user_id AND feature_id = tx.feature_id
        FOR UPDATE;
        UPDATE user_entitlements
        SET status = 'canceled', updated_at = NOW()
        WHERE user_id = tx.user_id AND feature_id = tx.feature_id
        RETURNING * INTO after_entitlement;
      END IF;

      IF product.quota_feature_id IS NOT NULL AND product.quota_increment IS NOT NULL THEN
        SELECT * INTO before_quota FROM user_quotas
        WHERE user_id = tx.user_id AND feature_id = product.quota_feature_id
        FOR UPDATE;
        UPDATE user_quotas
        SET "limit" = GREATEST("limit" - product.quota_increment, used),
            updated_at = NOW()
        WHERE user_id = tx.user_id AND feature_id = product.quota_feature_id
        RETURNING * INTO after_quota;
      END IF;
      revoke_outcome := 'revoked';
    END IF;
  END IF;

  audit_id := admin_write_audit(
    p_operator, 'payment.refund', tx.user_id, 'transaction', tx.id::text, p_reason,
    jsonb_build_object(
      'transaction', to_jsonb(tx),
      'entitlement', CASE WHEN before_entitlement.id IS NULL THEN NULL ELSE to_jsonb(before_entitlement) END,
      'quota', CASE WHEN before_quota.id IS NULL THEN NULL ELSE to_jsonb(before_quota) END
    ),
    jsonb_build_object(
      'transaction', to_jsonb(after_tx),
      'entitlement', CASE WHEN after_entitlement.id IS NULL THEN NULL ELSE to_jsonb(after_entitlement) END,
      'quota', CASE WHEN after_quota.id IS NULL THEN NULL ELSE to_jsonb(after_quota) END
    ),
    jsonb_build_object('revoke', revoke_outcome)
  );

  RETURN jsonb_build_object(
    'transaction', to_jsonb(after_tx),
    'revoke', revoke_outcome,
    'entitlement', CASE WHEN after_entitlement.id IS NULL THEN NULL ELSE to_jsonb(after_entitlement) END,
    'quota', CASE WHEN after_quota.id IS NULL THEN NULL ELSE to_jsonb(after_quota) END,
    'audit_id', audit_id
  );
END;
$$;

-- Privileges -----------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_assert_context(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_write_audit(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_grant_transaction(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_entitlement(UUID, feature_type, entitlement_status, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(UUID, feature_type, INT, INT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_topup_quota(UUID, feature_type, INT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_quota(UUID, feature_type, INT, INT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_refund_transaction(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_write_audit(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_entitlement(UUID, feature_type, entitlement_status, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(UUID, feature_type, INT, INT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_topup_quota(UUID, feature_type, INT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_quota(UUID, feature_type, INT, INT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_refund_transaction(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
