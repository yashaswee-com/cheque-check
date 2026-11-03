# App privacy and PIN security

Apply `20261106000000_privacy_cover.sql`. The profile-backed preview cover defaults
on, uses solid white/black according to appearance, and covers the application
frame on focus loss or hidden visibility. The cover shares the shell's responsive
dimensions, border and corner radius, leaving the blue surround unchanged.
PrintScreen, and the Meta+Shift prefix of Win+Shift+S and Cmd+Shift+3/4/5,
briefly cover the view where the browser delivers those keys. Ctrl/Cmd+P is
blocked, and `beforeprint` plus `@media print` replace printed output with the
cover. The privacy cover itself never reads the clipboard.

This is **best effort**, not screenshot prevention: operating systems may capture
before browser events, and screen recording, external cameras and task-switcher
thumbnails cannot be reliably blocked by a web app. Android and iOS hardware
screenshot buttons deliver no browser event at all; blocking them requires a
native wrapper (Android `FLAG_SECURE`, iOS secure text-field layering). The preference text states
these limits. The cover also runs on public/auth routes; it never replaces Auth.

## Clipboard guard

Inside the signed-in app shell and onboarding, `ClipboardGuard` always blocks
`copy` and `cut` (including from form fields) and blocks `paste` everywhere
except editable inputs, textareas and content-editable regions, so OTPs, amounts
and names can still be pasted. Text selection is disabled outside form fields.
It is not tied to the privacy cover preference. Like the cover this is best
effort: browser developer tools, extensions, OCR or screenshots can still
extract visible data.

## Account-wide online PIN

Apply `20261106010000_application_pin.sql`. PINs are six digits and opt-in.
The Node server derives a 32-byte PBKDF2-HMAC-SHA256 digest using a random 32-byte
salt and 600,000 iterations. Neither plaintext PIN nor digest is returned to the
browser or persisted in browser storage. There is no offline unlock.

The dashboard shell does not mount its children before status is checked and,
when enabled, the PIN is verified. Unlock exists in memory only. Opening/reloading
locks again and requires fresh server status, never a cached disabled preference.
Being blurred or hidden in the background for the user's chosen time locks the app.
The choices are 1, 5, 15 or 60 minutes, and the default is 1 minute. There is a
wall-clock check on return to cover suspended browser timers. The timeout is
stored in `application_pins.lock_timeout_seconds` (apply
`20261109010000_application_pin_lock_timeout.sql`) and saved through the
service-only `security_pin_timeout` RPC. Changing it does not need fresh
verification and does not relock the current session. There is no "Immediately"
option: native camera and file pickers move the app to the background, and that
would lock the app in the middle of a form. Other tabs/devices observe PIN changes
through invalidation plus a bounded status refresh.

The App PIN Lock settings page shows an On/Off status card. When the PIN is on,
it offers Change passcode and Turn passcode off; when it is off, it offers Turn
passcode on. Every one of these actions asks for fresh verification first.

Attempt accounting is row-locked in PostgreSQL. Five incorrect attempts block
the PIN even after clearing storage or logging in again; the server requests global
Auth sign-out and the UI stays locked if sign-out fails. A successful PIN verification
resets earlier failed attempts. Setup/change/removal/recovery requires a fresh account
password or an OTP delivered to an already verified identity. Phone verification
retains the deployment's phone-auth gate. A random, hashed, five-minute proof is
single-use and required by service-only PIN mutation RPCs. Recovery changes no records.

This is an additional application UI/session lock, not a second Supabase RLS identity.
A person controlling the browser or its existing Auth token can bypass client UI and
use Auth-authorized APIs. PIN protection is not a claim of at-rest encryption,
offline protection, or protection against browser compromise. Configure hosted Auth
OTP delivery before enabling PINs for accounts without passwords.

PIN management offers codes only for the confirmed Auth contacts returned by the
server. Phone-only accounts use SMS (when phone authentication is enabled);
Google accounts use their confirmed email. An existing app password is an
optional, explicitly selected alternative, never a request for a Google password.
No new password, provider-specific recovery system, or extra identity is created.
All methods still require fresh verification and the same single-use proof.
The deployment's email OTP template must deliver a usable code, not just a
magic link; verify email/SMS delivery in staging.

The existing scaling runner includes 10,000 owner-scoped privacy profiles,
PBKDF2 PIN verification at the full 600,000-iteration work factor, and transactional
PIN removal/recovery checks. Its 1,000ms p95 budget is unchanged. The benchmark
is local serialized SQL/Node work, not an HTTP/provider or production-concurrency test.
