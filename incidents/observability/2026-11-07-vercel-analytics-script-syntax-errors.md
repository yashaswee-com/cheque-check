# Vercel analytics script SyntaxErrors incident

## Summary and quick reference

Sentry [CHEQUE-CHECK-WEB-5](https://cheque-check.sentry.io/issues/7834164505/) groups five browser `SyntaxError` events. Four QA events point to Vercel Analytics or Speed Insights scripts on `/` and `/login`. The older production event on `/onboarding` has no stack and cannot yet be attributed to those integrations.

- **Next action:** Reproduce the QA script failures in the affected deployment-authorized browser and inspect response status, content type, and redirects without publishing credentials or raw script bodies.
- **Tracking:** [yashaswee-com/cheque-check#116](https://github.com/yashaswee-com/cheque-check/issues/116), native Bug and child of [#98](https://github.com/yashaswee-com/cheque-check/issues/98).
- **Resolution:** Unresolved. No application fix, configuration change, deployment, or Sentry resolution was performed.

## Incident metadata

- **Incident date:** 7 November 2026, based on Sentry's first recorded event.
- **Time zone:** India Standard Time (IST, UTC+05:30). Event times below are converted from Sentry UTC timestamps.
- **Start:** Unknown. The first recorded event is **14:21:54.995 IST on 7 November 2026**; this does not establish the incident start.
- **Detection:** Human detection time and detector are unknown. The operator reported discovering the issue through Sentry, without a detection timestamp.
- **Priority/severity:** Sentry priority `high`, event level `error`; the assigning actor and assignment time are unavailable. The operator approved repository `priority:P3` / native Priority `Medium` and Effort `Medium` on [#116](https://github.com/yashaswee-com/cheque-check/issues/116). These planning values do not establish user impact.
- **Affected functionality:** Browser telemetry initialization on QA public and login pages; production onboarding attribution remains unknown.
- **Affected users:** Unknown. Sentry's issue-level `userCount` was zero; this measures captured user attribution, not the number of affected people.
- **Owner:** `@sde-yashaswee`, assigned to [#116](https://github.com/yashaswee-com/cheque-check/issues/116). A separate incident-response owner was not supplied.
- **Status as of 11 November 2026:** Sentry and GitHub issue unresolved. **Operator-reported:** no known mitigation or resolution.
- **Resolution time and duration:** Unknown. No recovery was verified and incident start is unknown.

## Symptoms and impact

**Sentry-observed:** Four unhandled QA errors were captured by `auto.browser.global_handlers.onerror`, each with a single frame pointing to `app:///_vercel/insights/script.js` or `app:///_vercel/speed-insights/script.js`. Source line and column, script response, and original exception message are unavailable. The production event is a handled `SyntaxError` without a stack. Its presence in the same Sentry group does not establish a shared cause.

**Operator-reported:** The issue was discovered through Sentry only. Visible symptoms, affected-user scope, account state, browser/device, frequency beyond captured events, and reproduction steps are unknown. No login failure or onboarding outage was established.

The current root layout mounts `<Analytics />` and `<SpeedInsights />` globally ([integration imports](../../src/app/layout.tsx#L15-L16), [integration mounting](../../src/app/layout.tsx#L145-L146)). This explains why integration errors can be associated with multiple page routes, but does not establish deployed behavior at each event time.

## Timeline

| Sentry event time (IST, UTC+05:30)           | Environment | Route         | Evidence                                                                                                                                       |
| -------------------------------------------- | ----------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 November 2026, 14:21:54.995                | production  | `/onboarding` | Handled SyntaxError; no stack. Release `cheque-check@e48b92ef8fe55ed69e9b1b2aaa10c26b76ebd3af`.                                                |
| 11 November 2026, 00:10:09.031               | qa          | `/`           | Unhandled error, Speed Insights script frame. Release `1.0.0`.                                                                                 |
| 11 November 2026, 00:10:09.035               | qa          | `/`           | Unhandled error, Analytics script frame. Release `1.0.0`.                                                                                      |
| 11 November 2026, 00:10:17.386               | qa          | `/login`      | Unhandled error, Analytics script frame. Release `1.0.0`.                                                                                      |
| 11 November 2026, 00:10:17.388               | qa          | `/login`      | Unhandled error, Speed Insights script frame. Release `1.0.0`.                                                                                 |
| 11 November 2026, response time not recorded | N/A         | N/A           | The assistant inspected Sentry and repository evidence, performed approved read-only hosted checks, created #116, and documented the incident. |

Sentry's issue-level `lastSeen` was **00:10:17.386 IST on 11 November 2026**, while its latest event timestamp was **00:10:17.388 IST**. Both are retained as returned; neither establishes recovery or incident duration.

## Investigation and root-cause state

**Established:** The four QA stack frames identify the two Vercel telemetry script URLs. **Not established:** the precise parsing failure, why the script failed, whether login or onboarding was impaired, and whether the production event shares the QA cause.

Two investigation leads remain:

1. **Deployment protection:** Approved unauthenticated read-only requests on 11 November 2026 returned HTTP 302 to Vercel SSO for both QA script URLs. This blocked inspection of the deployment-authorized script response. It does not prove the affected browser received HTML or that deployment protection caused the historical SyntaxErrors.
2. **Application routing:** The current proxy matcher does not exclude `/_vercel/*` or general `.js` requests ([matcher](../../src/proxy.ts#L19)). The session middleware redirects signed-out non-public requests to `/login` ([redirect conditions](../../src/lib/supabase/middleware.ts#L48-L66)); these script URLs are not in the public route allow-lists ([allow-lists](../../src/lib/supabase/public-routes.ts#L1-L10)). Inspect the interaction with Vercel's endpoint routing rather than assuming the requests reach this middleware.

Approved read-only production checks on 11 November 2026 returned HTTP 200 with `application/javascript; charset=utf-8` for both URLs. These current response headers do not verify historical script content, browser compatibility, authentication-state behavior, execution success, or recovery from the production event.

Sentry's original exception text and source context were intentionally removed by the application's privacy scrubber ([exception scrubbing](../../src/lib/monitoring/privacy.ts#L172-L183)). Missing context is an evidence limitation, not permission to disable privacy controls or broadly suppress SyntaxErrors.

## Response and validation

- The assistant ran `npm run ops -- ops incident --issue CHEQUE-CHECK-WEB-5 --json`, which returned unresolved status, error level, five events, issue dates, and latest-event QA metadata. The command validates selected metadata and does not filter events by environment ([implementation](../../scripts/domain/incident.ts#L64-L123), [runbook](../../docs/operations-runbook.md#L63-L71)).
- The assistant used direct Sentry CLI issue and event reads to inspect the five sanitized exceptions individually, without retaining user details in this record.
- With operator approval, the assistant checked only unauthenticated script HTTP responses on QA and production. No credentialed browser reproduction was performed.
- The assistant searched existing tracker work, reused [#98](https://github.com/yashaswee-com/cheque-check/issues/98) as the parent, and created [#116](https://github.com/yashaswee-com/cheque-check/issues/116). The operator explicitly approved beginning triage now despite #98's originally post-launch scope. Existing issue bodies were not rewritten.
- Native type, Priority/Effort, labels, assignment, milestone, body, and parent relationship were read back from GitHub. No labels were created.
- No runtime code changed, so no application tests or build were run for this documentation-only response.

Read-only header checks used `curl` GET requests with a 30-second limit, no credentials, response body discarded, and status/content type inspected. The checked paths were `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` at the [QA origin](https://qa.chequecheck.in) and [production origin](https://chequecheck.in). SSO redirect URLs and their nonces are deliberately not retained.

## Follow-up and tracking

- **Incident/ticket ID:** [yashaswee-com/cheque-check#116](https://github.com/yashaswee-com/cheque-check/issues/116).
- **Parent:** [#98 — Plan post-launch triage of production Sentry errors](https://github.com/yashaswee-com/cheque-check/issues/98), itself under the related [#68 operations umbrella](https://github.com/yashaswee-com/cheque-check/issues/68).
- **Sentry issue:** [CHEQUE-CHECK-WEB-5](https://cheque-check.sentry.io/issues/7834164505/), project `cheque-check-web`.
- **Planning:** Native Bug; labels `bug`, `area:operations`, `priority:P3`; native Priority `Medium`, Effort `Medium`; assignee `@sde-yashaswee`; milestone `Public Preview - Testing`.
- **Verification owner:** The issue assignee owns follow-up; separate rollout and operational recovery owners remain unassigned.
- Reproduce both QA script failures under the relevant deployment-authorized and application account states. Establish a cause before choosing a routing fix or intentional telemetry gate.
- Check `/`, `/login`, and `/onboarding`, preserve successful telemetry and real application error reporting, and add targeted regression tests for any code change.
- Verify the stackless production event separately. Record deployed verification and recovery timestamps before resolving the entire Sentry issue.

## Evidence boundaries

Sentry grouping is not proof of common cause, zero captured users is not proof of zero impact, and route attribution is not proof of an authentication defect. No raw payload, personal data, cookies, secret values, script bodies, or SSO nonces are published. Browser details and historical network responses were unavailable; no credentialed reproduction, settings inspection, code fix, deployment, or production recovery verification occurred. Local repository evidence describes current implementation only.
