# Day-to-day operations runbook

This runbook collects the repository's developer, test, database, provider, and deployment commands. It describes checked-in commands and configuration, not the state of any hosted account; verify the target project and its live settings before acting ([documentation evidence rules](../constitution.md#L16-L41), [environment boundary](environment-and-secrets.md#deployment-state)).

## Quick reference

- **Install dependencies:** `npm ci`
- **Start the app:** `npm run dev`
- **Run unit tests:** `npm test`
- **Run static checks:** `npm run format:check`, `npm run lint`, and `npm run type-check`
- **Check QA operations setup:** `npm run ops -- ops doctor --env qa`
- **Read QA notification health:** `npm run ops -- ops notification-health --env qa --json`
- **Apply pending QA migrations:** `npm run db:migrate -- --env qa`
- **Run QA browser tests:** `npm run test:e2e:qa` (**destructive: resets the QA database**)

These npm commands are defined in the package scripts and operations runbook; the commands being available does not mean they have been run or passed ([package scripts](../package.json#L9-L40), [operations command reference](../scripts/README.md#L295-L327), [QA E2E reset behavior](../e2e/README.md#L24-L45)).

## Environment map and safety

The operations CLI accepts `local`, `qa`, `staging`, and `prod`, which read `.env.local`, `.env.qa`, `.env.staging`, and `.env.production` respectively; exported shell variables override file values, and the CLI falls back to `env/` only when the root file is absent ([Ops environment rules](../scripts/README.md#L66-L92), [environment loader](../scripts/lib/env.ts#L7-L15)). The application schema instead accepts `development`, `qa`, or `production` as `NEXT_PUBLIC_APP_ENV`, and `development`, `qa`, `preview`, or `production` as `NEXT_PUBLIC_DEPLOYMENT_KIND` ([application environment schema](../src/lib/env/schema.ts#L15-L61), [public environment schema](../src/lib/env/schema.ts#L64-L109)).

The repository does not establish a definitive set of three hosted Supabase project references or a mapping from those projects to Vercel environments ([dev-project allowlist](../supabase/.dev-projects.json#L1-L3), [deployment boundary](infrastructure-and-deployment.md#L3-L11)). Treat the following as a **proposed naming map**, not an assertion that the projects already exist:

- **QA:** Ops selector `--env qa` reads `.env.qa`; suggested app identity is `NEXT_PUBLIC_APP_ENV=qa` and `NEXT_PUBLIC_DEPLOYMENT_KIND=qa`, with a Vercel Preview target.
- **Staging:** Ops selector `--env staging` reads `.env.staging`; suggested app identity is `NEXT_PUBLIC_APP_ENV=qa` and `NEXT_PUBLIC_DEPLOYMENT_KIND=preview`, with a Vercel custom `staging` target only if the team has configured it.
- **Production:** Ops selector `--env prod` reads `.env.production`; suggested app identity is `NEXT_PUBLIC_APP_ENV=production` and `NEXT_PUBLIC_DEPLOYMENT_KIND=production`, with the Vercel Production target.

Agree and record the real project-ref and Vercel-target mapping with the service owners before using this table. Keep refs and credentials out of documentation and source control; each operation that mutates a hosted system must use the matching target, and unknown Supabase project refs are treated as production by the Ops safety guard ([Ops write safeguards](../scripts/README.md#L80-L118)). The `.env*` files are ignored except `.env.example`; do not commit real local values ([ignore rules](../.gitignore#L30-L43), [environment example](../.env.example#L1-L5)).

### Production and destructive-operation checklist

Before a hosted write or deployment:

1. Confirm the named environment and project ref from the approved environment inventory, and inspect shell overrides because they take precedence over env files ([Ops environment rules](../scripts/README.md#L66-L92)).
2. Run the relevant read-only doctor or health check; `ops doctor` checks environment, credentials, target, migrations, and functions ([Ops command reference](../scripts/README.md#L295-L309)).
3. Preview writes with `--dry-run` where available. Ops writes show a before/after plan; production writes require the exact project ref, and `--yes` does not bypass that guard ([Ops write safeguards](../scripts/README.md#L80-L118)).
4. For database resets, stop application writes and take and verify a backup first; the reset deletes application data, replays migrations, and reloads the seed ([database reset runbook](../scripts/README.md#L329-L367)).

## First-time setup and local development

### Prerequisites and install

The package requires Node.js `>=22.12.0 <23` and declares npm `11.17.0`; install the committed dependency graph with `npm ci` ([runtime and package manager](../package.json#L1-L8)). The repository already includes Supabase CLI as a development dependency, so use `npx supabase` rather than installing a second global copy ([Supabase dependency](../package.json#L69-L92)). For Supabase local services, the official guide requires a container runtime and documents `npx supabase start`; the repository config enables migrations and seeds `supabase/seed.sql` ([Supabase local development guide](https://supabase.com/docs/guides/local-development), [local Supabase config](../supabase/config.toml#L49-L70)).

On macOS, install the optional GitHub CLI with Homebrew; install the Vercel CLI globally with npm. Authenticate interactively with `gh auth login` and `vercel login` ([official GitHub CLI macOS install](https://github.com/cli/cli/blob/trunk/docs/install_macos.md), [GitHub CLI manual](https://cli.github.com/manual/), [Vercel CLI install and login](https://vercel.com/docs/cli)).

```sh
brew install gh
npm install --global vercel
gh auth login
vercel login
```

The project does not define a release command for the GitHub CLI or direct account-administration CLIs for Clarity and Razorpay; use those providers' approved account/API workflows rather than assuming a repo command ([configured workflows](../.github/workflows/quality.yml#L1-L6), [payment support procedure](../scripts/README.md#L122-L140), [Clarity/Sentry environment settings](../.env.example#L40-L57)).

### Start and stop local services

```sh
npm ci
cp .env.example .env.local
npx supabase start
npx supabase status
npm run dev
```

`npx supabase start` and `status` use the local Supabase CLI; `.env.example` points the local app at the local API URL and directs the operator to `npx supabase status` for local keys ([Supabase local development guide](https://supabase.com/docs/guides/local-development), [local environment template](../.env.example#L8-L18)). Stop the local stack with `npx supabase stop` when you are finished ([Supabase CLI guide](https://supabase.com/docs/guides/local-development)). The app's development server is `npm run dev` ([package scripts](../package.json#L9-L24)).

Create `.env.local` from `.env.example` and enter local-only values; use only public keys in `NEXT_PUBLIC_*` variables, and keep server/provider credentials in their designated secret stores ([environment example](../.env.example#L1-L39), [secret destinations](environment-and-secrets.md#L21-L34)).

`npm run supabase:setup` is a different workflow: it interactively links a **hosted disposable development project**, applies migrations, writes `.env.local`, allowlists the project, regenerates database types, and may deploy Edge Functions. Do not use it as a local-stack start command or against a production project ([setup action](../scripts/commands/dev/setup.ts#L114-L177)).

### Run the app

```sh
npm run dev       # development server
npm run build     # production build
npm run start     # serve the production build
```

The package defines these scripts; `npm run start` serves a previously built app and does not itself build it ([package scripts](../package.json#L9-L24)). Public `NEXT_PUBLIC_*` configuration is embedded at build time, so rebuild after changing those values ([Next.js build configuration](../next.config.ts#L1-L25), [environment guidance](environment-and-secrets.md#L1-L20)).

## Tests and checks

### Routine local checks

```sh
npm run format:check
npm run lint
npm run type-check
npm test
```

The package defines formatting, lint, TypeScript, unit-test, watch, coverage, and scaling commands ([package scripts](../package.json#L9-L24)). `npm run test:watch` runs the interactive Vitest watcher; `npm run test:coverage` runs the suite with coverage; `npm run test:scaling` uses a disposable in-memory PGlite fixture and does not establish hosted PostgreSQL capacity ([package scripts](../package.json#L9-L24), [scaling test scope](../scripts/README.md#L230-L275)).

The configured GitHub Quality workflow runs changed-file formatting, lint, type-check, tests, Gitleaks, a production dependency audit, and a build on pushes and pull requests to `main`; the workflow file is configuration, not evidence that a specific run passed ([Quality workflow](../.github/workflows/quality.yml#L1-L6), [Quality checks](../.github/workflows/quality.yml#L39-L71)).

### Browser E2E tests

> **Destructive:** `npm run test:e2e:qa` resets the hosted QA database before running Playwright. Confirm that `.env.qa` points to the approved QA project and never point it at production ([E2E guide](../e2e/README.md#L1-L45)).

Install Chromium once, then run the QA suite:

```sh
npm run test:e2e:install
npm run test:e2e:qa
```

The QA runner resets the database, replays migrations and seed data, then starts the production build and runs the browser tests; `-- --skip-reset` reuses QA data, while `npm run test:e2e:qa:reset-only` performs only the reset ([E2E run instructions](../e2e/README.md#L10-L45)). The tests stub Razorpay checkout and do not verify real transactions, actual reminder delivery, or completed report-export worker execution ([E2E limits](../e2e/README.md#L143-L153)).

For the isolated mocked phone-auth spec, the E2E guide documents `npx playwright test phone-auth.spec --project=chromium --no-deps`; its OTP and Turnstile interactions are intercepted and it does not send SMS ([phone-auth E2E instructions](../e2e/README.md#L53-L75)).

## GitHub and pull-request operations

Authenticate `gh` once with `gh auth login`, then use these read/check commands:

```sh
gh auth status
gh pr status
gh pr view
gh pr checks --watch
gh run list --workflow quality.yml --limit 10
gh run view <run-id> --log-failed
```

The GitHub CLI documents authentication, pull-request check inspection, and workflow-run listing ([GitHub CLI manual](https://cli.github.com/manual/), [`gh pr checks`](https://cli.github.com/manual/gh_pr_checks), [`gh run list`](https://cli.github.com/manual/gh_run_list), [`gh run view`](https://cli.github.com/manual/gh_run_view)). The checked-in workflow is named `Quality`, triggers for `main` pushes and pull requests, and has no deployment job; follow the repository's separately documented manual deployment gate rather than assuming CI deployed the app ([workflow triggers](../.github/workflows/quality.yml#L1-L6), [E2E deployment gate](../e2e/README.md#L115-L131)).

Use the normal Git workflow to branch, commit, and open a PR; wait for required checks and review failures with `gh run view`. Do not merge or deploy based only on a local green run because the configured QA job uses external GitHub secrets and the shared hosted QA project ([QA workflow environment](../.github/workflows/quality.yml#L73-L110)).

## Supabase database and Edge Functions

### Migrations

Database changes belong in timestamped files under `supabase/migrations`; the local configuration enables migrations and seed loading ([migration and seed config](../supabase/config.toml#L49-L70), [migration workflow](https://supabase.com/docs/guides/local-development/database-migrations)). Use the Supabase CLI to create a migration and validate it against the local stack before applying it remotely ([official migration workflow](https://supabase.com/docs/guides/local-development/database-migrations)):

```sh
npx supabase migration new describe_the_change
npx supabase db reset                 # local only: rebuilds local schema and seed
npm run db:migrate -- --env qa        # hosted QA: applies pending migrations only
npm run db:migrate -- --env staging   # hosted staging: applies pending migrations only
npm run db:migrate:production         # hosted production: applies pending migrations only
```

The hosted migration aliases use the environment's `SUPABASE_DB_URL`, do not reset or reseed the database, and check that the API URL and database URL identify the same project ([database command implementation](../scripts/commands/dev/database.ts#L8-L51), [migration/reset runbook](../scripts/README.md#L329-L367)). Review migrations and take a backup before applying production changes ([database runbook](../scripts/README.md#L329-L367)).

> **Do not use a reset as a migration command.** The production reset alias deletes application rows and reloads migrations plus seed; the `supabase:reset` helper has a separate allowlisted-development-project guard ([package scripts](../package.json#L25-L40), [reset safety notes](../scripts/README.md#L329-L367)).

Generate database types after schema changes with `npm run supabase:gen-types:local` for the local stack or `npm run supabase:gen-types` for the linked project; the latter's target is the linked project, so confirm the link first ([type-generation scripts](../package.json#L35-L40)).

### Edge Functions and secrets

The repository deploy alias covers `notifications-scheduler`, `notifications-dispatcher`, `razorpay-webhook`, and `report-exports`, but it deploys to the Supabase CLI's linked project and has no explicit environment selector ([function deployment script](../package.json#L37-L40)). Prefer a project-ref-explicit command after verifying the approved ref; Supabase documents targeted function deployment using `--project-ref` ([Supabase function deployment guide](https://supabase.com/docs/guides/functions/deploy)):

```sh
npx supabase functions deploy notifications-scheduler --project-ref <project-ref>
npx supabase functions deploy notifications-dispatcher --project-ref <project-ref>
npx supabase functions deploy razorpay-webhook --project-ref <project-ref>
npx supabase functions deploy report-exports --project-ref <project-ref>
```

The `supabase/.env.example` file lists worker secrets for Twilio voice, Razorpay webhook signature verification, and Web Push; Auth SMS credentials are separate and belong in Supabase Auth configuration ([Edge secret template](../supabase/.env.example#L7-L28), [Auth SMS configuration](../supabase/config.toml#L284-L297)). Keep a private, ignored env file and set Edge secrets with Supabase CLI's `secrets set --env-file` for the explicitly selected project; do not put secret values in command arguments, shell history, or this guide ([Supabase secrets guide](https://supabase.com/docs/guides/functions/secrets), [secret ignore rules](../.gitignore#L30-L43)).

```sh
npx supabase secrets set --env-file <private-edge-secrets-file> --project-ref <project-ref>
npx supabase secrets list --project-ref <project-ref>
```

The deployment alias does not pass `--no-verify-jwt` to `razorpay-webhook`, while the handler verifies the Razorpay HMAC itself; confirm the hosted gateway behavior and test a signed event in QA before relying on webhook delivery ([deploy alias](../package.json#L37-L40), [webhook verification](../supabase/functions/razorpay-webhook/handler.ts#L30-L81), [deployment caveat](infrastructure-and-deployment.md#L45-L49)). Migrations that create cron schedules do not prove hosted cron, Vault credentials, functions, or provider secrets are active ([notification cron migration](../supabase/migrations/20261017000000_notification_platform.sql#L153-L191), [deployment verification limits](infrastructure-and-deployment.md#L3-L11)).

### Supabase operational checks

```sh
npm run ops -- ops doctor --env qa
npm run ops -- ops notification-health --env qa --json
npm run ops -- ops notification-provider-health --env qa --check --json
```

`ops doctor` checks target and setup state; notification health and provider-health are read-only diagnostics and do not dispatch calls or change limits ([Ops command reference](../scripts/README.md#L295-L309), [provider-capacity diagnostics](../scripts/README.md#L179-L195)). To diagnose a user's reminder eligibility, use `npm run ops -- voice diagnose --env qa --user <user>`; for help and exact flags, append `--help` to an Ops command ([Ops command syntax](../scripts/README.md#L1-L18), [support runbook](../scripts/README.md#L122-L180)).

## Razorpay and Twilio operations

### Razorpay payments

Use the Ops CLI to inspect and reconcile payment records. Reconciliation contacts Razorpay to verify a paid-but-not-granted order; the refund flow first requires the operator to refund in Razorpay, then record/revoke through Ops ([payment command reference](../scripts/README.md#L179-L224)).

```sh
npm run ops -- payment list --env qa --user <user>
npm run ops -- payment reconcile --env qa --ref <reference> --reason "Support case"
# First issue the refund in Razorpay, then record it:
npm run ops -- payment refund --env qa --ref <reference> --reason "Support case"
```

Use test-mode Razorpay credentials in non-production and keep the public key ID, server API key pair, and webhook signing secret distinct; the webhook secret is not the same as the Razorpay API secret ([environment example](../.env.example#L25-L39), [Edge webhook secret](../supabase/.env.example#L18-L20)). E2E checkout replaces the payment modal with a stub, so use provider-approved QA payment tests for external transaction verification ([E2E scope](../e2e/README.md#L143-L153)).

### Twilio voice and Auth SMS

Reminder-call credentials are Edge Function secrets; phone-auth SMS credentials are configured separately in Supabase Auth ([provider secret destinations](environment-and-secrets.md#L21-L34), [local Auth Twilio setting](../supabase/config.toml#L284-L297)). Start with the read-only diagnosis and inspect jobs before retrying them ([Ops support runbook](../scripts/README.md#L122-L180)):

```sh
npm run ops -- voice diagnose --env qa --user <user>
npm run ops -- voice jobs --env qa --user <user>
npm run ops -- voice jobs-inspect --env qa --id <job-id>
```

> **External side effect:** `voice sample`, `voice trigger-business`, `voice trigger-user`, `voice jobs-retry`, and `voice pipeline` can place or enqueue real calls; verify the environment, intended recipient, quota, and test-mode settings before using them ([Ops voice behavior and cautions](../scripts/README.md#L122-L180), [developer aliases](../scripts/README.md#L295-L327)). `npm run notifications:test` runs the all-users voice pipeline; it is not a harmless connectivity check ([package script](../package.json#L25-L40), [pipeline scope](../scripts/README.md#L155-L180)).

## Vercel, Sentry, and Clarity

### Vercel CLI

Install and authenticate the Vercel CLI using its official guide, then link the checkout to the approved Vercel project ([Vercel CLI overview](https://vercel.com/docs/cli), [project linking](https://vercel.com/docs/cli/link)). List or pull settings for the intended target; local env downloads contain deployment configuration and must remain in ignored local files ([Vercel env CLI](https://vercel.com/docs/cli/env), [repository ignore rules](../.gitignore#L30-L43)):

```sh
vercel login
vercel link
vercel env ls preview
vercel env ls production
vercel pull --environment=preview
vercel deploy --target=preview
```

For Vercel custom environments, use the exact custom environment configured by the account owner; the Vercel CLI supports `--target` for Preview, Production, and custom deployment targets ([Vercel deploy CLI](https://vercel.com/docs/cli/deploy)). Inspect a deployment with `vercel inspect <deployment-url> --logs` ([Vercel inspect CLI](https://vercel.com/docs/cli/inspect)). The repository does not prove that a Vercel project, staging target, or production target is linked ([deployment boundary](infrastructure-and-deployment.md#L3-L11)).

Vercel CLI supports adding/updating env vars by environment and can prompt for values; avoid passing secret values as literal CLI arguments because arguments may be recorded in shell history ([Vercel env CLI](https://vercel.com/docs/cli/env)). Add only the variable name and target interactively, for example `vercel env add NEXT_PUBLIC_CLARITY_PROJECT_ID preview`; rebuild after changing public build-time values ([env example](../.env.example#L40-L57), [build-time requirement](environment-and-secrets.md#L1-L20)).

```sh
vercel env ls preview
vercel env add NEXT_PUBLIC_OBSERVABILITY_ENABLED preview
vercel env update NEXT_PUBLIC_SENTRY_DSN preview
vercel env rm NEXT_PUBLIC_CLARITY_PROJECT_ID preview
```

These commands prompt for values where needed; confirm the selected Vercel project and environment before changing or removing a variable ([Vercel env CLI](https://vercel.com/docs/cli/env)).

A Vercel CLI deploy is an operator-triggered deployment, not a workflow in this repository. Use a preview deployment for pre-production verification; only use `vercel --prod` after approval and required checks because that option creates a production deployment ([Vercel deploy CLI](https://vercel.com/docs/cli/deploy), [repository deployment gate](../e2e/README.md#L115-L131)).

### Sentry and Microsoft Clarity

Sentry and Clarity settings in this project are public build-time flags/IDs; observability defaults off, and enabling it requires app environment and release metadata ([monitoring environment example](../.env.example#L40-L57), [monitoring schema](../src/lib/env/schema.ts#L15-L61)). Preview deployments additionally require `NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED=true`; a test asserts that the local `.env.qa` contains the monitoring, preview, and policy-approval flags, but does not prove hosted configuration ([monitoring config](../src/lib/monitoring/config.ts#L20-L46), [QA config test](../src/lib/monitoring/config.test.ts#L25-L34)).

Clarity and session recording depend on runtime monitoring, policy approval, and the user's tracking preference; this preference does not disable Sentry error monitoring when the build enables Sentry. When enabled, application code also attaches authenticated user identifiers and contact/display fields to Sentry scopes, so do not equate automatic collection opt-outs with anonymous telemetry ([tracking gates](../src/lib/monitoring/browser.ts#L37-L59), [Sentry identity](../src/lib/monitoring/browser.ts#L155-L178), [collection and scrubbing](../src/lib/monitoring/sentry-options.ts#L15-L64), [privacy guide](security-and-known-risks.md#telemetry-and-consent-boundaries)).

The public `/sentry-example-page` intentionally raises a frontend sample error and calls an API example handler that throws when reached. It is for controlled diagnostics; confirm its intended availability before using it in a production verification run ([route policy](../src/lib/supabase/public-routes.ts#L1-L17), [diagnostic page](../src/app/sentry-example-page/page.tsx#L1-L108), [example API](../src/app/api/sentry-example-api/route.ts#L1-L17)). The repository does not establish hosted project settings or actual collection state ([deployment boundary](environment-and-secrets.md#deployment-state)).

Configure the target's Vercel environment using its `NEXT_PUBLIC_*` settings rather than trying to manage project configuration with a provider CLI. A Vercel-enabled Sentry build also needs `SENTRY_AUTH_TOKEN` for source-map upload; keep that as a sensitive environment variable, not a `NEXT_PUBLIC_*` variable ([Sentry build configuration](../next.config.ts#L6-L25), [secret boundaries](environment-and-secrets.md#L21-L34)). Sentry's separate `sentry-cli` exists for release/debug-file workflows, but this repository's regular integration is through the Next.js build and does not require manually invoking `sentry-cli` for every deploy ([Sentry CLI docs](https://docs.sentry.io/cli/), [Next.js Sentry configuration](../next.config.ts#L6-L25)).

No Clarity CLI command is defined in this repository; keep Clarity project administration in the approved provider account and use Vercel CLI only to manage the app's build variables ([Clarity variables](../.env.example#L40-L57), [Clarity runtime](../src/lib/monitoring/browser.ts#L265-L308)).

## Daily / release checklist

- [ ] Confirm the environment mapping and target refs before changing configuration or data ([environment map](#environment-map-and-safety)).
- [ ] Install from the lockfile and run format, lint, type-check, and unit tests ([package scripts](../package.json#L9-L24)).
- [ ] Inspect pull-request checks and resolve failures before merge ([Quality workflow](../.github/workflows/quality.yml#L39-L71), [`gh pr checks`](https://cli.github.com/manual/gh_pr_checks)).
- [ ] Review migrations and apply them to the intended project before deploying code that depends on them ([deployment sequence](infrastructure-and-deployment.md#L10-L18)).
- [ ] Deploy Edge Functions with an explicit project ref and verify secrets, cron, and provider paths in QA ([function deployment command](../package.json#L37-L40), [deployment limits](../docs/notifications.md#L26-L29)).
- [ ] Verify the production build, correct environment variables, and deployment destination before production promotion ([environment guidance](environment-and-secrets.md#L1-L20), [deployment gate](../e2e/README.md#L115-L131)).
- [ ] Record the action, target, outcome, and follow-up; Ops writes include audit details, but database migrations and external CLI operations are not recorded through the Ops admin audit RPCs ([Ops audit behavior](../scripts/README.md#L80-L118), [database command boundary](../scripts/README.md#L329-L367)).

For support and detailed mutation flags, see the [Ops CLI reference](../scripts/README.md); for sensitive values and environment ownership, see [Environment and secrets](environment-and-secrets.md); for deployment gaps and verification boundaries, see [Infrastructure and deployment](infrastructure-and-deployment.md).
