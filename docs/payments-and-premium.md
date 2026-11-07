# Payments and Premium

Premium access comes from server-verified entitlements, not from a browser checkout result or payment-status label. The authenticated order route creates a Razorpay order; the webhook verifies the provider signature and order/payment match before calling database fulfillment ([create-order route](../src/app/api/payments/create-order/route.ts#L30-L60), [webhook verification](../supabase/functions/razorpay-webhook/handler.ts#L30-L81), [fulfillment matching](../supabase/functions/razorpay-webhook/handler.ts#L147-L180)).

## Quick reference

- Checkout requires an authenticated user and a validated product; the server prepares and rate-limits the order ([create-order route](../src/app/api/payments/create-order/route.ts#L12-L60)).
- Verified webhook events fulfill payment and entitlement state through database RPCs ([webhook handler](../supabase/functions/razorpay-webhook/handler.ts#L65-L180)).
- Premium workflows check ownership and current entitlement in PostgreSQL, independently of client UI ([Premium authorization RPC](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38)).
- Referral credit and wallet accounting are transactional and use immutable attribution/quote rules ([referral migration](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L72-L190), [fulfillment transaction](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L191-L307)).

## Checkout and fulfillment

The app route validates the requested product and user context, applies an API rate limit, prepares a server-side checkout, and creates the Razorpay order ([order route](../src/app/api/payments/create-order/route.ts#L12-L198)). The webhook checks the raw-body HMAC and verifies that the event's order/payment matches the recorded checkout before fulfillment ([signature and event checks](../supabase/functions/razorpay-webhook/handler.ts#L30-L81), [matching and RPC](../supabase/functions/razorpay-webhook/handler.ts#L147-L180)). Fulfillment is idempotent and updates transaction/entitlement/quota/wallet records atomically ([wallet migration](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L191-L307)).

A client success redirect is not proof of payment capture or Premium access; the authoritative state comes from the verified server-side flow ([webhook fulfillment](../supabase/functions/razorpay-webhook/handler.ts#L65-L180), [entitlement check](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38)).

## Premium authorization

The Premium workspace uses shared access helpers in the client and a database assertion for server-backed writes ([Premium feature service](../src/features/premium-workspace/service.ts#L1-L80), [database assertion](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38)). Entitlement state is separate from transaction state; a payment row alone does not grant feature access ([entitlement RPC](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38), [checkout fulfillment](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L191-L307)). Saved workspace items remain persisted independently of whether a user currently has access ([workspace tables and policies](../supabase/migrations/20261017030000_premium_workspace.sql#L1-L80)).

## Referrals and wallet

Eligible lifetime owners can share referral codes; attribution is constrained before the referred user's first Lifetime checkout ([referral eligibility](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L72-L142)). Eligible first purchases calculate the discount and reward in SQL, not in client-supplied values ([quote calculations](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L143-L190)). Wallet reservations and checkout fulfillment are transactional; provider-uncertain creation is retained for reconciliation rather than treated as a definitive failure ([wallet fulfillment](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L191-L307), [expiry/reconciliation logic](../supabase/migrations/20261104020000_referrals_and_wallet.sql#L308-L390)).

## Deployment caveat

The package function deployment alias includes `razorpay-webhook` without `--no-verify-jwt`, while the webhook expects provider HMAC verification ([deploy alias](../package.json#L37-L40), [handler](../supabase/functions/razorpay-webhook/handler.ts#L30-L81)). Verify the deployed gateway configuration allows the external provider to reach the handler and test a signed event in QA; this repository does not show the live setting ([deployment risk](infrastructure-and-deployment.md#deployment-verification)).
