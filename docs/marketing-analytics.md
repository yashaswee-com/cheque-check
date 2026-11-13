# Marketing analytics and Meta conversions

The implementation records twelve consented funnel metrics in private Supabase
`event_analytics` rows, with Meta Pixel/browser and Conversions API/server copies
sharing an event ID. This is repository implementation, not evidence that a
hosted project or Meta dataset is configured
([schema and authoritative events](../supabase/migrations/20261113000000_event_analytics.sql),
[browser](../src/features/analytics/browser.ts), [worker](../supabase/functions/marketing-delivery/index.ts)).

## Quick reference

- Collection, the browser Pixel, and server delivery are off until explicitly
  enabled. QA requires CAPI Test Events; the production browser Pixel is disabled
  in QA and previews ([flags](../src/features/analytics/contracts.ts),
  [worker guards](../supabase/functions/marketing-delivery/delivery.ts),
  [database defaults](../supabase/migrations/20261113000000_event_analytics.sql)).
- Use `event_analytics_daily` with `dimensions = '{}'::jsonb` for exact daily
  totals and unique counts. Days use `Asia/Kolkata`; timestamps remain UTC.
  `mode` distinguishes live and test traffic. These are observed app events,
  **not** Meta-attributed ad conversions
  ([daily views](../supabase/migrations/20261113000000_event_analytics.sql)).
- Never put CAPI tokens or the cookie signing secret in `NEXT_PUBLIC_*`, logs,
  issue descriptions, or source control. Configure secrets through the
  environment provider ([app template](../.env.example),
  [Edge template](../supabase/.env.example)).

## Event definitions

| Internal event               | Meta event             | Trigger and counting                                                                      |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `landing_page_view`          | `PageView`             | Homepage `/`, once per shared browser session.                                            |
| `signup_page_view`           | `PageView`             | `/signup`, once per shared browser session.                                               |
| `signup_success`             | `CompleteRegistration` | Verified email/phone plus first authenticated session; once per user.                     |
| `onboarding_started`         | `OnboardingStarted`    | First opening of `/onboarding`; once per user.                                            |
| `onboarding_completed`       | `OnboardingCompleted`  | Business setup and profile preferences saved; once per user.                              |
| `first_cheque`               | `FirstChequeAdded`     | First successful publication, across all user businesses.                                 |
| `five_cheques`               | `FiveChequesAdded`     | Fifth successful publication, across all user businesses.                                 |
| `free_limit_completed`       | `FreeLimitCompleted`   | First attempted action blocked by any exhausted free allowance or expired Lifetime trial. |
| `lifetime_purchase_started`  | `InitiateCheckout`     | Provider order recorded on a Lifetime checkout.                                           |
| `recharge_purchase_started`  | `InitiateCheckout`     | Provider order recorded on a credit subscription/top-up checkout.                         |
| `lifetime_purchase_finished` | `Purchase`             | Server-verified fulfillment, once per Lifetime checkout.                                  |
| `recharge_purchase_finished` | `Purchase`             | Server-verified fulfillment, once per credit checkout, including wallet-only purchases.   |

`event_category` distinguishes events sharing a Meta standard name. Product,
feature, currency, cash amount, wallet contribution, and discount are recorded
on purchase events. Database amounts and report revenue use **paise**; Meta
`value` uses major currency units and reflects actual external cash paid, not
wallet credit. Wallet-only purchases therefore have value zero. Checkout UI
success alone never records fulfillment
([database event producers](../supabase/migrations/20261113000000_event_analytics.sql),
[Meta payload](../supabase/functions/marketing-delivery/delivery.ts)).

Drafts, restores, edits, failed writes, and repeated draft publication do not
advance cheque milestones. Deletion does not reset them. Existing verified
signups, business setup, and published-cheque achievements are baselined by the
migration, without emitting historical conversions. Milestone bookkeeping is
maintained without consent so later opt-in cannot replay past achievements;
it is not a pre-consent event log
([baseline and publication trigger](../supabase/migrations/20261113000000_event_analytics.sql)).

AI quota rejection records its event in the quota RPC transaction; voice quota
rejection records it in delivery admission. A rejected cheque write rolls back,
so its UI error handler submits a separate authenticated request that rechecks
the current database cap. Premium action gates similarly recheck trial expiry.
Reaching zero without a blocked attempt does not count. Exhaustion of purchased
credits does not count as a free allowance
([quota and voice wrappers](../supabase/migrations/20261113000000_event_analytics.sql),
[cheque rejection](../src/features/cheques/hooks/use-create-cheque.ts),
[premium actions](../src/features/monetization/components/premium-gate.tsx)).

## Consent, identity, and attribution

The version-2 marketing banner appears across the site and app when collection
is enabled. Previous public-page-only consent requires a new choice. Rejection,
withdrawal, GPC, and DNT stop browser tracking; signed-in rejection revokes
account-level server delivery and cancels unsent events. A device without a
choice does not revoke an existing account choice. A new device still needs
local acceptance before running Pixel. Consent withdrawal cannot recall a
provider request already in flight or information Meta has already received
([control](../src/components/public-site/meta-pixel-consent.tsx),
[provider](../src/features/analytics/marketing-provider.tsx),
[server validation](../src/features/analytics/server.ts),
[delivery recheck](../supabase/functions/marketing-delivery/index.ts)).

There is no replay of pre-consent conversions. Accepting while an eligible
page is visible can record that current page. Marketing collection excludes
cheque contents, cheque face values, bank/party details, images, names, arbitrary
queries, auth tokens, and form contents. Verified email, verified phone, and
authenticated user ID are normalized and SHA-256 hashed for matching.
Hashing does not make these identifiers anonymous. IP/user agent and `_fbp` /
`_fbc` use Meta's unhashed protocol. IP is omitted unless a trusted,
proxy-overwritten header is configured
([ingress and matching](../src/features/analytics/server.ts),
[request allowlist](../src/validators/marketing-analytics.ts)).

For consented background events after browser matching context expires, the
worker builds fresh hashed account matching from verified Auth fields.
It does not reuse expired IP, user-agent, or browser/click identifiers
([account matching](../supabase/functions/marketing-delivery/delivery.ts),
[worker](../supabase/functions/marketing-delivery/index.ts)).

First-touch and last-touch attribution retain allowlisted UTM fields and a
referring origin for 90 days after collection begins, cleared on withdrawal.
UTM values accept only short campaign tokens, not arbitrary strings. A
`fbclid` supplies the consented `_fbc` matching identifier; the raw click ID is
not copied into the analytics log. A shared session expires after 30 minutes
of inactivity; background polling does not extend it. Browsers supporting Web
Locks serialize session initialization across tabs; storage-only fallback
browsers can race on simultaneous first visits
([browser session and attribution](../src/features/analytics/browser.ts),
[schemas](../src/validators/marketing-analytics.ts)).

Browser Pixel is restricted to fixed, non-private page paths, safe query
parameters, and safe referring URLs. Other events remain eligible for CAPI;
private dynamic paths are never used as server source URLs. Server-accepted
events are offered once as browser copies for up to one day; blocked scripts,
unsafe browser URLs, closed tabs, or browser-copy delivery failure do not
remove the durable server event
([browser safety checks](../src/features/analytics/browser.ts),
[source URL redaction](../src/features/analytics/server.ts),
[browser claims](../supabase/migrations/20261113000000_event_analytics.sql)).

## Storage, reports, and retention

All event, consent, queue, rate-limit, and aggregate tables enable RLS and
revoke access from `anon` and `authenticated`. Ingress RPCs are service-only.
There is no client-readable analytics dashboard
([permissions](../supabase/migrations/20261113000000_event_analytics.sql)).

The once-per-minute worker first runs maintenance, then claims up to 25
deliveries with two-minute leases. Retries reuse event IDs, back off from one
minute to six hours, and stop after 20 attempts or seven days. Transient
network/429/5xx/provider failures retry; permanent failures remain visible in
event delivery status. Only a response acknowledging one received event
counts as delivery success. Provider bodies and matching payloads are not
logged ([worker](../supabase/functions/marketing-delivery/index.ts),
[response handling](../supabase/functions/marketing-delivery/delivery.ts),
[leases and retry schedule](../supabase/migrations/20261113000000_event_analytics.sql),
[cron](../supabase/migrations/20261113010000_marketing_delivery_cron.sql)).

Retention policy implemented by maintenance:

- Raw events: 90 days.
- Identifier-free daily aggregate rows: 13 months.
- Event delivery matching payloads: removed on final settlement, or expiry
  after at most seven days. Reusable account matching context also expires
  after seven days; attribution/browser IDs have their separate 90-day life.
- Operational rate-limit windows: two hours.
- Explicit analytics erasure: operator-only `marketing_erase_user(owner)`
  deletes linked raw events/queued payloads and revokes consent. Historical
  identifier-free aggregates and operational milestone baselines remain.
  This RPC is an analytics-erasure step, not whole-account erasure.
- Deactivation stops future delivery and cancels pending payloads, but does not
  physically erase historical analytics.

Expiry cleanup needs a functioning cron/worker. The worker runs maintenance
even when outbound Meta delivery is disabled; do not remove its schedule to
disable marketing. Matching is never eligible for sending past expiry.
Daily snapshots are rebuilt once per IST day; recent eight days use live raw
aggregates, and older days use snapshots. Snapshot/report queries do not
contain user or visitor identifiers
([maintenance, erasure, profile transition, daily views](../supabase/migrations/20261113000000_event_analytics.sql)).

Example operator query, using no real user data:

```sql
select day, event_name, event_count, unique_users,
       unique_anonymous_visitors, revenue_paise, delivered, failed, pending
from public.event_analytics_daily
where mode = 'live' and dimensions = '{}'::jsonb
order by day desc, event_name;
```

Nonempty `dimensions` rows break down first/last campaign and source,
product type/product ID, and currency. Do not sum unique counts across
dimension groups or combine dimension rows with the empty-dimension total.
Failed delivery does not erase the observed event; internal counts need not
match Meta reporting
([report definitions](../supabase/migrations/20261113000000_event_analytics.sql)).

## Setup and QA checklist

These are deployment steps, not completed hosted operations:

1. Confirm the exact QA Supabase project and QA app origin. Do not run database
   reset commands. Apply the forward migrations through the existing migration
   workflow only after selecting that approved project
   ([migration scripts](../package.json)).
2. Deploy `marketing-delivery`. The package deployment alias and Ops function
   list include it. Its handler requires the project's service-role bearer
   credential; verify the deployed gateway allows the cron request
   ([deployment alias](../package.json),
   [Ops function list](../scripts/lib/supabase.ts),
   [worker authentication](../supabase/functions/marketing-delivery/index.ts)).
3. Ensure Vault `project_url` and `service_role_key` entries are provisioned
   through the existing setup workflow. The new cron uses those entries and
   contains no embedded secrets
   ([provisioning RPC](../supabase/migrations/20261021070000_cron_credentials_provisioning.sql),
   [schedule](../supabase/migrations/20261113010000_marketing_delivery_cron.sql)).
4. Configure the app variables from the root example. Generate a strong random
   `MARKETING_COOKIE_SECRET`, select the existing public Pixel ID, and rebuild
   with `NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED=true`. Do not reuse the CAPI
   token as a cookie secret. Review translated consent/privacy copy before
   enabling collection ([app example](../.env.example),
   [consent](../src/components/public-site/meta-pixel-consent.tsx)).
5. In Edge secrets, set the dataset ID, CAPI token, a currently supported
   `META_GRAPH_API_VERSION`, exact QA `MARKETING_SITE_ORIGIN` without a trailing
   slash, `APP_ENV=qa`, `DEPLOYMENT_KIND=qa`,
   `MARKETING_DELIVERY_MODE=test`, and `META_TEST_EVENT_CODE` from Events
   Manager. Only then enable `MARKETING_DELIVERY_ENABLED=true`
   ([Edge example](../supabase/.env.example),
   [configuration checks](../supabase/functions/marketing-delivery/delivery.ts)).
6. In the approved QA database, enable **test** collection:

   ```sql
   update public.marketing_configuration
   set enabled = true, mode = 'test'
   where singleton;
   ```

   The database initially disables collection. Do not mark QA as `live`; worker
   and event modes must agree ([configuration and claims](../supabase/migrations/20261113000000_event_analytics.sql),
   [worker mode check](../supabase/functions/marketing-delivery/index.ts)).

7. With fresh synthetic accounts, verify all twelve events in Supabase and
   Events Manager Test Events. Exercise email verification, OAuth/phone when
   enabled, refreshes/multiple tabs, draft publication, deletion/restore, the
   fifth cheque, exhausted AI/voice/cheque limits, trial expiry, rejected
   payments, webhook retries, cash and wallet-only purchases, rejection,
   withdrawal, GPC, and DNT. Check matching completeness and delivery
   diagnostics without exposing actual matching data
   ([automated database tests](../src/features/analytics/analytics.migration.test.ts),
   [ingress tests](../src/features/analytics/server.test.ts),
   [browser tests](../src/features/analytics/browser.test.ts),
   [delivery tests](../src/features/analytics/delivery.test.ts)).
8. For a separately approved production rollout, use production environment
   labels on both the app and worker, the verified production origin, and
   matching `live` database/worker modes. Remove test-only configuration.
   Verify Events Manager receives browser/server pairs with matching names
   and event IDs; QA does not exercise the production browser Pixel
   ([Pixel guards](../src/features/analytics/contracts.ts),
   [worker guards](../supabase/functions/marketing-delivery/delivery.ts)).
9. In Meta Events Manager, verify dataset/domain ownership and diagnostics.
   Use `CompleteRegistration` as the initial optimization event. Define
   separate custom conversions using `event_category` or product fields to
   distinguish Lifetime/Recharge checkout and purchase; use the named custom
   events for activation milestones. Ad optimization eligibility and delivery
   are controlled by Meta, not guaranteed by this integration
   ([Meta event contract](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event),
   [configured event names](../supabase/migrations/20261113000000_event_analytics.sql)).

To disable collection, set database `enabled=false` and rebuild with the
public collection flag off. Set the worker delivery flag off to stop outgoing
requests while retaining maintenance. Re-enabling does not replay achievements
that occurred while collection was off
([emission gates](../supabase/migrations/20261113000000_event_analytics.sql),
[worker switch](../supabase/functions/marketing-delivery/index.ts)).
