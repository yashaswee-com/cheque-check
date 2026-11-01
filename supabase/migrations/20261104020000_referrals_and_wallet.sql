CREATE TABLE public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))
    CHECK(code ~ '^[A-F0-9]{12}$')
);
CREATE TABLE public.referrals (
  referee_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(referee_id<>referrer_id)
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id,created_at DESC);
CREATE TABLE public.referral_wallets (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  currency text NOT NULL CHECK(currency='INR'),
  balance bigint NOT NULL DEFAULT 0,
  reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),
  PRIMARY KEY(user_id,currency)
);
CREATE TABLE public.payment_checkouts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id),
  product_id text NOT NULL REFERENCES public.payment_products(id),
  product_snapshot jsonb NOT NULL,
  base_amount integer NOT NULL CHECK(base_amount>0),
  discount integer NOT NULL CHECK(discount>=0),
  wallet_amount integer NOT NULL CHECK(wallet_amount>=0),
  provider_amount integer NOT NULL CHECK(provider_amount>=0),
  currency text NOT NULL CHECK(currency='INR'),
  referrer_id uuid REFERENCES public.profiles(user_id),
  reward integer NOT NULL DEFAULT 0 CHECK(reward>=0),
  provider_order text UNIQUE,
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','paid','expired','failed','refunded')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(base_amount=discount+wallet_amount+provider_amount),
  CHECK((referrer_id IS NULL AND reward=0) OR (referrer_id IS NOT NULL AND reward>0))
);
CREATE UNIQUE INDEX payment_checkouts_active_idx ON public.payment_checkouts(user_id,product_id) WHERE status='reserved';
CREATE INDEX payment_checkouts_expiry_idx ON public.payment_checkouts(expires_at,id) WHERE status='reserved';
CREATE INDEX payment_checkouts_owner_idx ON public.payment_checkouts(user_id,created_at DESC);
CREATE TABLE public.referral_wallet_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id),
  currency text NOT NULL CHECK(currency='INR'),
  checkout_id uuid NOT NULL REFERENCES public.payment_checkouts(id),
  kind text NOT NULL CHECK(kind IN ('reward','spend','reward_reversal','spend_refund')),
  amount bigint NOT NULL CHECK(amount<>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checkout_id,kind)
);
CREATE INDEX referral_wallet_ledger_owner_idx ON public.referral_wallet_ledger(user_id,id DESC);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['referral_codes','referrals','referral_wallets','payment_checkouts','referral_wallet_ledger'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.referral_wallet_ledger_id_seq TO service_role;

CREATE FUNCTION public.paid_lifetime_owner(requested_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.lifecycle_user_active(requested_user)
    AND EXISTS(SELECT 1 FROM public.user_entitlements WHERE user_id=requested_user
      AND feature_id='lifetime_premium' AND status='active' AND valid_until IS NULL)
    AND EXISTS(SELECT 1 FROM public.transactions WHERE user_id=requested_user
      AND type='lifetime' AND status='captured');
$$;
REVOKE ALL ON FUNCTION public.paid_lifetime_owner(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.referral_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eligible boolean; own_code text; linked text; wallets jsonb; entries jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  eligible:=public.paid_lifetime_owner(auth.uid());
  IF eligible THEN INSERT INTO public.referral_codes(user_id) VALUES(auth.uid()) ON CONFLICT(user_id) DO NOTHING; END IF;
  SELECT code INTO own_code FROM public.referral_codes WHERE user_id=auth.uid();
  SELECT c.code INTO linked FROM public.referrals r JOIN public.referral_codes c ON c.user_id=r.referrer_id WHERE r.referee_id=auth.uid();
  SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'balance',balance,'reserved',reserved)),'[]')
    INTO wallets FROM public.referral_wallets WHERE user_id=auth.uid();
  SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO entries FROM (
    SELECT id::text AS id,currency,kind,amount,created_at FROM public.referral_wallet_ledger
      WHERE user_id=auth.uid() ORDER BY public.referral_wallet_ledger.id DESC LIMIT 50
  ) l;
  RETURN jsonb_build_object('eligible',eligible,'code',CASE WHEN eligible THEN own_code END,
    'applied_code',linked,'wallets',wallets,'entries',entries);
END $$;

CREATE FUNCTION public.apply_referral_code(requested_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.lifecycle_user_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF requested_code IS NULL OR upper(btrim(requested_code)) !~ '^[A-F0-9]{12}$' THEN
    RAISE EXCEPTION 'Invalid referral code' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(741004);
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  SELECT user_id INTO owner FROM public.referral_codes WHERE code=upper(btrim(requested_code));
  IF owner IS NULL OR owner=auth.uid() OR NOT public.paid_lifetime_owner(owner) THEN
    RAISE EXCEPTION 'Referral code is not eligible' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.referrals WHERE referee_id=auth.uid()) THEN
    IF EXISTS(SELECT 1 FROM public.referrals WHERE referee_id=auth.uid() AND referrer_id=owner) THEN RETURN; END IF;
    RAISE EXCEPTION 'Referral cannot be changed' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.transactions WHERE user_id=auth.uid() AND type='lifetime' AND status IN ('created','authorized','captured','refunded'))
    OR EXISTS(SELECT 1 FROM public.payment_checkouts WHERE user_id=auth.uid() AND product_id='lifetime_premium') THEN
    RAISE EXCEPTION 'Apply referral before your first Lifetime checkout' USING ERRCODE='23505';
  END IF;
  IF EXISTS(WITH RECURSIVE ancestry AS (
    SELECT referrer_id FROM public.referrals WHERE referee_id=owner
    UNION SELECT r.referrer_id FROM public.referrals r JOIN ancestry a ON r.referee_id=a.referrer_id
  ) SELECT 1 FROM ancestry WHERE referrer_id=auth.uid()) THEN
    RAISE EXCEPTION 'Referral cycles are not allowed' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.referrals(referee_id,referrer_id) VALUES(auth.uid(),owner);
END $$;
REVOKE ALL ON FUNCTION public.referral_summary(),public.apply_referral_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.referral_summary(),public.apply_referral_code(text) TO authenticated;

CREATE FUNCTION public.release_payment_checkout(requested_id uuid,requested_status text DEFAULT 'failed')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.payment_checkouts;
BEGIN
  IF requested_status IS NULL OR requested_status NOT IN ('expired','failed') THEN RAISE EXCEPTION 'Invalid release state' USING ERRCODE='22023'; END IF;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=q.user_id FOR UPDATE;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id FOR UPDATE;
  IF q.status<>'reserved' THEN RETURN; END IF;
  IF q.wallet_amount>0 THEN
    UPDATE public.referral_wallets SET reserved=reserved-q.wallet_amount WHERE user_id=q.user_id AND currency=q.currency;
  END IF;
  UPDATE public.payment_checkouts SET status=requested_status WHERE id=q.id;
  UPDATE public.transactions SET status='failed',updated_at=now() WHERE razorpay_order_id=q.provider_order AND status='created';
END $$;

CREATE FUNCTION public.prepare_payment_checkout(requested_id uuid,requested_user uuid,requested_product text)
RETURNS public.payment_checkouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.payment_products; q public.payment_checkouts; old public.payment_checkouts; owner uuid;
  reduction integer:=0; credit integer:=0; available bigint:=0; reward_amount integer:=0;
BEGIN
  IF requested_id IS NULL OR NOT public.lifecycle_user_active(requested_user) THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=requested_user FOR UPDATE;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id;
  IF FOUND THEN
    IF q.user_id<>requested_user OR q.product_id<>requested_product THEN RAISE EXCEPTION 'Checkout ownership mismatch' USING ERRCODE='42501'; END IF;
    IF q.status='reserved' AND q.expires_at<=now() THEN
      PERFORM public.release_payment_checkout(q.id,'expired');
      SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id;
      RETURN q;
    END IF;
    IF q.status='reserved' AND q.provider_order IS NULL THEN
      RAISE EXCEPTION 'Checkout creation is already in progress' USING ERRCODE='23505';
    END IF;
    RETURN q;
  END IF;
  SELECT * INTO old FROM public.payment_checkouts WHERE user_id=requested_user AND product_id=requested_product AND status='reserved';
  IF FOUND THEN
    IF old.expires_at>now() THEN RAISE EXCEPTION 'An active checkout already exists' USING ERRCODE='23505'; END IF;
    PERFORM public.release_payment_checkout(old.id,'expired');
  END IF;
  SELECT * INTO p FROM public.payment_products WHERE id=requested_product AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='22023'; END IF;
  IF p.transaction_type IN ('lifetime','subscription') AND EXISTS(
    SELECT 1 FROM public.user_entitlements WHERE user_id=requested_user AND feature_id=p.feature_id AND status='active'
      AND (valid_until IS NULL OR valid_until>now())) THEN RAISE EXCEPTION 'Product already active' USING ERRCODE='23505'; END IF;
  IF p.required_entitlement_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.user_entitlements WHERE user_id=requested_user AND feature_id=p.required_entitlement_id AND status='active'
      AND (valid_until IS NULL OR valid_until>now())) THEN RAISE EXCEPTION 'Required subscription is not active' USING ERRCODE='42501'; END IF;
  IF p.transaction_type='lifetime' AND NOT EXISTS(
    SELECT 1 FROM public.transactions WHERE user_id=requested_user AND type='lifetime' AND status IN ('captured','refunded')) THEN
    SELECT referrer_id INTO owner FROM public.referrals WHERE referee_id=requested_user;
    IF owner IS NOT NULL AND public.paid_lifetime_owner(owner) THEN
      reduction:=floor(p.amount::numeric*20/100)::int; reward_amount:=reduction;
    ELSE owner:=NULL; END IF;
  END IF;
  IF p.transaction_type='top_up' THEN
    INSERT INTO public.referral_wallets(user_id,currency) VALUES(requested_user,p.currency) ON CONFLICT DO NOTHING;
    SELECT greatest(0,balance-reserved) INTO available FROM public.referral_wallets
      WHERE user_id=requested_user AND currency=p.currency FOR UPDATE;
    credit:=least(p.amount,available)::int;
    UPDATE public.referral_wallets SET reserved=reserved+credit WHERE user_id=requested_user AND currency=p.currency;
  END IF;
  INSERT INTO public.payment_checkouts(id,user_id,product_id,product_snapshot,base_amount,discount,wallet_amount,provider_amount,currency,referrer_id,reward)
    VALUES(requested_id,requested_user,p.id,to_jsonb(p),p.amount,reduction,credit,p.amount-reduction-credit,p.currency,owner,reward_amount)
    RETURNING * INTO q;
  RETURN q;
END $$;

CREATE FUNCTION public.record_checkout_order(requested_id uuid,requested_order text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.payment_checkouts; p public.payment_products;
BEGIN
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=q.user_id FOR UPDATE;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id FOR UPDATE;
  IF q.status<>'reserved' OR q.expires_at<=now() OR requested_order IS NULL OR length(requested_order)=0 THEN
    IF q.provider_order=requested_order AND q.status='paid' THEN RETURN; END IF;
    RAISE EXCEPTION 'Checkout is no longer valid' USING ERRCODE='22023';
  END IF;
  IF q.provider_order IS NOT NULL THEN
    IF q.provider_order=requested_order THEN RETURN; END IF;
    RAISE EXCEPTION 'Checkout already has an order' USING ERRCODE='23505';
  END IF;
  p:=jsonb_populate_record(NULL::public.payment_products,q.product_snapshot);
  INSERT INTO public.transactions(user_id,razorpay_order_id,amount,currency,status,type,feature_id,product_id)
    VALUES(q.user_id,requested_order,q.provider_amount,q.currency,'created',p.transaction_type,p.feature_id,p.id);
  UPDATE public.payment_checkouts SET provider_order=requested_order WHERE id=q.id;
END $$;

-- Legacy orders retain the original exact-price fulfillment contract.
ALTER FUNCTION public.fulfill_payment_order(text,text,uuid,text,int,text) RENAME TO fulfill_legacy_payment_order;
REVOKE ALL ON FUNCTION public.fulfill_legacy_payment_order(text,text,uuid,text,int,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.fulfill_payment_order(razorpay_order text,razorpay_payment text,order_user_id uuid,
  requested_product_id text,paid_amount int,paid_currency text)
RETURNS public.transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.payment_checkouts; t public.transactions; p public.payment_products; expiry timestamptz; remaining integer;
BEGIN
  SELECT * INTO q FROM public.payment_checkouts WHERE provider_order=razorpay_order;
  IF NOT FOUND THEN RETURN public.fulfill_legacy_payment_order(razorpay_order,razorpay_payment,order_user_id,requested_product_id,paid_amount,paid_currency); END IF;
  -- Same lock order as reserve/release; grants, ledger and capture commit together.
  PERFORM 1 FROM public.profiles WHERE user_id IN (q.user_id,q.referrer_id) ORDER BY user_id FOR UPDATE;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=q.id FOR UPDATE;
  SELECT * INTO t FROM public.transactions WHERE razorpay_order_id=razorpay_order FOR UPDATE;
  IF t.id IS NULL OR q.user_id IS DISTINCT FROM order_user_id OR q.product_id IS DISTINCT FROM requested_product_id OR q.provider_amount IS DISTINCT FROM paid_amount
    OR q.currency IS DISTINCT FROM paid_currency OR razorpay_payment IS NULL OR length(razorpay_payment)=0 THEN
    RAISE EXCEPTION 'Payment does not match the locked quote' USING ERRCODE='22023';
  END IF;
  IF q.status='paid' AND t.status='captured' AND t.razorpay_payment_id=razorpay_payment THEN RETURN t; END IF;
  IF q.status<>'reserved' OR t.status<>'created' OR q.expires_at<=now() THEN
    RAISE EXCEPTION 'Late or invalid capture requires operator reconciliation' USING ERRCODE='55000';
  END IF;
  IF NOT public.lifecycle_user_active(q.user_id) THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  p:=jsonb_populate_record(NULL::public.payment_products,q.product_snapshot);
  IF p.required_entitlement_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.user_entitlements WHERE user_id=q.user_id AND feature_id=p.required_entitlement_id AND status='active'
      AND (valid_until IS NULL OR valid_until>now())) THEN RAISE EXCEPTION 'Required subscription expired; reconcile payment' USING ERRCODE='42501'; END IF;
  IF p.transaction_type='lifetime' THEN
    INSERT INTO public.user_entitlements(user_id,feature_id,status,valid_until) VALUES(q.user_id,p.feature_id,'active',NULL)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=NULL,updated_at=now();
  ELSIF p.transaction_type='subscription' THEN
    expiry:=now()+make_interval(days=>p.entitlement_days);
    INSERT INTO public.user_entitlements(user_id,feature_id,status,valid_until) VALUES(q.user_id,p.feature_id,'active',expiry)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=EXCLUDED.valid_until,updated_at=now();
    SELECT greatest("limit"-used,0) INTO remaining FROM public.user_quotas WHERE user_id=q.user_id AND feature_id=p.quota_feature_id FOR UPDATE;
    INSERT INTO public.user_quotas(user_id,feature_id,used,"limit",reset_at) VALUES(q.user_id,p.quota_feature_id,0,coalesce(remaining,0)+p.quota_increment,expiry)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET used=0,"limit"=EXCLUDED."limit",reset_at=expiry,updated_at=now();
  ELSE
    INSERT INTO public.user_quotas(user_id,feature_id,used,"limit") VALUES(q.user_id,p.quota_feature_id,0,p.quota_increment)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET "limit"=user_quotas."limit"+p.quota_increment,updated_at=now();
  END IF;
  IF q.wallet_amount>0 THEN
    UPDATE public.referral_wallets SET balance=balance-q.wallet_amount,reserved=reserved-q.wallet_amount
      WHERE user_id=q.user_id AND currency=q.currency AND reserved>=q.wallet_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet reservation missing' USING ERRCODE='55000'; END IF;
    INSERT INTO public.referral_wallet_ledger(user_id,currency,checkout_id,kind,amount) VALUES(q.user_id,q.currency,q.id,'spend',-q.wallet_amount);
  END IF;
  IF q.reward>0 THEN
    INSERT INTO public.referral_wallets(user_id,currency,balance) VALUES(q.referrer_id,q.currency,q.reward)
      ON CONFLICT(user_id,currency) DO UPDATE SET balance=referral_wallets.balance+EXCLUDED.balance;
    INSERT INTO public.referral_wallet_ledger(user_id,currency,checkout_id,kind,amount) VALUES(q.referrer_id,q.currency,q.id,'reward',q.reward);
  END IF;
  UPDATE public.payment_checkouts SET status='paid' WHERE id=q.id;
  UPDATE public.transactions SET status='captured',razorpay_payment_id=razorpay_payment,updated_at=now() WHERE id=t.id RETURNING * INTO t;
  RETURN t;
END $$;

CREATE FUNCTION public.fulfill_wallet_checkout(requested_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.payment_checkouts;
BEGIN
  SELECT * INTO q FROM public.payment_checkouts WHERE id=requested_id;
  IF NOT FOUND OR q.provider_amount<>0 OR q.wallet_amount<=0 THEN RAISE EXCEPTION 'Not a wallet checkout' USING ERRCODE='22023'; END IF;
  IF q.status='paid' THEN RETURN; END IF;
  PERFORM public.record_checkout_order(q.id,'wallet_'||q.id);
  PERFORM public.fulfill_payment_order('wallet_'||q.id,'wallet_payment_'||q.id,q.user_id,q.product_id,0,q.currency);
END $$;

CREATE FUNCTION public.refund_payment_checkout(requested_payment text,requested_amount int,requested_currency text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.payment_checkouts; t public.transactions; p public.payment_products;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE razorpay_payment_id=requested_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund payment unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO q FROM public.payment_checkouts WHERE provider_order=t.razorpay_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy refund requires operator handling' USING ERRCODE='55000'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id IN (q.user_id,q.referrer_id) ORDER BY user_id FOR UPDATE;
  SELECT * INTO q FROM public.payment_checkouts WHERE id=q.id FOR UPDATE;
  SELECT * INTO t FROM public.transactions WHERE id=t.id FOR UPDATE;
  IF requested_amount IS DISTINCT FROM q.provider_amount OR requested_currency IS DISTINCT FROM q.currency THEN
    RAISE EXCEPTION 'Partial refund requires operator handling' USING ERRCODE='22023';
  END IF;
  IF q.status='refunded' THEN RETURN; END IF;
  IF q.status<>'paid' OR t.status<>'captured' THEN RAISE EXCEPTION 'Refund state invalid' USING ERRCODE='55000'; END IF;
  p:=jsonb_populate_record(NULL::public.payment_products,q.product_snapshot);
  IF q.reward>0 THEN
    UPDATE public.referral_wallets SET balance=balance-q.reward WHERE user_id=q.referrer_id AND currency=q.currency;
    INSERT INTO public.referral_wallet_ledger(user_id,currency,checkout_id,kind,amount) VALUES(q.referrer_id,q.currency,q.id,'reward_reversal',-q.reward);
  END IF;
  IF q.wallet_amount>0 THEN
    UPDATE public.referral_wallets SET balance=balance+q.wallet_amount WHERE user_id=q.user_id AND currency=q.currency;
    INSERT INTO public.referral_wallet_ledger(user_id,currency,checkout_id,kind,amount) VALUES(q.user_id,q.currency,q.id,'spend_refund',q.wallet_amount);
  END IF;
  IF p.transaction_type='lifetime' THEN
    UPDATE public.user_entitlements SET status='canceled',updated_at=now() WHERE user_id=q.user_id AND feature_id=p.feature_id
      AND NOT EXISTS (SELECT 1 FROM public.transactions newer WHERE newer.user_id=q.user_id AND newer.feature_id=p.feature_id
        AND newer.status='captured' AND newer.id<>t.id AND newer.updated_at>t.updated_at);
  ELSE
    UPDATE public.user_quotas SET "limit"=greatest(used,"limit"-p.quota_increment),updated_at=now()
      WHERE user_id=q.user_id AND feature_id=p.quota_feature_id;
    IF p.transaction_type='subscription' THEN
      UPDATE public.user_entitlements SET status='canceled',updated_at=now() WHERE user_id=q.user_id AND feature_id=p.feature_id
        AND NOT EXISTS (SELECT 1 FROM public.transactions newer WHERE newer.user_id=q.user_id AND newer.feature_id=p.feature_id
          AND newer.status='captured' AND newer.id<>t.id AND newer.updated_at>t.updated_at);
    END IF;
  END IF;
  UPDATE public.payment_checkouts SET status='refunded' WHERE id=q.id;
  UPDATE public.transactions SET status='refunded',updated_at=now() WHERE id=t.id;
END $$;
REVOKE ALL ON FUNCTION public.prepare_payment_checkout(uuid,uuid,text),public.record_checkout_order(uuid,text),
  public.release_payment_checkout(uuid,text),public.fulfill_wallet_checkout(uuid),
  public.fulfill_payment_order(text,text,uuid,text,int,text),public.refund_payment_checkout(text,int,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_payment_checkout(uuid,uuid,text),public.record_checkout_order(uuid,text),
  public.release_payment_checkout(uuid,text),public.fulfill_wallet_checkout(uuid),
  public.fulfill_payment_order(text,text,uuid,text,int,text),public.refund_payment_checkout(text,int,text) TO service_role;

CREATE FUNCTION public.expire_payment_checkouts() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q record; released int:=0;
BEGIN
  FOR q IN SELECT id FROM public.payment_checkouts WHERE status='reserved' AND expires_at<=now()
    ORDER BY expires_at,id LIMIT 100 LOOP
    PERFORM public.release_payment_checkout(q.id,'expired'); released:=released+1;
  END LOOP;
  RETURN released;
END $$;
REVOKE ALL ON FUNCTION public.expire_payment_checkouts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_payment_checkouts() TO service_role;
DO $$ BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('payment-checkout-expiry','*/5 * * * *','SELECT public.expire_payment_checkouts()');
  END IF;
END $$;
