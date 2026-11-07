# Public site and feedback

Public pages, authenticated help/feedback, private contact submissions, and a published feature-request roadmap are implemented as separate route and data-access surfaces ([public route allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [feedback repository](../src/features/feedback/repositories/feedback.repository.ts#L1-L89)).

## Quick reference

- The current proxy allowlist explicitly includes `/`, `/features`, `/pricing`, `/privacy`, `/contact`, and the Sentry diagnostic page `/sentry-example-page` ([public routes](../src/lib/supabase/public-routes.ts#L1-L17)).
- Contact form data is validated and submitted through a service-only RPC; the database enforces an address-hash rate limit ([contact route](../src/app/api/contact/route.ts#L10-L105), [rate limit migration](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)).
- Authenticated feedback begins private; only published feature requests appear on the roadmap ([feedback policies](../supabase/migrations/20261106020000_feedback_roadmap.sql#L1-L95)).
- Help content is locale-catalog based, with English, Hindi, and Hinglish catalogs ([catalog tests](../src/i18n/catalogs.test.ts#L1-L70), [message catalogs](../messages/en.json#L1-L20)).

## Public routes

The public shell allowlist is configured in `public-routes.ts`, and middleware treats routes outside the allowlist as protected ([allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [middleware redirect](../src/lib/supabase/middleware.ts#L49-L68)). Pricing reads the server product catalog, while payment creation still validates the requested product on the server ([pricing route](../src/app/%28public%29/pricing/page.tsx#L1-L80), [order route](../src/app/api/payments/create-order/route.ts#L30-L60)).

The public shell includes optional Meta Pixel controls in its footer. The user choice is stored in browser `localStorage`; the Pixel script loads only after acceptance, and the code limits PageView events to an explicit public-route set. Query strings, fragments, Global Privacy Control, and Do Not Track suppress tracking; rejecting or withdrawing consent sends a revoke signal and clears the `_fbp` and `_fbc` cookies ([consent component](../src/components/public-site/meta-pixel-consent.tsx#L6-L19), [tracking and revocation](../src/components/public-site/meta-pixel-consent.tsx#L78-L177), [public layout](../src/app/%28public%29/layout.tsx#L97-L110)). The Sentry diagnostic route is explicitly excluded from the Pixel route set ([route predicate and list](../src/components/public-site/meta-pixel-consent.tsx#L11-L19), [test](../src/components/public-site/meta-pixel-consent.test.tsx#L39-L43)). The Pixel ID is currently a source constant, not an environment variable ([consent component](../src/components/public-site/meta-pixel-consent.tsx#L6-L7)).

The localized privacy page includes a separate Meta Pixel disclosure. Its text says the Pixel may process browser/device information and the public page URL, and states that account identifiers, cheque or financial data, form contents, and payment details are not sent; confirm the disclosure with legal/privacy review rather than treating repository code as legal approval ([privacy page](../src/app/%28public%29/privacy/page.tsx#L52-L59), [English disclosure](../messages/en.json#L387), [Hindi and Hinglish disclosures](../messages/hi.json#L387), [Hinglish disclosure](../messages/hi-en.json#L387)).

The Sentry diagnostic page is deliberately public, but its API route is not in the public API allowlist and remains subject to session middleware. Its button intentionally raises a frontend error and requests an API route whose handler throws an example backend error if reached; use it only for controlled diagnostics and verify whether it should remain available in each deployment ([public page allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [API allowlist](../src/lib/supabase/public-routes.ts#L9-L17), [middleware](../src/lib/supabase/middleware.ts#L49-L68), [diagnostic page](../src/app/sentry-example-page/page.tsx#L1-L108), [intentional API error](../src/app/api/sentry-example-api/route.ts#L1-L17), [route-policy tests](../src/lib/supabase/public-routes.test.ts#L4-L27)).

## Contact submissions

The contact route bounds and validates submitted fields, obtains the proxy-provided client address, hashes it with server-only key material, and invokes a service-only database RPC ([contact handler](../src/app/api/contact/route.ts#L10-L105)). The migration constrains address-hash namespaces and rate-limits submissions in the database ([rate-limit migration](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)).

### Proxy requirement {#proxy-requirement}

The route reads forwarded address headers, so production infrastructure must replace or validate them using the actual client address. If it passes caller-supplied values through, address-based rate limiting can be influenced ([header selection](../src/app/api/contact/route.ts#L47-L64), [rate-limit RPC](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)). Verify this behavior at the deployed proxy; repository source alone cannot establish it ([deployment verification](infrastructure-and-deployment.md#deployment-verification)).

## Feedback and roadmap

Feedback rows are private to the submitter and operators; published feature requests are the only requests exposed to the signed-in roadmap and votes ([feedback policies](../supabase/migrations/20261106020000_feedback_roadmap.sql#L1-L95)). The repository submits bounded request fields and reads paginated results ([feedback repository](../src/features/feedback/repositories/feedback.repository.ts#L1-L89)). NPS prompt timing and response handling are maintained separately ([NPS service](../src/features/feedback/services/nps.service.ts#L1-L46)).

## Route-policy check

A route's location under the public route group does not itself make it public; middleware uses the explicit allowlist ([public route policy](../src/lib/supabase/public-routes.ts#L1-L17), [middleware](../src/lib/supabase/middleware.ts#L49-L68)). Review new public pages against both the allowlist and route tests before release ([route tests](../src/lib/supabase/public-routes.test.ts#L1-L24)).
