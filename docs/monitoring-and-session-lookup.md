# Monitoring and session lookup

Sentry receives errors and sampled performance traces. Clarity provides masked
UX recordings for authenticated users. Both use the Supabase **auth user UUID**,
not the profile row ID, and an application-generated diagnostic session ID.

Collection is disabled by default. Policy approval, QA validation and dashboard
configuration are deployment gates, not steps that code can approve automatically.
No provider secrets should be pasted into chat or committed.

## Deployment Configuration

Configure these in Vercel **before building**. The files under `env/` are not
automatically loaded by Next.js. Use separate builds for QA and production.

| Variable                                      | Value / Purpose                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ENV`                         | `production`, `qa`, or `development`; required when enabled                                                          |
| `NEXT_PUBLIC_OBSERVABILITY_ENABLED`           | `true` enables essential Sentry error/trace collection; default `false`                                              |
| `NEXT_PUBLIC_APP_RELEASE`                     | Optional on Vercel: defaults to `cheque-check@<VERCEL_GIT_COMMIT_SHA>`; required explicitly for enabled local builds |
| `NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED`      | Default `false`; opt-in previews must use `NEXT_PUBLIC_APP_ENV=qa` and QA destinations                               |
| `NEXT_PUBLIC_MONITORING_POLICY_APPROVED`      | Default `false`; set `true` only after privacy/provider review for the India/adult audience                          |
| `NEXT_PUBLIC_CLARITY_ENABLED`                 | Default `false`; enable after Clarity masking, stop/reset and identity smoke tests                                   |
| `NEXT_PUBLIC_REPLAY_ENABLED`                  | Default `false`; enable after Sentry replay masking/opt-out smoke tests                                              |
| `NEXT_PUBLIC_SENTRY_DSN`                      | Existing public Sentry project DSN; one project, environment filters                                                 |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID`              | Different Clarity projects for production and QA                                                                     |
| `SENTRY_AUTH_TOKEN`                           | Build-only secret for source-map uploads; never `NEXT_PUBLIC_`                                                       |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`       | Default `0.05`                                                                                                       |
| `NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE`       | Default `0.01` baseline sessions                                                                                     |
| `NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE` | Default `0.25` eligible error sessions                                                                               |

Vercel previews are marked `deployment_kind=preview`, even if another label is
supplied. Previews cannot send production telemetry. Disabled builds and local
tests do not need upload credentials. Enabled Vercel Sentry builds fail clearly
when the source-map upload token is missing. The same commit release is injected
into browser/server configuration and the source-map uploader. Source maps are
deleted after upload. Verify source-mapped production stacks in QA, not merely
whether a build succeeded. Keep production Pino log level at `info`, not `debug`.

For a temporary local QA smoke test, use an explicit development/QA environment,
an explicit release such as `cheque-check@local-smoke`, and QA project IDs.
Never change `NODE_ENV` to distinguish QA from production.

Public environment flags are build-time settings: changing them in Vercel
requires a rebuild/redeployment. To stop all collection, set
`NEXT_PUBLIC_OBSERVABILITY_ENABLED=false` and redeploy. Replay/Clarity have their
own switches, leaving essential sanitized errors available.

## Identity, Context and Privacy

- Sentry user: auth UUID, approved email, display name. Clarity: `identify(UUID,
diagnostic_session_id, normalized_page, display_name)` plus an explicit `email`
  custom tag. Clarity hashes the custom user ID, but email tags and friendly names
  are explicit PII, not masked recording content. Limit platform access accordingly.
- Context: active business UUID (never name), language, timezone, currency,
  premium entitlement state, environment, release and deployment kind. Entity
  UUIDs are attached only to relevant operations, not arbitrary form objects.
- Server identity comes from the route's authenticated Supabase user. Client
  identity headers are not trusted. Each request gets an isolated Sentry scope
  and a new `x-request-id`; owned API calls may carry `x-diagnostic-session-id`.
  Neither header grants access. Trace headers are restricted to owned API origins.
- Diagnostic session IDs are random and tab-local, rotate across users and after
  30 minutes without diagnostic activity, and are distinct from Sentry event,
  trace and replay IDs or Clarity's native recording ID. Normal reloads can retain
  the app reference while native recordings restart.
- Recordings start only after authenticated identity and policy/preference checks.
  Auth/password screens do not record. Media, iframes, canvas, SVG and explicitly
  private containers are blocked; dynamic text and all inputs are masked.
  No static content has been explicitly unmasked yet.
- Request bodies/headers, raw exception messages, console/UI breadcrumbs, arbitrary
  logger extras and AI request/response content are excluded. Query strings,
  fragments and private storage paths are removed from telemetry URLs. Exceptions
  retain stack locations/type and approved operation context rather than their raw
  potentially financial message. Pino uses the same context allowlist.
- In Settings, the browser-local tracking preference disables both replay tools
  and Clarity analytics. Essential sanitized Sentry error/trace collection remains
  separately governed. A policy-disabled deployment cannot be enabled by a browser
  preference. GPC and Do Not Track override analytics/replay permission.
- Opt-out is persisted before teardown. Pending Sentry replay segments are discarded
  using `stop({flush:false})`. Loaded/pending Clarity is stopped, its first-party
  session/user cookies cleared, and the document reloaded to prevent a pending
  script or existing recorder from continuing. SDK-owned cookie scope and hosted
  `stop` behavior must be verified in QA. Cookie denial alone is insufficient:
  Clarity can otherwise continue in cookieless mode.
- Logout/account changes clear user/business context and breadcrumbs, rotate the
  reference, stop the old replay, and reload if Clarity loaded or is pending. Native
  Clarity session cookies are also reset before recorder startup. Validate shared
  browsers and multiple tabs with the actual production/QA host cookie domains.
- Opt-out does not retract data already sent or cancel bytes already in flight.
  Browser preferences do not sync across devices and clearing browser storage
  resets them. Retention/deletion requests require each platform's procedures.

## Implemented Coverage

Shared entity create/update/delete hooks add bounded operation breadcrumbs,
sampled spans and Clarity named outcomes, without mutation payloads. OCR and
payment-order browser requests carry the app diagnostic reference. OCR,
payment-order and test-voice server routes attach verified identity and request
references. Payment checkout/callback/dismissal and report export milestones are
recorded without payment IDs, amounts, filenames or report contents. A checkout
callback means the client callback ran, **not** that webhook fulfillment succeeded.

Error views expose copyable support references. A Sentry event ID is used when
capture is enabled; otherwise the fallback app reference cannot resolve to a
Sentry event that was never sent. Expected validation/not-found/conflict/abort
errors do not create issues. The same Error object is captured only once by the
logger; SDK automatic deduplication remains responsible for automatic captures.

Successful NPS submission sends one info-level correlation event plus a Clarity
named event. Neither score nor comment is copied. No database column was added:
correlation is through UUID/time/app session, not a persistent NPS foreign key.
Info events also consume Sentry event quota; exclude them from error alerts.

## Dashboard Setup

1. Sentry: verify existing organization `cheque-check` / project
   `javascript-nextjs`, token scopes, readable source maps and commit release
   association. Connect GitHub with least privilege where supported by the plan.
2. Add production-only new issue/regression email notifications to the project
   owner. Exclude QA and info-level feedback events. Configure quota/usage notices
   if the free account supports them; otherwise review usage manually.
3. Clarity: create separate production/QA projects. Verify allowed-host controls
   where available, strict masking, consent settings and denied advertising
   storage. Do not enable advertising features simply to enable analytics.
4. Save filters for environment, release, custom user ID, custom session ID,
   business ID, email tag and critical named operation failures. Clarity tags are
   session-scoped and can accumulate values: `business_id=X` means the session
   included X, not that every operation happened in X. Sentry breadcrumbs/spans
   carry operation-time context.
5. Review project access, PII permissions, actual retention and deletion workflows
   in both tools. Check current free-tier feature availability rather than assuming
   profiling, cron monitors, alerts or indefinite recordings are included.

## Finding a User or Incident

1. Obtain the auth UUID, approximate time/environment and copied support reference.
2. Sentry Issues: `environment:production user.id:<uuid>`. Narrow by release or
   `operation:ocr.extract`, `request_id:<uuid>`, or
   `diagnostic_session_id:<uuid>`. Use event-ID lookup for a captured event reference.
   Inspect native trace/replay links when that data exists.
3. In the matching Clarity project, filter **Custom User ID** using the same raw
   auth UUID. Clarity hashes the search input to match its stored hashed ID.
   Narrow by custom session ID, time, release or the approved email custom tag.
4. The shared app reference is the cross-platform fallback. No native Clarity URL
   is fabricated from cookies or custom identifiers. Blockers, sampling, ingestion
   delay, opt-out and retention can mean no recording exists.

## Verification and Rollout

Run focused unit/component tests first:

```sh
npx vitest run src/lib/env/schema.test.ts src/lib/monitoring src/components/monitoring-provider.test.tsx
npm run type-check
npm run lint
npm run format:check
npm test
npm run build
```

Automated tests mock telemetry or keep it disabled. Do not enable vendor projects
for routine Playwright suites or send test credentials to telemetry.

Before enabling production, perform a temporary opt-in QA production-build smoke:

1. Confirm `qa` and the exact commit release in browser/server events, readable
   stacks, one canonical capture, UUID/email/name lookup and environment filters.
2. Temporarily force deterministic QA replay sampling, then restore conservative
   defaults. Inspect actual recordings/envelopes for cheque/account/party data,
   private URLs, tokens, AI content and payment fields, including DOM attributes.
3. Opt out before SDK load and while recording; verify no subsequent analytics or
   replay uploads after transition. Test blocked scripts, offline mode and storage
   restrictions without breaking app actions or essential error handling.
4. Use user A then B in the same browser and across tabs. Verify fresh native
   recordings, no stale profile/business identity, and correct request correlation.
   If Clarity's hosted lifecycle fails this gate, keep it disabled.
5. Verify owner email alerts and quota use. Review actual usage after 24-48 hours,
   and reduce sampling if projected free quotas are exceeded. Replay rates are
   probabilities, not guarantees; 25% error replay does not cover every error.

## Later Rollout

Critical Supabase functions (`razorpay-webhook`, `notifications-scheduler`,
`notifications-dispatcher`) are a separate rollout: they do not inherit Next.js
initialization, environment settings or browser spans. Add a supported Deno SDK,
per-invocation scopes, bounded flush and safe job/order correlation separately,
without changing signature verification, idempotency or financial payloads.
Search/printing and feature-specific workflows outside the shared mutation hooks
can be added at their owning boundaries after the foundation's QA gate passes.

The browser monitoring rollout above does not introduce a dashboard, profiling,
full Sentry Logs ingestion, new feedback widget or paid-feature dependency.
The scaling diagnostics below add a separate service-only database migration
and aggregate Edge logs; they do not enable a Deno Sentry SDK or vendor collection.

## Scaling Validation and Capacity Gates

### Repeatable local baseline

On Node 22, run `npm run test:scaling`. This is an isolated, in-memory PGlite
fixture with a reduced schema plus the actual cheque pagination, lease/settlement,
bounded scheduler, and health migrations. It never loads environment files,
accepts a remote URL, resets a Supabase project, or calls Twilio.

Defaults: 10,000 registered profiles, 1,000 eligible active voice users, one business
per profile, 20 cheques per ordinary active business, and a 10,000-cheque hotspot.
The resulting 29,980 cheque rows include Issued/Cleared history, with active users
in Asia/Kolkata, UTC, and America/New_York. Scheduling uses a fixed timestamp and
the manual force-run flag only inside this disposable fixture.

Five read scenarios target the hotspot under an authenticated RLS role: first
50-row page, last page, five-result search, exact cheque summary, and business
summary. Each gets one warmup and 25 measured samples; ten client tasks share
one **serialized** connection. Percentiles are nearest-rank and include client
queueing. p99 at 25 samples is the maximum, not a statistically robust tail estimate.
The tool checks counts, row identity/uniqueness, cross-tenant isolation, scheduler
completion/idempotency, and charging/audit idempotency for up to 200 locally
simulated accepted deliveries.

JSON stdout is reusable in CI. Errors go to stderr and exit nonzero. Local budgets
default to each read scenario p95 <= 1,000 ms and total scheduling <= 40,000 ms;
exceeding either returns `passed: false`, named `budget_failures`, and exit 1.
They are regression gates, not production latency promises. Workload/threshold
flags are shown in [scripts/README.md](../scripts/README.md#local-scaling-benchmark).
Repeat on an idle machine with the same Node/package versions before comparing.

An initial Windows/Node 22 run on 2026-10-31 measured read p95 about 689-709 ms
including ten-task queueing; scheduling 1,000 active users took about 214 ms in
six batches. All 200 simulated settlements passed accounting checks.
This demonstrates local SQL correctness and provides a baseline, **not**
production throughput, HTTP latency, 10,000 simultaneous users, or provider capacity.

### Queue Health and Alert Signals

Apply `20261031030000_notification_health.sql` during a planned migration window
(index creation can block writes), then deploy the updated scheduler/dispatcher
to emit run summaries. The existing safe notification rollout remains applicable.
Do not apply this automatically to a shared or live project.

```sh
npm run ops -- ops notification-health --env qa --json
npm run ops -- ops notification-health --env prod --check --json
```

The command makes one service-only, read-only RPC. It never claims jobs, runs a
scheduler, calls a provider, reconciles outcomes, or changes credits. Its exact
aggregates are independent of the API row cap and contain no IDs, recipients,
message text, provider SIDs, cheque amounts, or job payloads.

| Metric                                                      | Meaning                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pending_due`, `pending_future`                             | Current pending jobs split by scheduled time, including retries and lifecycle-blocked work                      |
| `processing`, `expired_leases`                              | Current claimed work; expired/missing leases need worker recovery                                               |
| `oldest_due_age_seconds`                                    | Oldest currently pending due job, zero when none                                                                |
| `reconciliation_required`                                   | Failed/cancelled jobs with an unresolved provider-start reservation; inspect legacy quarantined jobs separately |
| `*_in_window`                                               | Current terminal job states updated in the chosen recent window, **not** per-attempt outcome rates              |
| `incomplete_scheduler_runs`, `oldest_scheduler_age_seconds` | Unfinished scheduling windows and age of the oldest                                                             |
| `scheduler_checkpoint_age_seconds`                          | Time since any scheduler checkpoint updated; null means no run observed                                         |

Default alerts: due lag > 300 seconds, stale checkpoint/incomplete window > 900
seconds, any expired lease, any unresolved reservation, or no scheduler observed.
Exact threshold equality is allowed. `--check` exits 1 on alerts; JSON `ok: true`
means the RPC completed, so consumers must examine `data.alerts` and the exit code.
The command does not install a poller: schedule it externally at a reasonable
cadence (for example once/minute), suppress expected alerts during maintenance,
and review query cost before increasing polling frequency.

Worker log events `notification.scheduler.run` and `notification.dispatcher.run`
are one aggregate JSON record per normal completed/failed invocation. Scheduler
records batches, enqueues, invalid timezones, completion, budget exhaustion and
duration. Dispatcher records claims, processed/sent/skipped/failed work, provider
request and accepted/rejected/uncertain counts, reconciliation holds, finalization
retries, throttled admissions/queued results, duration, and stop reason
(`empty_queue`, `max_jobs`, `budget`, `provider_capacity`, `error`).
`provider_duration_ms` sums overlapping provider calls and may exceed invocation
duration. Provider acceptance is recorded separately from successful persistence.
An abruptly terminated worker cannot emit a final record; the database health
and platform invocation logs are the complementary signals. Targeted scheduler
operations retain their existing results rather than these cron-run metrics.

### Background Export Operations

Report CSV/JSON runs through `report_export_jobs` and service-only frozen
`report_export_rows`. Request creation takes an account advisory lock and captures
scalars and presentation relations in one MVCC statement; later edits/deletions
cannot change the exported data. Resource limits are 50,000 rows, 50 MiB of JSON
snapshot text, one queued/processing job per account, and ten requests per rolling
24 hours. Failed and cancelled requests still count toward that daily allowance.
Empty/oversized/rate-limited requests fail explicitly; there is no truncation.

The service-role-only `report-exports` Edge Function claims one job per invocation,
works in 500-row parts within a 40-second loop budget, and uses 15-second outbound
request deadlines. Paths and bytes are deterministic. Upload happens before the
transactional checkpoint; retries after lost responses safely overwrite the same
private part. Claims have two-minute renewable leases. Healthy budget pauses do
not exhaust the three failure/crash attempts. A completed job deletes its snapshot.
Worker failures are surfaced in invocation logs and eventually in job status.
`report.export.worker` JSON records contain part/ready/cleanup counts and duration,
never cheque data, storage paths, tokens, or account identifiers.

The bucket is private; only the authenticated owner of a ready, unexpired job
with a current active account/business and premium entitlement can select objects.
Downloads concatenate authenticated Storage streams without buffering a whole
file or minting signed URLs, using `private, no-store`. Access is rechecked for each
part. Revocation cannot retract bytes already sent; a later denied/missing part
errors the stream rather than returning a success-shaped partial export.
CSV spreadsheet-formula strings are prefixed with an apostrophe; numeric amounts
and quoted cheque-number text are retained. PDF/Excel remain browser exports;
settings CSV remains a browser export too.

Expiry is **24 hours from request**, not from completion. Cancellation immediately
revokes downloads. Cleanup waits until any prior worker lease has ended plus a
one-minute quarantine (including cancelled jobs), removes objects via the Storage
API, verifies the prefix is empty, then deletes snapshots/records cleanup. This
ordering makes storage failures retryable; metadata is not purged before removal.
At most five cleanup jobs and 100 part objects/job are processed at once. Cleaned
metadata is retained seven days, including failed status/error codes. User/business
deactivation and deletion also make jobs eligible for cleanup.

#### Rollout gate

The migration creates `report-exports-tick` **paused**. Do not release the new report
UI against an unmigrated database or an inactive worker. On an explicitly approved
QA project:

1. Apply migrations; verify the private bucket/RLS and existing Vault
   `project_url` / `service_role_key` entries. Deploy `report-exports` before enabling
   the cron. The existing functions deployment command now includes it.
2. Request synthetic CSV and JSON jobs, invoke the worker, and verify exact row
   counts, quote/formula handling, frozen edits, cancellation, expiry, entitlement
   revocation, and foreign-account denial. Include a 50,000-row hotspot and a
   near-50-MiB snapshot. No real customer data is needed.
3. Verify the hosting plan supports the download route's `maxDuration = 300`.
   Streaming has a 290-second overall deadline and 60-second per-part deadline;
   measure regional storage latency, client backpressure, maximum-part memory,
   function limits, and complete-download success before production rollout.
4. Enable the cron deliberately:

   ```sql
   select cron.alter_job(
     (select jobid from cron.job where jobname = 'report-exports-tick'),
     active := true
   );
   ```

5. Release the UI and monitor queued age, failed jobs, cleanup lag and storage
   usage. Pause with the same command using `active := false` if necessary; queued
   jobs and frozen snapshots persist. PDF/Excel are unaffected.

The default cron has an upper bound of **1,440 new job claims/day**, less for
multi-tick jobs, retries, or cleanup-heavy workloads. Ten thousand registrations
do not imply that all accounts can export simultaneously. Establish export-delay
SLOs and measured worker/storage throughput; do not let queue wait consume the
24-hour retention window. Production burst tests, global storage/queue budgets,
multiple worker scheduling, and externally delivered queue alerts remain rollout
follow-ups. No remote migration, deployment, activation or load test is performed
by the local Vitest coverage.

Local regression coverage applies the actual migration in PGlite and simulates
Storage failures, lease recovery, lost responses, limits, frozen snapshots,
permission checks, cancellation quarantine and streamed private downloads. PGlite
does not certify hosted HTTP concurrency, gateways or Storage policy interactions
with other deployed policies; QA must verify those separately.

### Before Declaring Production Readiness

- Agree actual active-user distribution, peak simultaneous sessions, think time,
  tenant skew, cheque history, reads/writes, and regional/network conditions.
  10,000 registrations alone do not define a throughput requirement. As an
  illustrative workload, 50 active sessions with five-second think time produce
  about 10 requests/second; validate the product's actual mix instead of assuming it.
- On an explicitly approved disposable QA project, use synthetic accounts and
  authenticated HTTP load through the real routes/RPCs. Ramp, sustain, burst and
  soak; record p50/p95/p99, non-validation errors, CPU/memory, DB connection usage,
  locks, query plans, and queue age. Keep real providers and paid operations disabled.
  No remote load runner or QA reset is executed by the local benchmark.
- Review `EXPLAIN (ANALYZE, BUFFERS)` for hotspot page/search/summary and scheduling
  queries under real RLS on PostgreSQL. PGlite omits PostgREST, relation hydration,
  TLS, pooling, independent transactions and distributed lease contention.
- Set accepted HTTP/error-rate and queue-delay SLOs from those measurements.
  Run UI/export responsiveness checks separately; PDF/Excel final serialization
  still uses browser memory and can block.
- Size provider-account throughput explicitly. A 1,000-reminder burst within
  15 minutes needs about 1.11 accepted calls/second before retries. Five calls
  per invocation are now also gated globally: one admission/second and five
  in-flight request slots by default. The gate paces database admissions, not
  exact on-wire request starts or answered-call concurrency. At ten seconds per call, roughly twenty
  jobs fit a 40-second loop; at one invocation/minute that is about 0.33 jobs/second,
  far below the nominal 200-job cap. Uncertainty holds reduce capacity further.
  Use `ops notification-provider-health` alongside queue health and measure
  prep/database latency and approved provider limits before changing concurrency
  or adding workers. See [shared capacity rollout](notification-system.md#shared-provider-capacity-rollout).
- Set operational ownership, dashboard filters, alert delivery and retention;
  observe several representative peaks after rollout. Hosted load testing,
  provider-side limit verification, automated reconciliation and production sizing remain
  explicit follow-ups, not capabilities this local benchmark certifies.
