# Phone OTP authentication

Phone OTP uses Supabase Auth as the provider. Email/password and OAuth
(Google/Facebook) are unchanged.

## Flows

- **Login / sign-up**: `POST /api/auth/phone/send` then `/verify` with
  `purpose: "login"`. A verified new number creates a phone-only account
  (`profiles.email` is null; nothing is fabricated).
- **Link / change login phone** (profile page): same routes with
  `purpose: "link"`, signed-in users only. The number is attached to the
  authenticated user via `updateUser({ phone })` and `phone_change` verify.
  Accounts are never auto-merged; a number owned by another user is rejected.
  This is separate from the reminder phone on the profile.
- **Deactivation**: `POST /api/account/deactivate` runs `lifecycle_deactivate()`
  first, then bans the Auth user and revokes all sessions. Verify refuses
  deactivated profiles. Operators reactivating an account must also lift the ban
  (`ban_duration: "none"`).

## Controls

| Layer         | Control                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Route         | +91 only, 10-digit mobile starting 6-9, normalised to E.164             |
| Database      | `20261021050000_phone_auth.sql` trigger on `auth.users` rejects non-+91 |
| Supabase Auth | `max_frequency=60s`, `sms_sent` rate limit, CAPTCHA (Turnstile)         |
| App           | link sends limited to 5/hour via `consume_api_rate_limit`               |
| Client        | 60 s resend countdown, single-use captcha token per send                |
| Errors        | Safe codes only; provider text is never returned or logged              |

Expired and wrong codes are indistinguishable (`invalid_or_expired_code`).
SMS OTP expiry is a hosted Auth setting (suggested 300 s); set it in the
dashboard.

## Enabling locally

Set in `.env.local`: `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` (the only flag
needed to show the UI). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is optional outside
production; with it unset no captcha widget is rendered. Sends will fail
safely with `provider_unavailable` until an SMS provider is configured.
Never enable Supabase test OTPs in production.

## External gates (not done by code)

1. Twilio account, India sender / DLT template registration, spend limits and
   Geo Permissions restricted to India.
2. Configure Twilio in Supabase Auth (`[auth.sms.twilio]`, with
   `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` in the shell for `supabase config push`,
   or the dashboard). Provider secrets never go in Vercel or `NEXT_PUBLIC_*`.
3. Turnstile site key (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and secret
   (`SUPABASE_AUTH_CAPTCHA_SECRET`, Auth config), then uncomment `[auth.captcha]`.
4. Apply migrations `20261021050000` and `20261021070000`, push auth config.
5. Set `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` per Vercel environment.
