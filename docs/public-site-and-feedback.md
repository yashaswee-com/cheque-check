# Public site and feedback

Public pages, authenticated help/feedback, private contact submissions, and a published feature-request roadmap are implemented as separate route and data-access surfaces ([public route allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [feedback repository](../src/features/feedback/repositories/feedback.repository.ts#L1-L89)).

## Quick reference

- The current proxy allowlist explicitly includes `/`, `/features`, `/pricing`, `/privacy`, and `/contact` ([public routes](../src/lib/supabase/public-routes.ts#L1-L17)).
- Contact form data is validated and submitted through a service-only RPC; the database enforces an address-hash rate limit ([contact route](../src/app/api/contact/route.ts#L10-L105), [rate limit migration](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)).
- Authenticated feedback begins private; only published feature requests appear on the roadmap ([feedback policies](../supabase/migrations/20261106020000_feedback_roadmap.sql#L1-L95)).
- Help content is locale-catalog based, with English, Hindi, and Hinglish catalogs ([catalog tests](../src/i18n/catalogs.test.ts#L1-L70), [message catalogs](../messages/en.json#L1-L20)).

## Public routes

The public shell allowlist is configured in `public-routes.ts`, and middleware treats routes outside the allowlist as protected ([allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [middleware redirect](../src/lib/supabase/middleware.ts#L49-L68)). Pricing reads the server product catalog, while payment creation still validates the requested product on the server ([pricing route](../src/app/%28public%29/pricing/page.tsx#L1-L80), [order route](../src/app/api/payments/create-order/route.ts#L30-L60)).

## Contact submissions

The contact route bounds and validates submitted fields, obtains the proxy-provided client address, hashes it with server-only key material, and invokes a service-only database RPC ([contact handler](../src/app/api/contact/route.ts#L10-L105)). The migration constrains address-hash namespaces and rate-limits submissions in the database ([rate-limit migration](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)).

### Proxy requirement {#proxy-requirement}

The route reads forwarded address headers, so production infrastructure must replace or validate them using the actual client address. If it passes caller-supplied values through, address-based rate limiting can be influenced ([header selection](../src/app/api/contact/route.ts#L47-L64), [contact deployment notes](../docs/phase-six-public.md#L20-L45)). Verify this behavior at the deployed proxy; repository source alone cannot establish it ([deployment verification](infrastructure-and-deployment.md#deployment-verification)).

## Feedback and roadmap

Feedback rows are private to the submitter and operators; published feature requests are the only requests exposed to the signed-in roadmap and votes ([feedback policies](../supabase/migrations/20261106020000_feedback_roadmap.sql#L1-L95)). The repository submits bounded request fields and reads paginated results ([feedback repository](../src/features/feedback/repositories/feedback.repository.ts#L1-L89)). NPS prompt timing and response handling are maintained separately ([NPS service](../src/features/feedback/services/nps.service.ts#L1-L46)).

## Route-policy check

A route's location under the public route group does not itself make it public; middleware uses the explicit allowlist ([public route policy](../src/lib/supabase/public-routes.ts#L1-L17), [middleware](../src/lib/supabase/middleware.ts#L49-L68)). Review new public pages against both the allowlist and route tests before release ([route tests](../src/lib/supabase/public-routes.test.ts#L1-L80)).
