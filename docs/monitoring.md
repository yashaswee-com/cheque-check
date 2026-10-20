# Monitoring and Session Lookup

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
| `NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED`      | Default `false`; opt-in previews must use `APP_ENV=qa` and QA destinations                                           |
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

No monitoring dashboard, database migration, profiling, full Sentry Logs ingestion,
new feedback widget or paid-feature dependency is introduced.
