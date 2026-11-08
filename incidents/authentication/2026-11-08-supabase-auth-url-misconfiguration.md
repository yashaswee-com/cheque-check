# Authentication incident: Supabase Auth URL misconfiguration

- **Incident date:** 8 November 2026
- **Priority:** P1 (operator-assigned)
- **Status:** Resolved (operator-reported)
- **Time zone:** IST (UTC+05:30)

## Summary

The production Supabase Auth URL configuration pointed to `http://localhost:3000` instead of the production site. The operator reports that Google OAuth redirected users to localhost and that email signup was blocked. The operator changed the hosted Site URL to `https://chequecheck.in/` and reports authentication smoke testing complete.

## Timeline

- **08:27 IST:** Incident start/detection time reported by the operator. Whether this is the first failed attempt or the detection time was not separately established.
- **08:42 IST:** Resolution time reported by the operator, 15 minutes after the reported start/detection time.

## Impact

- Google OAuth and email signup were affected for users attempting those flows, according to the operator.
- Phone OTP verification continued to work, according to the operator.
- The operator estimates fewer than 10 accounts have the affected authentication method, based on the authentication-method table. This is not a measured failed-login count or a unique affected-user count; the operator reports that event logs were unavailable to corroborate it.
- No customer-identifying information is recorded here.

## Cause and response

**Operator-reported root cause:** The hosted Supabase Auth Site URL was set to localhost. The production OAuth flow therefore returned to localhost with a code parameter, and production login/signup did not complete.

**Action taken:** The operator changed the hosted Site URL to `https://chequecheck.in/` and reports the incident resolved and authentication smoke testing complete. The repository's OAuth service constructs its callback from the browser origin and uses `/auth/callback`; email signup does not pass an explicit redirect URL. These code paths explain why hosted Auth URL configuration matters, but they do not independently verify the live settings or the reported production failure ([OAuth redirect](../../src/features/auth/services/auth.service.ts#L42-L46), [email signup request](../../src/features/auth/repositories/auth.repository.ts#L82-L92), [callback handler](../../src/app/auth/callback/route.ts#L4-L28)).

## Tracking references

- **Incident/ticket ID:** N/A — no incident or ticket number has been assigned as of 8 November 2026.
- **Sentry issue:** N/A — the operator reports no exception was flagged and no Sentry issue was created.

## Follow-up

- **Preventive check:** The Ops doctor now reads hosted Supabase Auth configuration and checks the expected Site URL and production callback allow-list ([implementation](../../scripts/domain/ops.ts#L66-L193), [usage](../../scripts/README.md#L66-L82)).
- **Owner/status:** The operator owns the live production doctor check and reports it has not yet been run. Run it before the next production release and retain the sanitized result in the release record.
- **Related release work:** The same operator owns the remaining Step 7 notification-provider validation in the [deployment record](../../deployments.md#L18-L31).

## Evidence boundary

The times, priority, impact, count estimate, root cause, correction, and smoke-test completion above are operator-reported. No production Auth configuration response, event log, or independent end-to-end authentication trace is attached to this record. Use the documented read-only production doctor check for future pre-deployment verification ([Ops doctor](../../scripts/domain/ops.ts#L66-L193), [Ops CLI guidance](../../scripts/README.md#L66-L82)).
