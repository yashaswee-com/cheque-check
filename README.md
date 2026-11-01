# Cheque Check

Cheque Check is a mobile-first cheque management application for businesses. It
tracks outward and inward cheques, parties, bank accounts, reminders, reports,
and paid automation features across multiple businesses.

## Technology

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- Supabase Auth, PostgreSQL, Storage, and Edge Functions
- TanStack Query for server-state caching
- Zod and React Hook Form for validation
- next-intl for English, Hindi, and Hinglish messages
- Vitest, Testing Library, and Playwright
- Sentry and Pino for error reporting and structured logs

## Requirements

- Node.js 22
- npm 11
- A Supabase project or local Supabase CLI installation
- Optional provider accounts for OpenAI, Razorpay, Twilio, and Sentry

The repository pins its runtime in `.nvmrc` and `package.json`. Use Node 22 even
if a newer Node version is installed globally.

## Local Setup

For provider accounts, dashboard settings, credential destinations, unified
resource naming, and deployment checks, follow the
[Application setup guide](docs/application-setup.md).

1. Install dependencies from the committed lockfile:

   ```bash
   npm ci
   ```

2. Run the interactive Supabase setup wizard. It links a hosted project,
   applies migrations, writes `.env.local`, and optionally deploys Edge
   Functions:

   ```bash
   npm run supabase:setup
   ```

3. Start the application:

   ```bash
   npm run dev
   ```

The app is served at `http://localhost:3000` by default.

## Environment

Set local Next.js variables in the repository-root `.env.local` file (the
`npm run supabase:setup` wizard can create it). For deployed builds, configure
them in the deployment platform's environment settings, separately for QA and
production. Next.js public variables are embedded at build time; changing one
requires a new build/deployment. The CLI has its own env-file fallback described
below.

The two Supabase public values are required for the app to start. Other
application credentials are optional until their feature is used, so core CRUD
development does not require payment, OCR, or monitoring accounts.

### Application

| Variable                              | Required / used for                                                                                                                                      | Where to get it                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`            | Required by the app and CLI; identifies the Supabase project. Deployed environments must not point at local Supabase.                                    | Supabase Dashboard → **Project Settings → API** → Project URL.                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Required by the app's browser/server Supabase clients. It is the public client key; access is constrained by Auth and Row Level Security.                | Supabase Dashboard → **Project Settings → API** → anon/public key.                                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`           | Server-only admin operations, account deactivation, and operations CLI. Edge Functions receive the Supabase service-role key from their project runtime. | Supabase Dashboard → **Project Settings → API** → service-role key. Treat as a secret.                                                           |
| `OPENAI_API_KEY`                      | Server-side AI cheque scanning and Supabase Studio's configured OpenAI integration. Only needed when using those features.                               | Create an API key in the OpenAI platform dashboard.                                                                                              |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`         | Public identifier used by Razorpay Checkout in the browser. Needed for checkout.                                                                         | Razorpay Dashboard → **Account & Settings → API Keys**.                                                                                          |
| `RAZORPAY_KEY_ID`                     | Server-side Razorpay order creation and CLI payment reconciliation.                                                                                      | Use the matching key ID from the Razorpay Dashboard API Keys page.                                                                               |
| `RAZORPAY_KEY_SECRET`                 | Server-side signing/authentication for Razorpay orders and CLI payment reconciliation.                                                                   | Revealed when creating the matching Razorpay API key pair. Keep secret.                                                                          |
| `RAZORPAY_WEBHOOK_SECRET`             | Verifies Razorpay webhook signatures in the `razorpay-webhook` Supabase Edge Function. It is not a Next.js app variable.                                 | Choose a webhook secret when configuring the webhook in the Razorpay Dashboard; set it as a Supabase Edge Function secret.                       |
| `NEXT_PUBLIC_PHONE_AUTH_ENABLED`      | Optional feature flag (`true`/`false`, default `false`) controlling whether phone OTP sign-in is shown.                                                  | Set per local/deployment environment when enabling phone auth; also configure Supabase Auth as described in [phone-auth.md](docs/phone-auth.md). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`      | Public Cloudflare Turnstile site key for CAPTCHA on phone OTP. Required when phone auth is enabled in production.                                        | Cloudflare Dashboard → **Turnstile** → create/select a widget for the app's hostnames.                                                           |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER` | Optional support contact number used to construct the app's WhatsApp support link.                                                                       | Set to the business's WhatsApp-enabled support number in international format.                                                                   |
| `NEXT_PUBLIC_LOG_LEVEL`               | Optional Pino log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`. Defaults to `debug` in development and `info` otherwise.   | Choose a level appropriate for the environment; prefer `info` in production.                                                                     |

### Monitoring and release metadata

Collection is disabled unless explicitly enabled. Set these before building
(`NEXT_PUBLIC_*` values are public build-time configuration); use separate
projects/destinations for QA and production. See [Monitoring and Session Lookup](docs/monitoring-and-session-lookup.md)
for policy, privacy controls, masking, and rollout requirements.

| Variable                                      | Use / default                                                                                                                                                     | Where to get it                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ENV`                         | App/telemetry environment: `production`, `qa`, or `development`. Required when observability is enabled.                                                          | Set to match the deployment; it is application configuration, not a provider credential.            |
| `NEXT_PUBLIC_DEPLOYMENT_KIND`                 | Deployment type: `production`, `qa`, `preview`, or `development`; previews are also detected by Vercel.                                                           | Set per deployment target. Never identify a preview as production.                                  |
| `NEXT_PUBLIC_APP_RELEASE`                     | Release identifier used to correlate telemetry and source maps. Vercel defaults to `cheque-check@<commit-sha>`; enabled local monitoring needs an explicit value. | Usually use the commit/release identifier being built.                                              |
| `NEXT_PUBLIC_OBSERVABILITY_ENABLED`           | Set `true` to enable Sentry error/trace collection; default `false`. Required `NEXT_PUBLIC_APP_ENV` and release metadata must be present.                         | Explicit deployment opt-in after monitoring configuration and policy review.                        |
| `NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED`      | Opts previews into monitoring; default `false`. Preview traffic must use QA destinations and cannot use production telemetry.                                     | Enable only for approved QA preview testing.                                                        |
| `NEXT_PUBLIC_MONITORING_POLICY_APPROVED`      | Explicit policy gate for analytics/replay; default `false`.                                                                                                       | Set `true` only after privacy and provider review for the deployment.                               |
| `NEXT_PUBLIC_SENTRY_DSN`                      | Public DSN used to send permitted Sentry events.                                                                                                                  | Sentry project → **Settings → Client Keys (DSN)**.                                                  |
| `SENTRY_AUTH_TOKEN`                           | Build-only secret used by enabled Sentry builds to upload source maps. Never expose it to browsers.                                                               | Create a narrowly scoped auth token in Sentry with the required project/release upload permissions. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID`              | Microsoft Clarity project identifier. Use separate projects for QA and production.                                                                                | Clarity project settings.                                                                           |
| `NEXT_PUBLIC_CLARITY_ENABLED`                 | Enables Clarity when monitoring is on and policy is approved; default `false`.                                                                                    | Set `true` only after the masking and opt-out checks in the monitoring guide.                       |
| `NEXT_PUBLIC_REPLAY_ENABLED`                  | Enables Sentry replay when monitoring is on and policy is approved; default `false`.                                                                              | Set `true` only after replay masking and opt-out checks.                                            |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`       | Sentry performance-trace sampling from `0` to `1`; default `0.05`.                                                                                                | Optional tuning value; use a measured rate appropriate to traffic and quota.                        |
| `NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE`       | Baseline Sentry replay sampling from `0` to `1`; default `0.01`.                                                                                                  | Optional tuning value.                                                                              |
| `NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE` | Replay sampling for eligible error sessions from `0` to `1`; default `0.25`.                                                                                      | Optional tuning value.                                                                              |

### Supabase Auth, Edge Functions, and operations CLI

These are configured in Supabase rather than exposed to the Next.js browser.
Keep provider secrets out of `NEXT_PUBLIC_*` variables.

| Variable                                                             | Use                                                                                                                                                                    | Where to get it / configure it                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`                                | Shell-only input when pushing the Supabase Auth Twilio configuration with `supabase config push`; not a Vercel variable.                                               | Twilio Console → account credentials. Configure the Auth SMS provider in Supabase; see [phone-auth.md](docs/phone-auth.md).           |
| `SUPABASE_AUTH_CAPTCHA_SECRET`                                       | Shell-only input for Supabase Auth CAPTCHA configuration; not a Vercel variable.                                                                                       | Cloudflare Turnstile widget secret key; configure it in Supabase Auth.                                                                |
| `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`                                | Supabase Auth config substitution for Apple OAuth. Apple OAuth is disabled in the checked-in Supabase config, so this is not required unless that provider is enabled. | Create/configure the Apple sign-in key and secret in Apple Developer; pass it only through the supported Supabase Auth configuration. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`      | Twilio credentials and sender used by the `notifications-dispatcher` Edge Function to deliver reminder voice calls.                                                    | Twilio Console; set these as Supabase Edge Function secrets, not app or Vercel variables.                                             |
| `NOTIFICATIONS_FORCE_RUN`                                            | Optional `true` flag for an explicitly forced scheduler invocation.                                                                                                    | Set only for a controlled operational run; normally unset/`false`.                                                                    |
| `NOTIFICATIONS_TEST_MODE`, `NOTIFICATIONS_TEST_PHONE`                | Optional dispatcher test mode and destination for controlled provider tests.                                                                                           | Set only for an authorized test; normally unset/`false`.                                                                              |
| `SUPABASE_DB_URL`                                                    | Direct/session-pooler database connection used by CLI migration/reset and QA E2E setup. Reset is destructive.                                                          | Supabase Dashboard → **Connect** / database connection details. Keep its password secret and verify the project before any reset.     |
| `SUPABASE_ACCESS_TOKEN`                                              | Optional Supabase CLI login token used by setup automation to link a hosted project.                                                                                   | Create an access token in your Supabase account settings. Prefer interactive CLI login if not automating.                             |
| `FORMAT_BASE`                                                        | Optional base ref used by `npm run format` / `format:check`; defaults to `origin/main`.                                                                                | Set to another Git ref only when formatting against a different comparison base.                                                      |
| `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_WORKERS`, `PLAYWRIGHT_PROD_BUILD` | Optional E2E target URL, worker count, and production-build mode. Defaults target the local app; production-build mode defaults to one worker.                         | Set for the Playwright run; see [e2e/README.md](e2e/README.md) before targeting a shared environment.                                 |
| `PORT`                                                               | Optional port for the app and Playwright's local target URL; defaults to `3000`.                                                                                       | Set if another local service already uses the default port.                                                                           |
| `CI`                                                                 | Enables Playwright's CI behavior (retries, `test.only` guard, CI reporter, and no server reuse).                                                                       | Automatically provided by most CI systems; normally unset locally.                                                                    |

`NODE_ENV`, `NEXT_RUNTIME`, `VERCEL`, `VERCEL_ENV`, and
`VERCEL_GIT_COMMIT_SHA` are runtime/build-platform values, not application
secrets to copy into local configuration. Vercel supplies its platform values;
Next.js supplies its runtime values.

Supabase configuration also contains optional substitutions for
`S3_HOST`, `S3_REGION`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`. They are only for
the experimental Supabase OrioleDB/S3 integration; Cheque Check does not use
that integration and does not require these values.

The Supabase Auth Twilio token above is distinct from the Twilio secrets used
by the notifications Edge Function. Supabase also provides `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions at runtime. CLI environment files
may be placed at the repository root (`.env.local`, `.env.qa`,
`.env.staging`, `.env.production`) or under `env/`; root files take precedence
and are not merged. Next.js itself expects its local env file at the repository
root. See [environment configuration and deployment sequence](docs/environment-configuration.md)
and [Ops CLI setup](scripts/README.md#one-time-setup) for operational details.
See the [documentation index](docs/README.md) for topic coverage and the
repository's document naming convention.

## Commands

| Command                      | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `npm run dev`                | Start the Next.js development server            |
| `npm run build`              | Create a production build                       |
| `npm run lint`               | Run ESLint                                      |
| `npm run type-check`         | Run strict TypeScript checks                    |
| `npm test`                   | Run the Vitest suite once                       |
| `npm run test:watch`         | Run Vitest in watch mode                        |
| `npm run test:scaling`       | Disposable local SQL benchmark for 10,000 users |
| `npm run test:coverage`      | Generate unit-test coverage                     |
| `npm run test:e2e:install`   | Install Playwright Chromium                     |
| `npm run test:e2e`           | Run Playwright tests                            |
| `npm run format`             | Format files changed from `origin/main`         |
| `npm run format:check`       | Check formatting for changed files              |
| `npm run supabase:setup`     | Link a hosted project and apply setup           |
| `npm run supabase:reset`     | Destructively reset an allowlisted test project |
| `npm run supabase:gen-types` | Regenerate committed database types             |
| `npm run ops`                | Support & ops CLI (see `scripts/README.md`)     |

The E2E runner is scaffolded but intentionally has no external-service flows
yet. See `e2e/README.md` before adding tests.

## Architecture

```text
src/app/          Next.js routes, layouts, and API handlers
src/features/     Feature-owned hooks, components, services, repositories, and entry points
src/components/   Shared application and UI components
src/hooks/        Shared query, optimistic mutation, form, and browser hooks
src/services/     Cross-feature service APIs (for example, storage)
src/repositories/ Shared repository contracts, error handling, and storage access
src/domain/       Shared business rules and entities
src/lib/          Environment, logging, utilities, and Supabase clients
src/validators/   Shared Zod form contracts
src/types/        Application domain types
messages/         Localized message catalogs
supabase/         Migrations and Edge Functions
docs/prd/         Product requirements and acceptance criteria
```

Components should not query Supabase directly. Keep database access in repositories,
or authenticated server handlers, orchestrate it through services, and expose
reactive data through typed hooks. Server-only credentials belong in server
modules or Edge Functions.

### Bounded reads and reminder delivery

- The cheque list uses 50-row server-filtered pages, with stable date/amount and
  ID ordering. Global cheque search requests at most five matches. Dashboard
  totals/distributions and business upcoming totals are database aggregates,
  independent of list pagination; the dashboard renders at most 50 today cards
  and links to the full list when there are more.
- Complete-history consumers (on-demand exports and existing related-entity views) use
  explicitly paginated reads, not a single response subject to the API row cap.
  These are live reads, not transactionally frozen export snapshots. Interactive
  pages use offset pagination; concurrent changes can move records between pages.
- Tags are loaded for visible cheque IDs. Closed native tools do not fetch a
  workspace; opening a tool enables its complete-context workflow.
- Notification scheduling checkpoints 200 profiles per SQL batch. Delivery uses
  two-minute token-owned leases, a shared database admission gate (initially one
  admission/second and five in-flight requests globally), a ten-second provider
  deadline, and bounded multi-batch invocations. Throttling requeues without
  charging credits or consuming retries; manual and sample calls use the same gate.
- One credit is reserved before a logical reminder's provider request. Acceptance
  settles it once; definitive rejection releases it before retry. Uncertain
  outcomes retain the reservation for reconciliation and are not auto-redelivered.
  See [notification-system.md](docs/notification-system.md) for deployment order,
  recovery and operational limits.

### Typed persistence and durable exports

- Cheque repositories validate published rows and relation shapes before returning
  domain entities. Nullable database presentation fields are mapped explicitly;
  missing required published fields produce a `DatabaseError`, not a cast or default.
- Dynamic workspace snapshot JSON and print layouts are validated at the repository
  boundary. Print coordinates use the same eight-field A4 constraints as the RPC.
  The database type snapshot remains hand-authored; runtime validation complements,
  rather than replaces, regenerating and reviewing types after schema changes.
- Reports load exact database summaries and only the ten most recent cheques.
  PDF/Excel verify entitlement and fetch complete history on demand, preserving
  the inward-cheque preference. They never export just the preview.
- Export adapters return promises. Callers await completion and expose failures;
  concurrent downloads are disabled while an export is running. PDF and Excel
  dependencies are dynamically imported only for the selected format.
- Report CSV/JSON requests create durable jobs with a single-statement frozen
  snapshot, including presentation relations. The private worker prepares
  deterministic 500-row parts with resumable checkpoints; downloads stream through
  an authenticated route with fresh account/business/premium checks. The report
  page shows persistent progress, download links, failures, and cancellation.
  Jobs expire 24 hours after request, with storage cleanup after worker grace.
  Limits: 50,000 cheques, 50 MiB snapshot JSON, one active export/account, and
  ten requests per rolling day. Oversized requests are rejected, never truncated.
- Browser PDF/Excel and the settings CSV export remain compatible. Browser
  adapters yield between 500-row batches, but final PDF/Excel serialization may
  still block. Background CSV escapes quotes and neutralizes spreadsheet formulas;
  JSON preserves frozen scalar/relationship data (not lifecycle/internal columns).
  Hosted storage/network performance still requires production measurements.
  See [export rollout and operations](docs/monitoring-and-session-lookup.md#background-export-operations).
- Explicit `any` is disallowed in these strengthened production boundaries and the
  reporting feature. This is an incremental lint gate, not a repository-wide
  type-cleanup rewrite.

### Local scaling checks and queue diagnostics

`npm run test:scaling` creates a disposable in-memory PGlite database, applies the
actual scaling migrations, and seeds 10,000 registered users with a 1,000-user
active subset. It measures RLS-scoped hotspot reads, exact summaries, resumable
scheduling, and simulated delivery accounting. JSON output includes p50/p95/p99,
correctness checks, and explicit latency-budget failures. No env files, hosted
database, HTTP endpoint, or real call provider is used.

```sh
npm run test:scaling
npm run test:scaling -- --samples 50 --concurrency 10 --max-p95-ms 1000
npm run ops -- ops notification-health --env qa --json
npm run ops -- ops notification-health --env prod --check --json
```

The benchmark's ten queued workers share one serialized database connection:
latencies include local queueing, not ten independent PostgreSQL connections.
Its defaults are local regression budgets, not a production SLA or capacity
certification. See [monitoring and session lookup](docs/monitoring-and-session-lookup.md#scaling-validation-and-capacity-gates)
for the workload, measurements, capacity gates, and next production checks.

The health command is read-only and service-role-only. It requires
`20261031030000_notification_health.sql`; do not mistake a missing RPC for a
healthy queue. Workers also emit aggregate JSON run summaries to existing Edge
Function logs, without sending these metrics to a new vendor. No dashboard,
scheduled alert poller, or production monitoring configuration is created.

Feature code belongs under `src/features/<feature>`. Current feature areas are
`auth`, `onboarding`, `dashboard`, `businesses`, `accounts`, `parties`,
`cheques`, `reports`, `monetization`, `profile`, and `settings`. Shared UI and
cross-feature infrastructure remain in their existing top-level folders. The
old hook, component, and repository paths are compatibility facades; new code
should import from the relevant feature entry point.

### Single sources of truth

- Shared contracts live in `src/validators`; feature-specific validators may
  live in `src/features/<feature>/validators`. Form types in `src/types/forms.ts`
  are inferred from those schemas, not handwritten in each hook.
- Drafts deliberately accept incomplete values. OCR accepts nullable extracted
  fields. CSV imports retain stricter amount/date/length limits matching their
  atomic database RPC. These are different contracts, not substitutes for the
  published form schema; common cheque-number/type and phone rules are reused.
- Cheque status transitions live in `src/domain/cheque.entity.ts`. Individual
  edits, status menus, and bulk previews use that entity. Draft exclusion is an
  additional bulk-workflow rule. Shared status mutations synchronize and roll
  back both list and detail caches; account/party views reuse the same hook.
- Cache key factories live in `src/lib/query-keys.ts`, including drafts and
  premium workspace keys. `draftKeys` is a compatibility alias, not another registry.
- Supabase browser, server, middleware, and admin clients live in
  `src/lib/supabase`. They are separate because their credentials and cookie
  lifecycles differ. Table references use its `TABLES` registry.
- Premium workspace persistence lives in its feature repository. Both workspace
  UIs share context/tool queries and execution state through feature hooks.
  Legacy service paths re-export the same API; they contain no second implementation.
- Profile closed choices and request-locale validation share
  `src/validators/profile.ts`. Onboarding and preferences share the same option
  definitions and localized reminder-option hook; onboarding retains its existing
  English/Hindi subset. An unsupported locale cookie is logged and falls
  back to English rather than attempting to load an unknown message catalog.
- Environment schemas remain next to environment infrastructure. Monetization
  identifier constants and their enum schema remain together as their canonical
  feature registry. Local component props/state types and repository interfaces
  belong next to their owners; not every local type needs a global export.

ESLint enforces these boundaries in production source: no SDK client construction
outside `src/lib/supabase`, no runtime Zod imports outside validator/registry modules,
no query hooks or runtime repository imports in UI, no inline query-key arrays,
and no string-literal database table references. Type-only imports remain allowed.
These checks prevent common layer bypasses, not arbitrary semantic duplication.
Database constraints and Edge Functions must still independently validate requests;
changing a TypeScript rule does not update deployed SQL or server functions.

## Database Workflow

- Treat migrations as forward-only once shared or deployed.
- Create a new timestamped migration for every schema, policy, function, or
  storage change.
- Review Row Level Security for every new table and storage policy.
- Run `npm run supabase:gen-types` after every schema migration and commit the
  resulting `src/types/database.types.ts` update.
- Use `TABLES` from `src/lib/supabase/tables.ts` for every table reference so
  editor completion and schema drift errors remain available.
- Deploy `razorpay-webhook`, `notifications-scheduler`, and
  `notifications-dispatcher` Edge Functions separately from the Next.js
  application (`npm run supabase:functions:deploy`). The notification
  functions need Vault credentials (`project_url`, `service_role_key`) so
  `pg_cron` can authenticate to them. `npm run ops -- dev setup` provisions
  them through the service-role-only `configure_cron_credentials` RPC; no SQL
  editor step is needed. See [environment configuration](docs/environment-configuration.md) and [phone OTP authentication](docs/phone-auth.md).

`supabase/seed.sql` contains idempotent bank reference data. The reset command
requires the linked project ref to be in `supabase/.dev-projects.json` or the
local, ignored `supabase/.dev-projects.local.json`, then requires typing the
ref to confirm the destructive operation. Edge Function secrets are not reset.

## Quality Gates

Every pull request and push to `main` runs `.github/workflows/quality.yml`:

1. Reproducible `npm ci`
2. Changed-file formatting
3. ESLint
4. Strict TypeScript
5. Unit tests
6. High/critical production dependency audit
7. Production build

Tests that read repository files or launch scripts use `node:path` helpers
instead of hard-coded Windows separators so `npm test` works on Windows and
the Ubuntu GitHub Actions runners.

Negative-path tests simulate application failures; a logged error does not mean
the test failed. Capture expected error logs with test-scoped spies, assert their
exact arguments and call counts, and restore the spies after each test. Use
one-shot mock implementations so additional unexpected errors still reach the
real logger. Do not globally silence console output or disable runtime logging
to make tests quiet.

The dependency lockfile pins patched production packages. Targeted npm overrides
make Sentry's bundler packages use the same patched glob version as the app;
their older glob 13 ranges otherwise retain vulnerable glob/minimatch copies.
The Sentry glob compatibility tests cover source-map discovery and ignore rules.
Revisit these overrides when Sentry supports the patched glob major directly.
Verify dependency changes with `npm audit --omit=dev --audit-level=high`; do not
lower the audit threshold or apply `npm audit fix --force` without testing.

The workflow also starts Supabase and runs `supabase db reset` to verify that
all migrations and seed data apply to a clean database.

Husky and lint-staged apply ESLint and Prettier to staged files before each
commit. The full repository is not mass-formatted; formatting is enforced
incrementally on changed files.

## Product Documentation

- Product requirements: `docs/prd/`
- Visual system: `DESIGN.md`
- Agent and Next.js version guidance: `AGENTS.md`

## Deployment

Deploy the Next.js application to Vercel or another Node.js 22 platform. Add the
production environment variables before building. Supabase migrations, storage
policies, scheduled jobs, secrets, and Edge Functions must be deployed through
the Supabase workflow for the matching environment.
