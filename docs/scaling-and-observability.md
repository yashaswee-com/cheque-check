# Scaling and observability

Cheque Check limits interactive reads, aggregates in PostgreSQL, and moves large CSV/JSON exports and notifications to durable workers. Its local scaling benchmark is a regression tool, not a production capacity certification ([bounded-read design](../README.md#L205-L255), [benchmark implementation](../scripts/scaling-benchmark.ts#L18-L51)).

## Quick reference

- Run the local SQL benchmark with `npm run test:scaling`; defaults and accepted bounds are defined by the runner ([package script](../package.json#L13-L24), [benchmark options](../scripts/scaling-benchmark.ts#L18-L51)).
- Treat its configured p95 budget as a local regression threshold, not an observed production latency or SLA ([benchmark limitations](#benchmark-scope)).
- Use the notification-health CLI for a read-only aggregate queue snapshot only after the required health migration exists ([Ops command](../scripts/README.md#L270-L298), [health RPC](../supabase/migrations/20261031030000_notification_health.sql#L1-L70)).
- Verify deployed telemetry, worker schedules, and provider limits separately ([monitoring settings](../src/lib/env/schema.ts#L15-L61), [worker schedules](../supabase/migrations/20261017000000_notification_platform.sql#L153-L203)).

## Bounded request design

Cheque list pages use server-side filters and stable ordering, while dashboard/report totals use aggregate database queries rather than downloading a full cheque collection ([cheque repository](../src/features/cheques/repositories/cheque.repository.ts#L53-L168), [analytics RPC](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L100)). Reports load a summary and a ten-row preview; full data is requested only for an export ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)).

Background CSV/JSON export stores a frozen request snapshot with limits of 50,000 cheques and 50 MiB, creates bounded parts, and streams downloads through an authenticated route ([export snapshot and bounds](../supabase/migrations/20261031040000_background_exports.sql#L57-L112), [part processing](../supabase/migrations/20261031040000_background_exports.sql#L140-L190), [download route](../src/app/api/reports/exports/%5Bid%5D/download/route.ts#L8-L108)). Browser PDF/Excel still serialize data in the browser, so final serialization and client memory remain distinct limits ([report adapters](../src/features/reports/repositories/report.repository.ts#L102-L141), [export limits note](../README.md#L238-L255)).

Reminder scheduling checkpoints profile batches; dispatch admission is controlled by shared database capacity records and token-owned attempts ([scheduler migration](../supabase/migrations/20261017000000_notification_platform.sql#L1-L30), [provider capacity gate](../supabase/migrations/20261031050000_notification_provider_capacity.sql#L2-L67)). A provider timeout can leave an uncertain outcome, which is not automatically equivalent to a definitive rejection ([notification attempt state](../supabase/migrations/20261017000000_notification_platform.sql#L100-L152), [dispatcher outcome handling](../supabase/functions/notifications-dispatcher/index.ts#L120-L206)).

## Benchmark scope {#benchmark-scope}

`npm run test:scaling` uses a disposable in-memory PGlite database and seeds 10,000 users with an active subset; it measures selected database hotspots and reports percentiles against configured local budgets ([runner](../scripts/scaling-benchmark.ts#L18-L51), [workload setup](../scripts/scaling-benchmark.ts#L70-L122), [README benchmark description](../README.md#L258-L281)). Its worker tasks share one serialized database connection, so the results do not prove independent PostgreSQL concurrency, hosted HTTP latency, real provider throughput, or production user capacity ([benchmark harness](../scripts/scaling-benchmark.ts#L150-L190), [scope warning](../README.md#L270-L281)). No benchmark result is reported here because this documentation change did not run it.

## Telemetry and diagnostics

Sentry initialization is gated by build configuration and event sanitization; Pino logs use application-controlled context ([instrumentation](../src/instrumentation.ts#L1-L12), [Sentry options](../src/lib/monitoring/sentry-options.ts#L10-L45), [monitoring privacy](../src/lib/monitoring/privacy.ts#L1-L58)). Clarity and replay are separate opt-in flags, and deployment policy approval is an explicit gate ([environment schema](../src/lib/env/schema.ts#L15-L61), [monitoring configuration](../README.md#L86-L110)).

Notification health reports aggregate queue state through an operator-only command and does not dispatch or retry jobs ([health migration](../supabase/migrations/20261031030000_notification_health.sql#L1-L70), [Ops CLI reference](../scripts/README.md#L270-L298)). It does not install an external dashboard or alert poller ([notification worker logging](../supabase/functions/notifications-dispatcher/index.ts#L220-L257)).

## Production evidence still required

Repository code cannot establish current hosted latency, database connection concurrency, queue lag, storage throughput, provider throttling, monitoring consent, or deployed worker capacity. Measure those in QA/production using the exact hosted deployment and record workload, date, and environment before setting operational budgets ([deployment boundary](infrastructure-and-deployment.md#deployment-verification), [benchmark limitation](#benchmark-scope)).
