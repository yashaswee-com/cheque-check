# Web Push

## Behavior

Push is free and independent of voice quotas. Device opt-in is explicit from
Notifications or notification settings. The existing profile `push_enabled`
switch controls all registered devices. Registering a device enables that switch.
Disabling one device removes only its own association. Permission is never
requested on page load, during onboarding, or by installation.

One inbox event creates at most ten persistent push jobs, one per opted-in device.
The notification-platform subscription table, scheduler, job claims, leases,
attempt audit and provider capacity slots are reused. The new `inbox_event`
purpose has a separate enum migration. Push capacity defaults to ten starts/second
and ten in-flight sends across workers. The dispatcher retains its 40-second
invocation budget and five-job claim batches.

Browser subscriptions use HTTPS, `userVisibleOnly`, and public VAPID configuration.
iOS requires an installed home-screen app; settings explain installation first.
Unsupported, unconfigured and denied states are visible. Maximum ten devices per
user is enforced under a profile lock. Endpoint ownership cannot transfer between
accounts. Only explicitly allowed browser-provider hosts are accepted.

Before sign-out or deletion, this browser's durable association is removed and
the browser unsubscribed. Failure blocks the operation and surfaces an error.
Deactivation also deletes every device server-side and cancels its pending jobs.
An account guard detaches stale browser subscriptions after account changes.
Already accepted/in-flight messages cannot be recalled: messages are generic,
have a 60-second provider TTL, and contain no financial or party details.

The worker renders fixed generic English/Hindi/Hinglish text. Payloads contain
only an opaque inbox ID and locale, not raw cheque information. Clicking opens
the same-origin inbox, never a payload-provided URL. Opening it does not mark read.
Individual inbox event clicks retain the existing explicit mark-read behavior.

HTTP 404/410 removes stale devices and cancels remaining jobs. Explicit 429/5xx
rejections retry up to three attempts with existing backoff. Timeouts/network
outcomes are uncertain, not blindly retried; expired started leases retain audit
state for operator reconciliation. Only SQL finalization is retried after lost
responses, never the provider send. Delivery logs contain device IDs, not endpoints
or encryption keys. Push provider errors do not log sensitive request bodies.

## Deployment (not performed locally)

1. Pause dispatcher cron while deploying, using existing operations tooling.
2. Apply existing provider-capacity and inbox/export migrations, followed by
   `20261103015000_inbox_push_purpose.sql` (its own transaction), then
   `20261103020000_web_push.sql`.
   The latter hardens the existing subscription table: removes malformed
   endpoints/keys and retains the ten most recently seen legacy devices per user.
   It revokes direct client access; subscription RPCs are the only write path.
3. Generate deployment VAPID keys in trusted operator tooling. Do not commit,
   paste into chats, or log private keys.
4. Set Edge secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
   (a valid operator contact `mailto:` or HTTPS URL). Set the matching browser
   build variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Only the public key is exposed.
5. Deploy `notifications-dispatcher` with its local Deno dependency manifest/lock
   and deploy the updated app/worker over HTTPS. Voice credentials remain
   separately required for voice jobs; missing configuration fails explicitly.
6. Resume cron, then verify an opted-in browser receives a real due/export alert.
   Test Chrome/Firefox, iOS 16.4+ installed Safari, denied permissions, logout,
   account switching, multiple devices and expired endpoints before release.

Changing VAPID keys requires users to re-register devices. Provider HTTP/device
validation and multi-connection production load remain release checks, not claims
made by the disposable PGlite benchmark.

## Validation

Run the focused Vitest notification, provider, auth and settings tests.
The existing `npm run test:scaling` includes 10,000 registered users, inbox
pagination/count/mark-all, device registration/ownership, push enqueue and simulated
quota-independent acceptance. All configured latency budgets are enforced.
No benchmark sends provider requests.

Edge type check:

```powershell
deno check --config supabase\functions\notifications-dispatcher\deno.json supabase\functions\notifications-dispatcher\index.ts
deno test --allow-env --allow-read --config supabase\functions\notifications-dispatcher\deno.json supabase\functions\notifications-dispatcher\web-push.deno-test.ts
```

The Deno test exercises real VAPID request generation and encrypted payloads with
ephemeral test-only keys, without transmitting anything or saving key material.
