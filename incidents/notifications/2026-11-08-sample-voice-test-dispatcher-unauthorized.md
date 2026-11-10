# Sample voice test dispatcher unauthorized incident

- **Incident date:** 8 November 2026 (first Sentry event); recurred 10 November 2026.
- **Time zone:** India Standard Time (IST, UTC+05:30). All times come from Sentry event timestamps.
- **Start:** Unknown. Sentry's first event is **08:14:17 IST, 8 November 2026**; that is the first recorded failure, not a confirmed start.
- **Detection:** Human detection time and detector are unknown; none was reported.
- **Priority:** Sentry issue priority was `High` and event level was `error`; who assigned the Sentry priority is unknown. Repository priority is unset by the operator's decision.
- **Owner:** `@sde-yashaswee` is assigned to GitHub issue [#87](https://github.com/yashaswee-com/cheque-check/issues/87).
- **Status:** Ongoing and unresolved as of **00:34 IST, 11 November 2026**. The key mismatch was not changed, and the route change is local and unverified in QA.

## Quick reference

- **Symptom (operator-reported):** Selecting the sample voice test makes the test call ring, but the app shows an error toast.
- **Cause established from evidence:** The Edge Function rejects the app's immediate dispatch request with HTTP 401. The scheduled dispatcher later delivers the already-committed job.
- **Next step:** Make the app's `SUPABASE_SERVICE_ROLE_KEY` match the key accepted by the Edge runtime in QA and production. Then verify the sample test in QA.

## Summary and impact

Sentry recorded three handled errors on `POST /api/notifications/test-voice` with the sanitized title `Error: Exception message withheld; inspect stack and operation context`. The latest in-app stack frame is the route's dispatcher-status check, ``throw new Error(`Dispatcher returned ${dispatchResponse.status}`)``, at line 97 of the deployed `route.ts`. The route's catch block then returned HTTP 500 ([error response](../../src/app/api/notifications/test-voice/route.ts#L142-L147)), and the Features page shows a non-success response as an error ([client handling](<../../src/app/(dashboard)/features/catalog/page.tsx#L174-L188>)).

**Operator-reported:** The test call still arrived. Affected users were internal testers only in both QA and production. Sentry showed a user count of 2 for the issue; the operator reports that all events were internal tests. No customer impact was reported or observed.

## Timeline

- **08:14:17 IST, 8 November 2026:** First Sentry event, environment `production`, release `2303877`. The dispatcher breadcrumb shows HTTP 401.
- **10:34:18 IST, 8 November 2026:** Second Sentry event, environment `production`, release `2303877`. The dispatcher breadcrumb shows HTTP 401.
- **08:57:28 IST, 10 November 2026:** Latest Sentry event, environment `qa`, release `98c6035`. The dispatcher breadcrumb shows HTTP 401.
- **10–11 November 2026, time not recorded:** The assistant diagnosed the issue, compared key digests, changed the route locally, and posted a sanitized diagnosis to [#87](https://github.com/yashaswee-com/cheque-check/issues/87#issuecomment-6776558020).

## Root cause

**How it was established:** Sentry breadcrumbs, repository code, and read-only digest comparisons. The exact key history (rotation, migration, or setup drift) is unknown.

1. The route commits a `sample_voice_test` job and then asks the dispatcher to deliver it immediately ([dispatch call](../../src/app/api/notifications/test-voice/route.ts#L16-L34), [call site](../../src/app/api/notifications/test-voice/route.ts#L103-L108)).
2. The dispatcher rejects any request whose bearer token is not exactly its runtime `SUPABASE_SERVICE_ROLE_KEY`, and does so before it claims a job ([authorization check](../../supabase/functions/notifications-dispatcher/index.ts#L44-L50)). All three Sentry events show HTTP 401 from the dispatcher.
3. On 10 November 2026, the service-role key in the local `.env.qa` and `.env.production` files was a valid `service_role` JSON Web Token (JWT) for each matching project. Its SHA-256 digest did not match the digest of the Edge runtime `SUPABASE_SERVICE_ROLE_KEY` reported by `supabase secrets list` in either project. The comparison method was validated with the `SUPABASE_URL` digest. Hosted Vercel values were not inspected.
4. The committed job stays pending. The `notifications-dispatcher-tick` cron calls the same function with a Vault-held key ([cron job](../../supabase/migrations/20261017000000_notification_platform.sql#L178-L190)) and can claim the job. **Inference:** this scheduled run placed the call that the operator heard. QA's notification health showed a scheduler checkpoint 207 seconds old on 11 November 2026; the scheduler uses the same strict key check ([scheduler check](../../supabase/functions/notifications-scheduler/index.ts#L34-L36)), so Vault-authenticated calls were accepted at that time.

## Response

- The operator ran the `ops incident` command and direct Sentry CLI reads for issue metadata, events, and breadcrumbs.
- The assistant compared key digests in QA and, with operator approval, production. It printed only match results.
- The assistant changed the test-voice route locally. An immediate-dispatch failure is now sent to Sentry through `logger.error` ([logger capture](../../src/lib/logger.ts#L84)), and the response follows the committed job's state; a pending or processing job returns `queued` ([job state handling](../../src/app/api/notifications/test-voice/route.ts#L110-L136)). New tests cover a 401 dispatch with a pending job and a network failure ([route tests](../../src/app/api/notifications/test-voice/route.test.ts#L246-L275)).
- Local checks on 11 November 2026: `npm run test -- src/app/api/notifications/test-voice/route.test.ts` passed 17 tests; ESLint for the route directory and `npm run type-check` passed. These checks do not show deployed behavior.
- The service-role key configuration and Sentry issue state were not changed.

## Resolution

- **Resolution time and duration:** N/A — unresolved. The start time is unknown, so no duration is stated.
- **Required to resolve:** Align the app's service-role key with the Edge runtime in QA and production, or change the dispatcher authorization contract. Deploy the route change and verify in QA that a sample test shows success or queued feedback and that only one call is placed.

## Follow-up and tracking

- **Incident/ticket ID:** [GitHub issue #87](https://github.com/yashaswee-com/cheque-check/issues/87), under parent [#66](https://github.com/yashaswee-com/cheque-check/issues/66). The operator chose to comment on #87 rather than create a new issue.
- **Sentry issue:** [CHEQUE-CHECK-WEB-7](https://cheque-check.sentry.io/issues/7835173789/), project `cheque-check-web`; unresolved at the latest read.
- **Owner:** `@sde-yashaswee` (assignee of #87). Owners for the key change and deployment were not assigned.

## Evidence boundaries

Sentry metadata, sanitized stacks, breadcrumbs, and tags were read with the authenticated CLI. No raw payloads, email addresses, user IDs, phone numbers, key values, or key digests are kept here. QA `notification_jobs` and notification log tables were empty on 11 November 2026, so the cron delivery of each failed request could not be confirmed. The local env files may differ from hosted Vercel settings. Repository code and local tests do not show deployed behavior. The 2 Sentry users do not establish the number of affected people.
