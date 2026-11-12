# Notifications

Notifications combine an in-app inbox, scheduled voice reminders, and optional Web Push. The inbox event store, reminder scheduler, dispatcher, and push jobs are separate parts of one database-backed system ([inbox migration](../supabase/migrations/20261103000000_notification_inbox.sql#L1-L64), [notification platform](../supabase/migrations/20261017000000_notification_platform.sql#L1-L30), [push migration](../supabase/migrations/20261103020000_web_push.sql#L1-L63)).

## Quick reference

- `/notifications` reads owner/business-scoped events; opening the page does not itself mark them read ([inbox repository](../src/features/notifications/repositories/inbox.repository.ts#L1-L55), [inbox behavior](../src/features/notifications/hooks/use-inbox.ts#L1-L76)).
- Voice delivery is scheduled and dispatched by separate Supabase Edge Functions; Twilio credentials belong to the dispatcher runtime ([cron calls](../supabase/migrations/20261017000000_notification_platform.sql#L153-L191), [dispatcher config](../supabase/functions/notifications-dispatcher/index.ts#L14-L100)).
- Push opt-in is explicit and device subscriptions are capped and owner-checked ([push service](../src/features/notifications/services/push.service.ts#L13-L115), [database constraints](../supabase/migrations/20261103020000_web_push.sql#L1-L63)).
- Provider timeouts can be uncertain outcomes; do not assume they are safe to redeliver ([push service outcome handling](../supabase/functions/_shared/web-push.service.ts#L1-L45)).

## Inbox

Inbox queries are scoped to active owned businesses and use bounded keyset pages; event rows contain event kind/business association rather than arbitrary provider payloads ([inbox migration](../supabase/migrations/20261103000000_notification_inbox.sql#L1-L64), [client repository](../src/features/notifications/repositories/inbox.repository.ts#L1-L55)). Read state changes use ownership-checked mutation RPCs ([inbox mutation policies](../supabase/migrations/20261103000000_notification_inbox.sql#L65-L111)). The scheduler generates reminder inbox events separately from voice eligibility ([scheduler logic](../supabase/migrations/20261103000000_notification_inbox.sql#L112-L169)).

## Voice reminders

PostgreSQL schedules durable work; the scheduler and dispatcher run as Edge Functions through cron calls authenticated with Vault-held credentials ([cron configuration](../supabase/migrations/20261017000000_notification_platform.sql#L153-L191), [credential provisioning](../supabase/migrations/20261021070000_cron_credentials_provisioning.sql#L1-L52)). The dispatcher checks service-role authorization, loads provider configuration, and invokes a bounded orchestration batch ([dispatcher setup](../supabase/functions/notifications-dispatcher/index.ts#L14-L105), [orchestration call](../supabase/functions/notifications-dispatcher/index.ts#L100-L125)).

The database capacity gate controls provider start rate and in-flight work across worker invocations ([capacity table and admission](../supabase/migrations/20261031050000_notification_provider_capacity.sql#L2-L67)). Credit reservation and finalization distinguish provider acceptance, definitive rejection, and uncertain outcomes ([notification accounting migration](../supabase/migrations/20261017000000_notification_platform.sql#L100-L152)).

Hindi (`hi`) and Hinglish (`hi-en`) reminder scripts spell cheque counts and totals in Hindi before sending them to Twilio's `Polly.Aditi` voice with `hi-IN`. Amounts use Indian lakh/crore grouping and the profile currency; fractional amounts are spoken digit by digit after “दशमलव” so small values such as `0.05` retain their meaning. English reminders keep their existing `en-IN` formatting. Names and bank names are not rewritten ([script generation](../supabase/functions/notifications-dispatcher/orchestrators/dispatcher.orchestrator.ts), [voice configuration](../supabase/functions/_shared/twilio-voice.service.ts)). The setup test call checks connectivity only and contains no cheque totals; verify number pronunciation with a reminder call after deploying `notifications-dispatcher`.

## Web Push

Push registration validates endpoint host/key data, binds a device to an authenticated owner, and limits the registered devices per user ([push migration](../supabase/migrations/20261103020000_web_push.sql#L1-L63)). The client requests permission only from explicit actions and reads the public VAPID key from build configuration ([push service](../src/features/notifications/services/push.service.ts#L13-L115)). The dispatcher sends opaque inbox references and locale rather than cheque contents ([dispatcher provider setup](../supabase/functions/notifications-dispatcher/index.ts#L90-L110), [worker payload](../supabase/functions/_shared/web-push.service.ts#L14-L29)).

## Operations and limits

The migration files define schedules and policies, but do not establish that cron is enabled, Vault credentials are provisioned, Edge Functions are deployed, or provider secrets are valid in a hosted project ([cron migration](../supabase/migrations/20261017000000_notification_platform.sql#L153-L191), [deployment boundary](infrastructure-and-deployment.md#deployment-verification)). The public VAPID key is read directly by the push service and is not included in the public Zod schema in this checkout; validate the build setting separately ([push service](../src/features/notifications/services/push.service.ts#L13-L57), [environment schema](../src/lib/env/schema.ts#L64-L110)).

For benchmark limitations and queue diagnostics see [scaling and observability](scaling-and-observability.md#benchmark-scope).
