# Public site and feedback

Public pages, authenticated help/feedback, private contact submissions, and a published feature-request roadmap are implemented as separate route and data-access surfaces ([public route allowlist](../src/lib/supabase/public-routes.ts#L1-L17), [feedback repository](../src/features/feedback/repositories/feedback.repository.ts#L1-L89)).

## Quick reference

- The current proxy allowlist explicitly includes `/`, `/features`, `/pricing`, `/privacy`, `/contact`, and the Sentry diagnostic page `/sentry-example-page` ([public routes](../src/lib/supabase/public-routes.ts#L1-L17)).
- Contact form data is validated and submitted through a service-only RPC; the database enforces an address-hash rate limit ([contact route](../src/app/api/contact/route.ts#L10-L105), [rate limit migration](../supabase/migrations/20261107000000_shared_contact_rate_limits.sql#L1-L57)).
- Authenticated feedback begins private; only published feature requests appear on the roadmap ([feedback policies](../supabase/migrations/20261106020000_feedback_roadmap.sql#L1-L95)).
- Help content is locale-catalog based, with English, Hindi, and Hinglish catalogs ([catalog tests](../src/i18n/catalogs.test.ts#L1-L70), [message catalogs](../messages/en.json#L1-L20)).

## Public routes

The mobile-first landing page defaults to the existing Hinglish locale, with Hindi and English retained. Its flow is hero/portrait demo area, business pain points, three setup steps, illustrated feature stories, current-pricing link, FAQ, explicitly illustrative business scenarios, and signup. The floating light header keeps icon-labeled navigation and language selection in an accessible three-dot popover; signup still uses a full-document app-entry link. The public layout allows browser zoom. Its light palette is independent of the saved app theme, including the portaled menu and native language selector.

The landing page uses the design guide's primary blue (`#0066cc`), focus blue (`#0071e3`), white, and neutral text. Blue-tinted surfaces and hairlines are derived from that primary. The requested deviations from the original guide are a light floating header with a soft shadow, Manrope headings, IBM Plex Sans body/numbers, and subtle blue gradients confined to primary buttons. The menu expands over the full header width with grouped, stacked links and account actions; footer links are grouped beneath matching section headings. Free Hugeicons retain their original geometry with a shared two-tone blue backing treatment, not a separately licensed duotone pack.

The industry row is an animated marquee with pause/resume controls and pause on hover/focus. Its duplicate list is hidden from assistive technology. OS reduced-motion and the app's reduced-motion preference disable animation, hide the duplicate, and allow manual horizontal scrolling. Business scenarios remain manually scrollable. No additional bottom CTA overlays the page.

Landing and public-feature copy foreground optional AI cheque scanning, phone-call reminders, and PDF/Excel report downloads. Examples are not functioning scan/call/download controls. AI scan credits, call settings/eligibility/credits/service availability, and Premium export authorization remain explicit. The first-100-user offer is not finalized: the hero says “Early access” and does not claim limited slots, remaining counts, or an enforced quota.

The hero currently reserves a labeled 9:16 area for the approved 15-second video; there is no dashboard mockup, fake player, or empty video request. Once the asset is supplied, use tap-to-play native controls, inline playback, reserved dimensions, a poster, and captions for speech. An Instagram post/reel URL is not a direct video source: it requires a separate third-party embed and consideration of consent/loading, availability, and login restrictions. No Instagram scripts or embeds are loaded yet. No customer testimonials, user counts, discounts, or plan amounts are fabricated. The pricing CTA opens the existing catalogue-backed pricing page.

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
