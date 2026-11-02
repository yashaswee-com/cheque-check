# Phase 6 — Public website and contact

## Public routes

- `/` is the responsive public landing page. Signed-in visitors continue to
  `/dashboard`.
- `/features` is the public product overview.
- `/pricing` queries the live `payment_products` catalogue on the server. Only
  active products that do not require another entitlement are listed. The page
  reads the catalog amount and currency only; it does not display discounts or
  promotional promises.
- `/privacy` uses the same localized legal copy already used by the signed-in
  Privacy Policy page.
- `/contact` stores contact submissions privately and links to the existing
  WhatsApp support destination.

The former authenticated feature-management catalogue now lives at
`/features/catalog`. The public middleware allowlist matches `/features`
exactly, so the catalogue remains signed-in-only. A pricing purchase link
targets the catalogue with a product intent; unauthenticated visitors are sent
to login and returned to that intent. The existing payment API still validates
the product against the active server-side catalog and requires authentication.

The public shell is selected by a request header set by the Next.js Proxy only
for allowlisted public pages. The proxy removes any caller-supplied value on
private routes. Public pages use a full-width responsive shell; the authenticated
app retains its existing device frame and providers.

## Contact data and rate limit

`20261106030000_contact_messages.sql` creates private contact storage.
`20261107000000_shared_contact_rate_limits.sql` moves existing address buckets
into `api_rate_limits` and removes the separate contact limiter. User UUIDs
and anonymous address hashes occupy separate, constrained namespaces with
independent unique indexes. Anonymous buckets may only use the contact endpoint;
clients cannot read or write limiter rows. The authenticated limiter RPC remains
user-scoped and the contact RPC remains service-only. The submission RPC accepts up to
three messages per client address per hour and inserts the rate-limit record
and message atomically. RLS has no user-facing policies; only the service role
can execute the RPC or access the stored data.

The API validates and bounds request bodies before storage. It HMACs the
proxy-provided client IP with the server-only Supabase service-role key and
stores only that digest for rate limiting; raw IP addresses are not persisted.
Production proxy configuration must overwrite `x-real-ip` or
`x-forwarded-for` with the actual client address rather than forwarding a
caller-supplied value. Contact submissions are not sent through an email
provider; the WhatsApp link is the separate existing support option.

## Localization and verification

Public copy is in the `PublicSite` namespace in `messages/en.json`,
`messages/hi.json`, and `messages/hi-en.json`. The privacy content continues to
use the existing `Settings` and `Monitoring` namespaces.

Focused validation:

```powershell
npx vitest run src/lib/supabase/public-routes.test.ts src/lib/supabase/middleware.test.ts src/app/api/contact/route.test.ts src/features/contact/contact.migration.test.ts src/features/contact/repositories/contact.repository.test.ts src/features/contact/components/contact-form.test.tsx src/features/public-site/repositories/public-pricing.repository.test.ts src/app/public-site-pages.test.tsx
```

Apply the contact migration through the normal database migration workflow
before enabling the public form in a deployed environment.
