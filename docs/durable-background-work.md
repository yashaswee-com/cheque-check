# Durable background work

Report exports, marketing event delivery, cheque scanning, and reminder calls
persist work in PostgreSQL and use Edge Functions or scheduled database work to
process it. This guide compares their recovery boundaries; each feature guide
remains the detailed reference.

## Quick reference

- Database jobs and checkpoints survive a worker invocation ending; a cron tick
  or a database dispatch trigger starts another invocation
  ([export job lifecycle](../supabase/migrations/20261031040000_background_exports.sql#L115-L163),
  [OCR dispatch and recovery](../supabase/migrations/20261114010000_durable_cheque_ocr.sql#L454-L489)).
- A claim token fences stale workers, but it does not make an external provider
  request exactly-once. For calls, an expired lease after provider start is an
  uncertain result and requires reconciliation rather than blind redelivery
  ([notification lease recovery](../supabase/migrations/20261031010000_notification_delivery_leases.sql#L48-L68)).
- A schedule in a migration is repository configuration, not proof that the
  deployed schedule is active or has run
  ([export schedule starts inactive](../supabase/migrations/20261031040000_background_exports.sql#L226-L234),
  [deployment verification](infrastructure-and-deployment.md#deployment-verification)).

## Workflow map

### Report exports

The request stores a frozen snapshot and job. A minute-scale cron tick invokes
the worker, but the migration creates this schedule inactive
([snapshot](../supabase/migrations/20261031040000_background_exports.sql#L57-L112),
[cron](../supabase/migrations/20261031040000_background_exports.sql#L226-L234)).
The worker claims one job per tick with a token-owned two-minute lease, writes
500-row parts, and advances a `next_part` checkpoint. Expired work can be
retried up to three attempts. Deterministic part paths make repeated uploads
safe after a lost response ([claims and checkpoints](../supabase/migrations/20261031040000_background_exports.sql#L115-L163),
[part processing](../supabase/functions/report-exports/worker.ts#L157-L190)).

### Event analytics

Consented events and their delivery payloads are stored before the scheduled
worker sends them. The worker runs maintenance before checking whether
outbound delivery is enabled ([event queue](../supabase/migrations/20261113000000_event_analytics.sql#L54-L72),
[worker](../supabase/functions/marketing-delivery/index.ts#L43-L50),
[cron](../supabase/migrations/20261113010000_marketing_delivery_cron.sql#L1-L5)).
Claims use two-minute leases. Retryable outcomes reuse the event ID, back off,
and stop after 20 attempts or seven-day queue expiry; settlement updates the
event status ([claim and settlement](../supabase/migrations/20261113000000_event_analytics.sql#L370-L441)).

### AI cheque scanning

The accepted job and credit reservation persist before an insert trigger
dispatches the Edge worker. A recovery schedule revisits accepted work and
reconciles expired jobs ([acceptance and reservation](../supabase/migrations/20261114010000_durable_cheque_ocr.sql#L234-L257),
[dispatch and recovery](../supabase/migrations/20261114010000_durable_cheque_ocr.sql#L454-L489)).
A processing claim is not reclaimed after a worker crash because provider
execution may have started. The original seven-second deadline fences late
completion; only a qualifying definitive transient provider rejection can
receive one controlled retry ([claim and deadline](../supabase/migrations/20261114010000_durable_cheque_ocr.sql#L309-L325),
[worker retry and deadline](../supabase/functions/cheque-ocr/worker.ts#L58-L112)).

### Reminder calls

The scheduler checkpoints its profile cursor in pages of 200 and uses an
idempotency key when creating jobs. A separate dispatcher claims due jobs on
its own schedule ([scheduler checkpoint](../supabase/migrations/20261031020000_bounded_notification_scheduler.sql#L1-L98),
[dispatcher schedule](../supabase/migrations/20261017000000_notification_platform.sql#L178-L191)).
A two-minute token-owned lease is issued before provider start; the
`provider_started_at` marker distinguishes retryable pre-provider failures
from uncertain outcomes. Pre-provider failures can retry within the attempt
limit; an expired lease after provider start requires reconciliation, not
blind redelivery. Shared admission controls provider rate and in-flight
capacity ([lease recovery](../supabase/migrations/20261031010000_notification_delivery_leases.sql#L48-L78),
[provider admission](../supabase/migrations/20261031050000_notification_provider_capacity.sql#L27-L69)).

These are related patterns, not one interchangeable queue. For example, an
export part can be safely uploaded again at its deterministic path, while a
voice call with a lost provider response cannot be assumed unsent. Follow each
feature's own settlement, retry, deadline, and privacy rules.

## Operator checks

Before relying on a background workflow, verify the target project's required
migrations, deployed Edge Function, Vault credentials, and cron job status.
Then exercise a synthetic QA job and confirm both its database state and
worker-run history. These checks are environment-specific; checked-in
migrations and tests do not establish hosted schedules, provider credentials,
or throughput ([deployment verification](infrastructure-and-deployment.md#deployment-verification),
[scaling limits](scaling-and-observability.md#production-evidence-still-required)).

When a job is stuck, inspect its durable state and the relevant feature's
failure code before retrying. Do not manually replay work after an external
request may have started unless that feature's documented reconciliation
procedure says it is safe.
