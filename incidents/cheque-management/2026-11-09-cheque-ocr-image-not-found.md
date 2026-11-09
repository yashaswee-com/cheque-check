# Cheque OCR image not found incident

- **Incident date:** 9 November 2026
- **Detection:** 11:19 IST (UTC+05:30), operator-reported.
- **Start:** Unknown. The operator reports failures started before detection; the start time has not been established.
- **Priority:** Critical, assigned by the operator.
- **Owner:** The reporting operator.
- **Status:** QA verification complete (operator-reported) as of 12:23 IST on 9 November 2026. The operator approved fast-forward promotion to main. Production confirmation remains pending; the incident is open.

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

## Investigation and possible cause

Before the local change, the create form and pending-scan flow uploaded an image and requested extraction without waiting for a persisted reference. The OCR workflow attempts to sign a private image before quota consumption and provider processing ([workflow](../../src/features/cheques/services/ocr-workflow.ts#L32-L54)). The route converts a storage signing error or missing signed URL into the reported 404; the local change adds a warning with the storage status when available ([route](../../src/app/api/ocr/cheque/route.ts#L71-L85), [404 response](../../src/app/api/ocr/cheque/route.ts#L114-L119)).

The lifecycle storage policy allows authenticated reads only when an active record references the image ([policy and reference check](../../supabase/migrations/20261021000000_lifecycle.sql#L419-L443)). In a local PGlite test, an uploaded object is not selectable by its owner until an active cheque draft references it; another user cannot select it ([test](../../src/test/lifecycle-migrations.test.ts#L554-L589)). This makes a race between scanning and persisting the image reference a plausible cause, but does not establish the hosted migration state, the actual signing error, or whether the reported image had a reference at request time. Other signing errors can produce the same response. The production root cause remains unconfirmed.

## Response and resolution

- The assistant traced the repository flow and ran the focused local policy test; it passed on 9 November 2026. The test does not call the hosted storage service or reproduce the production request.
- The assistant changed the upload handler to save a new or existing draft reference before returning the image URL to the OCR flow. On save failure the handler restores the previous form image and reports an error ([upload handler](../../src/features/cheques/hooks/use-create-cheque.ts#L247-L286)). This creates or updates a draft when an image is selected; it does not broaden the storage policy.
- Local scan integration tests cover pending scans, save failure, and updating an existing draft with mocked storage, draft services, and OCR ([integration tests](../../src/features/cheques/hooks/cheque-scan-draft.integration.test.tsx#L122-L213)). A targeted run of nine test files passed 162 tests, including the PGlite policy test; the local TypeScript check and lint of changed source files also passed. These checks do not establish hosted behavior.
- The operator reports the fix works locally and in QA. The QA build was independently observed Ready, but the assistant did not independently perform an authenticated QA scan.
- Implementation commits are `ef4dad7` (`feat(drafts): expose confirmed immediate saves`) and `6cf4143` (`fix(ocr): persist cheque image references before scanning`). The operator approved promotion only after reporting QA success.
- No production OCR verification or resolution has been reported.
- **Resolution time and duration:** Unknown; the incident is not reported resolved and its exact start time is unknown.

## Follow-up

- The operator should verify the deployed application and database migration versions, and investigate the storage signing failure and reference state using authorized, privacy-preserving diagnostics.
- Fast-forward main from the verified QA history without a merge commit or history rewrite. Verify the resulting production deployment's commit before testing.
- The operator should verify upload, scan, failure handling, and privacy boundaries in production after deployment, using authorized test data. Record the production confirmation time before resolving this incident.
- Sentry cross-verification is deferred at the operator's request. The configured token returned HTTP 403 for both the Sentry CLI issue lookup and the read-only issue API; neither issue identity nor event details were obtained. Resume with authorized issue/event-read access; do not publish tokens, raw events, or customer data.
- **Follow-up owner:** The reporting operator; QA success is operator-reported and production verification remains pending.

## Tracking references

- **Incident/ticket ID:** Unknown — no incident or ticket ID was supplied.
- **Sentry issue:** `CHEQUE-CHECK-WEB-D`, operator-provided; CLI/API reads returned HTTP 403. Cross-verification is parked by operator request; no Sentry issue state was changed.

## Evidence boundary

The symptoms, scope, detection time, priority, owner, local and QA functional results, and Sentry reference are operator-reported. Vercel build readiness and GitHub deployment status were independently observed for the QA fix commit. Repository code and the local policy test establish only behavior in their respective contexts, not the production deployment or the cause of the reported failure. Sentry access was denied, and production confirmation remains pending. No customer-identifying data, image paths, or raw logs are included.
