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

Core variables are validated when the application starts. Feature-specific
credentials are validated only when that feature is invoked, so contributors
can work on core CRUD without payment or OCR credentials.

| Variable                        | Required for                     |
| ------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | All application functionality    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All application functionality    |
| `OPENAI_API_KEY`                | AI cheque scanning               |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`   | Razorpay Checkout                |
| `RAZORPAY_KEY_ID`               | Creating Razorpay orders         |
| `RAZORPAY_KEY_SECRET`           | Creating Razorpay orders         |
| `RAZORPAY_WEBHOOK_SECRET`       | Razorpay webhook verification    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Admin scripts and Edge Functions |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry telemetry                 |
| `SENTRY_AUTH_TOKEN`             | Sentry source-map uploads        |
| `NEXT_PUBLIC_LOG_LEVEL`         | Client/server log verbosity      |

Never expose service-role, Razorpay secret, OpenAI, Twilio, or webhook secrets
through a `NEXT_PUBLIC_` variable.

Sentry and Clarity are explicitly gated by environment/release configuration and
tracking policy. See [Monitoring and Session Lookup](docs/monitoring.md) for
Vercel settings, masking, browser opt-out, user/session searches and QA rollout.

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
  See [export rollout and operations](docs/monitoring.md#background-export-operations).
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
certification. See [monitoring.md](docs/monitoring.md#scaling-validation-and-capacity-gates)
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
  editor step is needed. See `docs/environment.md` and `docs/phone-auth.md`.

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
