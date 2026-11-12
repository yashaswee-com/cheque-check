# Authentication and profile

Supabase Auth is the identity/session authority. The application adds email/password, OAuth, optional phone OTP, profile preferences, account deactivation, and an online application PIN without replacing database authorization ([session middleware](../src/lib/supabase/middleware.ts#L7-L68), [server client](../src/lib/supabase/server.ts#L6-L24), [lifecycle policies](../supabase/migrations/20261021000000_lifecycle.sql#L36-L76)).

Login and signup provide a Back control to the public homepage; on the phone
verification step it first returns to the phone field without clearing the
number. Password recovery returns to login. Authentication content scrolls
within the app shell and remains available in short landscape orientations.

## Quick reference

- Phone OTP UI is opt-in through `NEXT_PUBLIC_PHONE_AUTH_ENABLED`; production phone sign-in also requires Turnstile configuration ([environment schema](../src/lib/env/schema.ts#L75-L108)).
- Login, signup, and linking use separate phone purposes and server routes; login does not create an account ([phone flow](../src/features/auth/server/phone-auth.ts#L141-L215), [verification](../src/features/auth/server/phone-auth.ts#L232-L284)).
- PIN is an additional online UI/session gate, not a second RLS identity or at-rest encryption ([PIN gate](../src/features/security/components/pin-gate.tsx#L17-L55), [PIN database policies](../supabase/migrations/20261106010000_application_pin.sql#L1-L65)).
- Deactivation blocks database access first, then attempts Auth ban/session revocation; provider cleanup failures need operational follow-up ([deactivation flow](../src/features/auth/server/deactivate-account.ts#L21-L49), [lifecycle RPC](../supabase/migrations/20261021000000_lifecycle.sql#L396-L417)).

## Session flow

The request middleware refreshes the Supabase session and redirects unauthenticated protected requests ([middleware](../src/lib/supabase/middleware.ts#L7-L68)). User reads and writes use cookie-aware server/browser clients; the service-role admin client is a distinct server-only path ([server client](../src/lib/supabase/server.ts#L6-L24), [admin client](../src/lib/supabase/admin.ts#L1-L12)). A valid browser session does not remove the need for table-level RLS and server authorization ([lifecycle policies](../supabase/migrations/20261021000000_lifecycle.sql#L36-L76)).

## Phone OTP

Phone authentication is disabled by default in the public schema and is configured separately from reminder phone numbers ([public environment schema](../src/lib/env/schema.ts#L64-L108), [phone verification flow](../src/features/auth/server/phone-auth.ts#L141-L215)). Auth sends CAPTCHA tokens with supported requests; server endpoints distinguish login, signup, and signed-in phone linking ([phone send/verify service](../src/features/auth/server/phone-auth.ts#L141-L215), [verification service](../src/features/auth/server/phone-auth.ts#L232-L284)). Hosted SMS provider credentials and delivery configuration are external deployment dependencies ([Auth environment destinations](environment-and-secrets.md#L28-L34)).

## Profile and account lifecycle

Profile writes remove protected identity/lifecycle fields before updating allowed preferences; the repository explicitly handles deactivation as a separate path ([profile repository](../src/features/profile/repositories/profile.repository.ts#L20-L50), [profile mutations](../src/features/profile/repositories/profile.repository.ts#L100-L138)). Deactivation updates lifecycle state before provider ban and global sign-out, so the database block is the first authorization control ([deactivation orchestration](../src/features/auth/server/deactivate-account.ts#L21-L49), [SQL lifecycle function](../supabase/migrations/20261021000000_lifecycle.sql#L396-L417)).

## Application PIN

PINs are six-digit online credentials; server-side derivation uses PBKDF2-HMAC-SHA256 with a random salt and 600,000 iterations ([PIN crypto](../src/features/security/server/crypto.ts#L1-L18)). Database PIN mutation and attempt accounting are restricted to service-role operations; the migration implements lockout and single-use proof controls ([PIN migration](../supabase/migrations/20261106010000_application_pin.sql#L1-L65)). The PIN gate withholds dashboard children until server status/unlock, but a person controlling the browser or a valid Auth token can bypass UI checks; the PIN is not offline protection or encryption ([gate](../src/features/security/components/pin-gate.tsx#L17-L55), [security handler](../src/features/security/server/handler.ts#L21-L120)).

## Verification limits

The repository can show the configured flows and policy code, but it does not prove that hosted Auth providers, OTP templates, CAPTCHA, ban behavior, or delivery settings are enabled. Verify those in each target Supabase project ([environment and deployment boundary](environment-and-secrets.md#deployment-state), [Auth local configuration](../supabase/config.toml#L205-L220), [phone flow](../src/features/auth/server/phone-auth.ts#L141-L215)).
