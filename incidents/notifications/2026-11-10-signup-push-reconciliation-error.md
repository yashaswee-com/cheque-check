# Signup push reconciliation TypeError incident

- **Incident date:** 10 November 2026.
- **Start:** Unknown. Sentry's first event is not evidence of when the incident began.
- **Detection:** Human detection time is unknown. Sentry first recorded the issue at **11:23:23 IST (UTC+05:30)**.
- **Priority:** Sentry issue priority was `high` and event level was `error`; who assigned the Sentry priority and when are unknown. Repository triage priority is unset because user impact has not been established.
- **Owner:** `@sde-yashaswee` is assigned to GitHub issue [#115](https://github.com/yashaswee-com/cheque-check/issues/115) for QA follow-up.
- **Status as of 18:36 UTC on 10 November 2026:** Scoped QA initialization checks passed; full supported-browser push lifecycle verification remains outstanding, and GitHub issue #115 remains open ([QA evidence](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775954634)). Sentry was unresolved at the earlier 14:20 IST read; its current state and production recovery were not rechecked.

## Summary and impact

Sentry reported a handled `TypeError` on the `/signup` route. Its sanitized title is `TypeError: Exception message withheld; inspect stack and operation context`; the event metadata points to `src/features/notifications/services/push.service.ts`. Sentry showed 65 events and a user count of zero in the queried production issue. That count does not establish that no users were affected. No separate operator report, affected-user count, or confirmed signup failure was available; user impact is unknown.

## Timeline

- **11:23:23 IST, 10 November 2026:** Sentry's first event for the issue. This is an event timestamp, not a confirmed incident start or human detection time.
- **By 14:20:16 IST, 10 November 2026:** A fresh Sentry read showed 65 events, with this as the latest event. The issue remained unresolved.
- **10 November 2026, time not recorded:** The assistant inspected the sanitized stack and the push reconciliation flow, added a guard for registrations without `pushManager.getSubscription()`, and added a regression test.
- **10 November 2026, time not recorded:** The focused push-service tests, lint for the changed files, and TypeScript check passed locally. No QA deployment or functional QA verification was performed.
- **Approximately 18:31 UTC, 10 November 2026:** QA resolved but redirected to Vercel authentication; functional verification was initially blocked ([status update and commit references](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775859023)).
- **Approximately 18:34-18:36 UTC, 10 November 2026:** After the operator authenticated browser access, the assistant observed successful signup initialization in the unmodified browser and three isolated capability simulations. Full push lifecycle verification was not performed ([QA evidence](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775954634)).

## Investigation and possible cause

Sentry identifies `/signup` as the culprit and includes in-app frames from the push service. The application mounts `PushAccountGuard` globally, and that guard invokes push reconciliation after profile loading ([guard](../../src/features/notifications/components/push-account-guard.tsx#L9-L20)). Before this change, the push service obtained a service-worker registration and called `worker.pushManager.getSubscription()` without checking that the registration exposed a usable Push API; the current implementation checks for that method and skips the lookup when unavailable ([push service](../../src/features/notifications/services/push.service.ts#L34-L42)).

This makes an unsupported or incomplete Push API a plausible cause, but does not confirm the exact failure. Sentry withheld the exception message and source line, and the available event did not establish the browser capability or failing expression. The production root cause remains unknown.

## Response and resolution

- The assistant added a defensive Push API capability check and a test for a service-worker registration without Push API support ([regression test](../../src/features/notifications/services/push.service.test.ts#L125-L130)).
- The focused test command `npm run test -- src/features/notifications/services/push.service.test.ts` passed **8 tests**. Lint for the two changed push-service files and `npm run type-check` also passed. These are local checks only.
- The fix is committed as `bc50c2351192357cc2aeece003d29ca02aeab9f5`; the initial incident report is committed as `5fad6e4f314220f642838d83a2c6041df392a183`. Both were already committed and pushed when the assistant inspected the repository; their messages were not rewritten ([tracking comment](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775859023)).
- Scoped QA checks now pass as described below, but full push lifecycle and production recovery remain unverified. The assistant did not change the Sentry issue state.
- **Resolution time and duration:** Unknown. Scoped QA success does not establish production recovery, and the incident start time is unknown.

## QA verification

The assistant tested `https://qa.chequecheck.in/signup` in the integrated Chromium-based browser after the operator authenticated Vercel access ([QA evidence and limits](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775954634)):

- **Unmodified browser:** Signup rendered with a real service-worker registration and a callable subscription lookup. No uncaught page errors or push-account cleanup log errors were observed during the short initialization check.
- **Registration without `pushManager`:** An isolated page simulated the missing capability before application initialization. The application performed one registration lookup; no uncaught page error, cleanup log error, or visible cleanup alert was observed.
- **Registration without `getSubscription`:** The same initialization check passed, with one registration lookup and no cleanup error or alert.
- **Supported-API control with no subscription:** The application performed one registration lookup and one simulated subscription lookup, with no uncaught page errors or cleanup errors/alerts.

The temporary simulation pages were closed after testing. No account was created, OTP sent, push permission requested, or subscription modified. GitHub reported a successful Vercel deployment for `5fad6e4`, but the build SHA was not extracted from the running page. Real-device behavior, existing-subscription ownership cleanup, push opt-in, and delivery remain unverified. The QA monitoring tunnel redirected to Vercel authentication and produced CORS console errors, so absence of new Sentry events is not evidence of success ([observations and deployment link](https://github.com/yashaswee-com/cheque-check/issues/115#issuecomment-6775954634)).

## Follow-up and tracking

- Missing-Push-API initialization passed the scoped QA checks above. Confirm the full supported-browser push lifecycle remains intact before claiming all acceptance criteria are met.
- Record the QA evidence in [GitHub issue #115](https://github.com/yashaswee-com/cheque-check/issues/115). Per the operator's plan, close that GitHub issue only if the behavior is verified resolved in QA; otherwise keep it open and continue investigating.
- Sentry reference: [CHEQUE-CHECK-WEB-J](https://cheque-check.sentry.io/issues/7838557273/), project `cheque-check-web`, production environment. The latest read showed unresolved.

## Evidence boundaries

Sentry metadata and the sanitized latest-event stack were read through the authenticated CLI. No raw event payload, user identifiers, or customer data are retained here. Event count, event timestamps, and Sentry's user count do not establish the number of affected people, incident duration, the precise root cause, or recovery. Repository code and local tests do not establish deployed behavior. QA observations establish only the initialization scenarios tested above, not production recovery or a complete push lifecycle.
