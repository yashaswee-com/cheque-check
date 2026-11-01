# Growth features

The shared Premium mark and Lifetime product icon use a crown. Only current paid
Lifetime ownership receives muted styling; trial, Scanner and Voice access do not.
The gold crown shine is disabled for OS or profile reduced-motion preferences.

The dashboard uses the existing bounded `free_plan_usage` RPC for cross-business
active cheque usage and current scan/voice quotas. Lifetime/trial users do not
see the card. Scanner/Voice subscriptions alone do not hide the cheque cap.
Warnings begin at exactly 80%; exhausted counters show zero remaining.
Loading/errors never masquerade as zero usage. Focus and cheque/business
mutations refresh the card.

Developer messages are server-managed `announcements` with locale copy, immutable
versions, publish and expiry dates. The latest published message appears on About
and in a dashboard sheet after onboarding until acknowledged. Acknowledgement is
idempotent per user/announcement across devices. The installation card waits until
acknowledgement; no announcement push is sent. Apply
`20261104010000_developer_announcements.sql`. Trusted operators publish a new
version through SQL using service-role access; clients cannot author content.

## Referrals and wallet payments

Apply `20261104020000_referrals_and_wallet.sql` and deploy the updated create-order
route and Razorpay webhook together. Settings and Features link to Referrals.
Referral URLs survive login locally; users must explicitly confirm attribution.
Only active paid Lifetime owners can share eligible codes. Attribution is immutable,
rejects self/cyclic referrals, and must precede first Lifetime checkout.
The first purchase receives floor(original minor-unit price * 20 / 100) discount.
Verified capture grants the referrer the same amount in INR credit.

Credit applies automatically only to top-ups with their required subscription.
The server reserves a frozen 30-minute quote and credit balance. Duplicate request
IDs reuse a recorded provider order; simultaneous creation is rejected explicitly.
Fully credit-funded top-ups fulfill atomically without creating a zero-value
Razorpay order. Network-uncertain provider creation retains reservations rather
than risking duplicate charges. Clients retry a closed quote with a new ID.

`expire_payment_checkouts()` releases at most 100 reservations per call. Migration
registers a five-minute pg_cron job where available; verify the job in the deployed
project. Service-role operators can also invoke the bounded function. Late captures
after expiry and ambiguous provider creations require reconciliation: never blindly
reissue orders, grant products, or release credit against an uncertain charge.

Subscribe to signed `order.paid` and `refund.processed` events. Full provider refunds
reverse referral rewards once, restore the credit-funded portion, and revoke the
refunded grant. Spent rewards can create negative balances; further credit spend is
blocked until covered. Partial refunds, disputes and legacy-order refunds return
explicit operator errors, not successful automatic settlement. Credit-only refunds
must use the service-role refund RPC with synthetic payment ID and provider amount
zero. No cash withdrawal, transfer or automatic refund initiation is provided.

The UI exposes the latest 50 private ledger entries, not contacts or unbounded history.
Focused tests cover real-schema accounting, signed webhooks, quotes, eligibility,
debt, replay, expiry, login preservation, response validation and UX failures.
`npm run test:scaling` adds a 10,000-user/100,000-ledger-row SQL fixture and exact
discount/capture/refund assertions within the configured p95 budget. It remains a
local serialized-connection regression benchmark, not production concurrency proof.
