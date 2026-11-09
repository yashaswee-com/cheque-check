# Cheque OCR image not found incident

- **Incident date:** 9 November 2026
- **Detection:** 11:19 IST (UTC+05:30), operator-reported.
- **Start:** Unknown. The operator reports failures started before detection; the start time has not been established.
- **Priority:** Critical, assigned by the operator.
- **Owner:** The reporting operator.
- **Status:** Resolved in production (operator-reported), confirmed at approximately 14:25 IST on 9 November 2026. As of 21:21 IST on 9 November 2026, the Sentry issue is also resolved, independently observed through a read-only query. The assistant did not change its state; the actor and time of the Sentry resolution are unknown.

## Summary and impact

The operator reports that cheque image uploads fail at the optical character recognition (OCR) step across environments, including desktop Chrome. The reported request to the cheque OCR endpoint returned HTTP 404 with `Cheque image not found.` The number of affected users and attempts is unknown; no aggregate production measurements were provided. Manual entry availability is unknown.

## Timeline

- **Before 11:19 IST, 9 November 2026:** Failures began, according to the operator; the exact start time is unknown.
- **11:19 IST, 9 November 2026:** The operator detected and reported the incident.
- **11:22 IST, 9 November 2026:** Repository investigation and a focused local database-policy test identified a possible upload-to-scan authorization mismatch. This has not been confirmed against the hosted deployment.
- **11:28 IST, 9 November 2026:** The assistant implemented and tested a local change that saves the image reference before scanning. The change has not been deployed or verified in production.
- **12:03 IST, 9 November 2026:** The operator reported successful local testing and required QA verification before promotion to main.
- **12:14 IST, 9 November 2026:** The assistant pushed the fix to QA at `6cf41431139f9616e1ff61e6314a2489fd10e4aa`. Vercel subsequently reported the [Preview deployment](https://vercel.com/cheque-check/cheque-check/7eurT4R4PQF1tjygkHgWeW36T8cJ) Ready; the GitHub Vercel status was success. Build readiness alone does not verify OCR.
- **12:23 IST, 9 November 2026:** The operator reported successful testing at [the QA dashboard](https://qa.chequecheck.in/dashboard) and authorized fast-forward promotion to main. Exact test steps and the test execution time were not supplied; this is the report time.
- **After QA approval, 9 November 2026:** The assistant fast-forwarded main and QA to `34840e9`, without a merge commit.
- **Approximately 14:25 IST, 9 November 2026:** Production recovery confirmed by the operator: users can upload cheques and receive OCR results. The operator supplied this time during the evening follow-up; this was not an assistant-observed production scan.
- **Evening follow-up, 9 November 2026:** Authenticated developer CLI reads verified the Sentry short ID and three production error events. The new read-only Ops incident command also returned the verified issue metadata.

## Investigation and possible cause

Before the local change, the create form and pending-scan flow uploaded an image and requested extraction without waiting for a persisted reference. The OCR workflow attempts to sign a private image before quota consumption and provider processing ([workflow](../../src/features/cheques/services/ocr-workflow.ts#L32-L54)). The route converts a storage signing error or missing signed URL into the reported 404; the local change adds a warning with the storage status when available ([route](../../src/app/api/ocr/cheque/route.ts#L71-L85), [404 response](../../src/app/api/ocr/cheque/route.ts#L114-L119)).

The lifecycle storage policy allows authenticated reads only when an active record references the image ([policy and reference check](../../supabase/migrations/20261021000000_lifecycle.sql#L419-L443)). In a local PGlite test, an uploaded object is not selectable by its owner until an active cheque draft references it; another user cannot select it ([test](../../src/test/lifecycle-migrations.test.ts#L554-L589)). This makes a race between scanning and persisting the image reference a plausible cause, but does not establish the hosted migration state, the actual signing error, or whether the reported image had a reference at request time. Other signing errors can produce the same response. The production root cause remains unconfirmed.

## Sentry cross-verification

Read-only CLI queries verified [CHEQUE-CHECK-WEB-D](https://cheque-check.sentry.io/issues/7836531237/) in `cheque-check/cheque-check-web`, numeric issue ID `7836531237`. The initial evening lookup showed unresolved; a subsequent fresh lookup at 21:21 IST showed resolved. The count remained three error events, first seen at **10:54:47 IST** and last seen at **11:17:24 IST on 9 November 2026** (Sentry UTC timestamps converted to IST). These are observed event times, not proof of the incident's first or last failed attempt or an affected-user count.

All three retrieved events carried environment `production` and release `2303877d4d24ce9caf1b8ccaa2e3ece71cd25f28`. Their breadcrumbs showed a successful private-image upload followed by `POST /api/ocr/cheque` returning HTTP 404. Each included an application frame in the OCR hook at deployed line 81 ([current error-handling location](../../src/features/cheques/hooks/use-ocr-extraction.ts#L79-L85)). This corroborates the reported failure path, but the sanitized exception data does not establish the precise signing failure or database reference state.

The assistant used `sentry issue view`, `sentry issue events --period 24h --limit 10`, and read-only event API requests, filtering output before recording evidence. See [setup and incident commands](../../docs/operations-runbook.md#read-only-incident-diagnostics). No raw events, customer identifiers, image paths, or credentials are retained here. The last-seen timestamp and lack of later events in this issue alone do not prove recovery.

## Response and resolution

- The assistant traced the repository flow and ran the focused local policy test; it passed on 9 November 2026. The test does not call the hosted storage service or reproduce the production request.
- The assistant changed the upload handler to save a new or existing draft reference before returning the image URL to the OCR flow. On save failure the handler restores the previous form image and reports an error ([upload handler](../../src/features/cheques/hooks/use-create-cheque.ts#L247-L286)). This creates or updates a draft when an image is selected; it does not broaden the storage policy.
- Local scan integration tests cover pending scans, save failure, and updating an existing draft with mocked storage, draft services, and OCR ([integration tests](../../src/features/cheques/hooks/cheque-scan-draft.integration.test.tsx#L122-L213)). A targeted run of nine test files passed 162 tests, including the PGlite policy test; the local TypeScript check and lint of changed source files also passed. These checks do not establish hosted behavior.
- The operator reports the fix works locally and in QA. The QA build was independently observed Ready, but the assistant did not independently perform an authenticated QA scan.
- Implementation commits are `ef4dad7` (`feat(drafts): expose confirmed immediate saves`) and `6cf4143` (`fix(ocr): persist cheque image references before scanning`). The operator approved promotion only after reporting QA success.
- The operator subsequently confirmed production uploads and OCR results work, at approximately 14:25 IST on 9 November 2026.
- **Resolution time and duration:** Approximately 14:25 IST, operator-reported. Detection-to-confirmation was approximately 3 hours 6 minutes; total incident duration remains unknown because the exact start time was not established.

## Follow-up

- The operator should verify the deployed application and database migration versions, and investigate the storage signing failure and reference state using authorized, privacy-preserving diagnostics.
- Main promotion is complete; production functional recovery is operator-reported. The exact deployed recovery release and detailed failure/retry/privacy test scope remain unverified.
- Earlier build-token CLI/API reads returned HTTP 403. Cross-verification subsequently succeeded through the developer CLI's authenticated login. Keep that login separate from build credentials.
- Sentry now reports the issue resolved; the assistant did not perform that mutation. The resolving actor and time were not established by the read-only metadata lookup.
- **Follow-up owner:** The reporting operator; retain the distinction between successful functional testing and a confirmed production root cause.

## Tracking references

- **Incident/ticket ID:** Unknown — no incident or ticket ID was supplied.
- **Sentry issue:** [CHEQUE-CHECK-WEB-D](https://cheque-check.sentry.io/issues/7836531237/), independently verified through the authenticated developer CLI on 9 November 2026. Earlier build-token reads returned HTTP 403. No Sentry issue state was changed.

## Evidence boundary

The symptoms, scope, detection time, priority, owner, local/QA functional results, and production recovery at approximately 14:25 IST are operator-reported. Vercel build readiness and GitHub deployment status were independently observed for the QA fix commit. Sentry issue identity, event metadata, the upload-to-404 sequence, and the OCR application frame were independently read through the authenticated CLI. Repository code and local policy tests do not establish the production signing error or reference state. No customer-identifying data, image paths, or raw logs are included.
