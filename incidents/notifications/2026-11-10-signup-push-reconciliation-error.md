# Signup push reconciliation TypeError incident

- **Incident date:** 10 November 2026.
- **Start:** Unknown. Sentry's first event is not evidence of when the incident began.
- **Detection:** Human detection time is unknown. Sentry first recorded the issue at **11:23:23 IST (UTC+05:30)**.
- **Priority:** Sentry issue priority was `high` and event level was `error`; who assigned the Sentry priority and when are unknown. Repository triage priority is unset because user impact has not been established.
- **Owner:** `@sde-yashaswee` is assigned to GitHub issue [#115](https://github.com/yashaswee-com/cheque-check/issues/115) for QA follow-up.
- **Status:** Sentry issue unresolved; local defensive change awaits QA verification. As of **14:20 IST on 10 November 2026**, QA had not been verified and the issue had not been changed in Sentry.

## Summary and impact

Sentry reported a handled `TypeError` on the `/signup` route. Its sanitized title is `TypeError: Exception message withheld; inspect stack and operation context`; the event metadata points to `src/features/notifications/services/push.service.ts`. Sentry showed 65 events and a user count of zero in the queried production issue. That count does not establish that no users were affected. No separate operator report, affected-user count, or confirmed signup failure was available; user impact is unknown.

## Timeline

- **11:23:23 IST, 10 November 2026:** Sentry's first event for the issue. This is an event timestamp, not a confirmed incident start or human detection time.
- **By 14:20:16 IST, 10 November 2026:** A fresh Sentry read showed 65 events, with this as the latest event. The issue remained unresolved.
- **10 November 2026, time not recorded:** The assistant inspected the sanitized stack and the push reconciliation flow, added a guard for registrations without `pushManager.getSubscription()`, and added a regression test.
- **10 November 2026, time not recorded:** The focused push-service tests, lint for the changed files, and TypeScript check passed locally. No QA deployment or functional QA verification was performed.

## Investigation and possible cause

Sentry identifies `/signup` as the culprit and includes in-app frames from the push service. The application mounts `PushAccountGuard` globally, and that guard invokes push reconciliation after profile loading ([guard](../../src/features/notifications/components/push-account-guard.tsx#L9-L20)). Before this change, the push service obtained a service-worker registration and called `worker.pushManager.getSubscription()` without checking that the registration exposed a usable Push API; the current implementation checks for that method and skips the lookup when unavailable ([push service](../../src/features/notifications/services/push.service.ts#L34-L42)).

This makes an unsupported or incomplete Push API a plausible cause, but does not confirm the exact failure. Sentry withheld the exception message and source line, and the available event did not establish the browser capability or failing expression. The production root cause remains unknown.

## Response and resolution

- The assistant added a defensive Push API capability check and a test for a service-worker registration without Push API support ([regression test](../../src/features/notifications/services/push.service.test.ts#L122-L127)).
- The focused test command `npm run test -- src/features/notifications/services/push.service.test.ts` passed **8 tests**. Lint for the two changed push-service files and `npm run type-check` also passed. These are local checks only.
- The change has not been verified in QA or production. The assistant did not change the Sentry issue state.
- **Resolution time and duration:** Unknown. There is no QA or production recovery verification, and the incident start time is unknown.

## Follow-up and tracking

- Verify in QA that signup/account initialization does not throw when the service-worker registration lacks the Push API, and confirm supported-browser push behavior remains intact.
- Record the QA evidence in [GitHub issue #115](https://github.com/yashaswee-com/cheque-check/issues/115). Per the operator's plan, close that GitHub issue only if the behavior is verified resolved in QA; otherwise keep it open and continue investigating.
- Sentry reference: [CHEQUE-CHECK-WEB-J](https://cheque-check.sentry.io/issues/7838557273/), project `cheque-check-web`, production environment. The latest read showed unresolved.

## Evidence boundaries

Sentry metadata and the sanitized latest-event stack were read through the authenticated CLI. No raw event payload, user identifiers, or customer data are retained here. Event count, event timestamps, and Sentry's user count do not establish the number of affected people, incident duration, the precise root cause, or recovery. Repository code and local tests do not establish deployed behavior; QA verification is still required.
