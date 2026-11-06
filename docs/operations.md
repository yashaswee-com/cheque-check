# Operations

Use this as the day-to-day operations guide for Cheque Check. Each section gives commands first, then explains when to use them and what to check before proceeding.

## Setup

```bash
cd /Users/yashaswee/code/cheque-check
npm ci
node -v
npm -v

# Install command-line tools on macOS
brew install supabase/tap/supabase
brew install gh

supabase --version
gh --version
```

Cheque Check uses Node.js 22 and npm 11. `npm ci` installs the exact dependency versions from the lockfile. Homebrew installs the Supabase and GitHub CLIs; `npx supabase` can also run the Supabase CLI version included in this repository.

```bash
gh auth login
gh auth status
gh auth setup-git

git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global core.editor "code --wait"

git status --short
git branch --show-current
git remote -v
```

`gh auth login` signs the GitHub CLI in to your account. `gh auth setup-git` lets Git use that login for GitHub operations. `git config` sets the author identity recorded in commits; it does not sign you in.

## Supabase

**Link a hosted project** (once per working copy, and whenever changing targets):

```bash
export PROJECT_REF="<project-ref>"
npx supabase login
npx supabase link --project-ref "$PROJECT_REF"
npx supabase migration list --linked
```

Get the project ref from the Supabase project URL/dashboard. Login is interactive; use `SUPABASE_ACCESS_TOKEN` only for automation. Linking stores the selected ref for commands that use `--linked`. Always check the ref before any write.

**Run the local Supabase stack** (separate from linking a hosted project):

```bash
npx supabase start
npx supabase status
```

The status output provides the local API URL and keys. Use those in `.env.local` only when intentionally developing against the local stack. The app setup wizard may instead link a hosted development project; do not assume `npm run dev` automatically uses local Supabase.

**Environment values:**

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_DB_URL="postgresql://..."
```

The CLI operations helper reads `.env.local`, `.env.qa`, `.env.staging`, or `.env.production` according to `--env`; shell-exported values override file values. Root env files take precedence over `env/` files and are not merged. Never put service-role keys or database passwords in `NEXT_PUBLIC_*` variables, source control, or shared chat.

## DB

**Create and test a migration:**

```bash
npx supabase migration new add_<feature_name>
npx supabase db reset --local
npx supabase migration list --local
```

Edit the generated timestamped SQL file under `supabase/migrations/`; do not edit a migration already applied to a shared environment. Add a new forward migration instead. Test the migration on a disposable local database before QA or production. `db reset --local` deletes local database rows, replays the full migration history, and loads configured `supabase/seed.sql`.

**Apply pending migrations (normal path):**

```bash
npx supabase db push --dry-run --linked
npx supabase db push --linked
```

The dry run lists what would be applied; the second command applies pending migrations in order and does not reset existing data or reload the seed. For a direct database URL, use:

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

Check that the API URL and database URL identify the same project before using the direct URL. The repo-managed command also checks the URL/ref pair and asks for confirmation:

```bash
npm run ops -- dev db-migrate --env qa --dry-run
npm run ops -- dev db-migrate --env qa
```

Use `--env local|qa|staging|prod` to choose the matching env file. Production writes require explicit project confirmation. Review pending SQL and take a backup before applying schema changes.

**Apply one specific migration:**

```bash
npx supabase migration list --linked
npx supabase db push --dry-run --linked
```

There is no `db push` option to name an arbitrary single migration file. If the migration you want is the only pending migration, the normal push applies it. If other migrations are pending, the CLI applies the pending sequence; inspect and apply them in order rather than bypassing prerequisites. To test schema state only up to a version, use `npx supabase db reset --local --version <timestamp>`. This rebuilds the local database up to that version; it is not a single-migration update to an existing database.

**Apply all migrations to a fresh database:**

```bash
npx supabase db reset --local
npm run test:e2e:qa:reset-only
```

The first command resets the local database. The second resets the hosted QA database using `.env.qa`. A remote reset is destructive: it removes database rows/schema and rebuilds from migrations and seed. It does not wipe managed Supabase Auth users or Storage files. Never use a reset as the routine production migration command. The repo reset helper is allowlist-protected and confirms the target before resetting a hosted development project.

**Handle missing or out-of-order migration history:**

```bash
npx supabase migration list --linked
npx supabase db push --dry-run --include-all --linked
```

Only use `--include-all` when migrations are intentionally missing from the remote history (for example, after merging branches with older timestamps). It includes every local migration missing from the remote history table; review the preview and dependencies first. Do not use it to force past a failed migration without investigating.

**Seed reference data only:**

```bash
npx supabase db query --local --file supabase/seed.sql
```

The installed Supabase CLI has no standalone `db seed` subcommand. `supabase/seed.sql` runs automatically during `db reset`; `db query --file` runs it without resetting. For a hosted target, replace `--local` with `--db-url "$SUPABASE_DB_URL"` only after verifying the environment. The seed contains reference data; it is not a user-data restore.

## App

```bash
npm run supabase:setup
npm run dev
```

`npm run supabase:setup` is the interactive project setup path; it can link the hosted development project, apply migrations, and write `.env.local`. `npm run dev` starts Next.js using the environment available to the app. Keep local work pointed at a local or development project, never production.

Open [http://localhost:3000](http://localhost:3000).

Build and run the production-mode app locally:

```bash
npm run build
npm run start
```

`npm run start` requires a successful build first. It does not deploy the site.

## Tests

**Unit tests:**

```bash
npm test
npm run test:watch
npm run test:coverage
```

`npm test` runs the unit/integration suite once. Use watch mode while editing, and coverage when checking test coverage. These do not contact hosted QA unless a test explicitly requires it.

**Playwright:**

```bash
npm run test:e2e:install
npm run test:e2e
npm run test:e2e:ui
```

The regular Playwright command starts a local Next.js dev server if one is not already running. UI mode opens Playwright’s interactive runner so you can select and inspect tests, traces, and failures. Confirm `.env.local` points to a safe development Supabase project before running browser tests; a local browser server does not guarantee its database is local.

**Hosted QA E2E:**

```bash
npm run test:e2e:qa
npm run test:e2e:qa -- --skip-reset
npm run test:e2e:qa:reset-only
```

The default QA command verifies QA is not production, resets the hosted QA database from repo migrations and seed, then runs Playwright against a production build. Use `--skip-reset` only when deliberately reusing QA data; use reset-only to rebuild the database without launching tests. It requires `.env.qa` with matching Supabase API and database URLs, keys, and `SUPABASE_DB_URL`. Do not point `.env.qa` at production.

**Run one spec in the visual runner:**

```bash
npm run test:e2e:ui -- e2e/specs/<spec-name>.spec.ts
```

Use this for interactive local debugging. The QA command resets the database by default, so do not run it against shared QA data without coordinating with the team.

## Functions

**Deploy all app functions to the linked project:**

```bash
npx supabase status
npm run supabase:functions:deploy
```

This repo script deploys the four configured functions to the currently linked project. Confirm the target first. For an explicit target or one function:

```bash
npx supabase functions deploy notifications-scheduler --project-ref "$PROJECT_REF"
npx supabase functions deploy notifications-dispatcher --project-ref "$PROJECT_REF"
npx supabase functions deploy razorpay-webhook --project-ref "$PROJECT_REF"
npx supabase functions deploy report-exports --project-ref "$PROJECT_REF"
```

Deploy code after changing a function. Do not use `--prune` casually: it removes remote functions absent locally. Coordinate production function deploys with the matching schema migration and provider configuration.

**Set or rotate Edge Function secrets:**

```bash
npx supabase secrets list --project-ref "$PROJECT_REF"
npx supabase secrets set --env-file .env.functions.qa --project-ref "$PROJECT_REF"
npx supabase secrets unset OLD_SECRET_NAME --project-ref "$PROJECT_REF"
```

Create a separate ignored file for each target, for example `.env.functions.qa`, with only the values intended for Edge Functions:

```dotenv
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_FROM_NUMBER=<number>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
```

The repository ignores `.env*` files other than `.env.example`. `secrets list` shows configured secret names, not their values. `secrets set` adds or updates only the supplied names; it does not remove other secrets. Use `secrets unset` to remove a name. Never upload `.env.local` wholesale: it may contain app credentials that should not be function secrets. The CLI also accepts `NAME=VALUE` pairs, but these can be recorded in shell history. Secret updates apply to the selected project; redeploy only when function code also changed. Verify the destination before setting secrets because this command does not use this repo’s environment guard.

Supabase injects the Supabase URL and service-role key into Edge Functions. Provider secrets such as Twilio and the Razorpay webhook secret must be set in the function project. Supabase Auth provider credentials are configured separately in Supabase Auth, not as Edge Function secrets.

## Quality

```bash
npm run lint
npm run type-check
npm run format:check
npm test
npm run build
```

Run lint, type-check, tests, and build before asking for review or deploying. If type-check exits with a process crash rather than TypeScript diagnostics, confirm the required Node.js 22 runtime and rerun before treating it as a code failure.

## GitHub

```bash
gh auth login
gh auth status
gh auth setup-git
gh repo set-default <owner>/<repo>
```

```bash
git pull --ff-only origin <branch>
git checkout -b feature/<short-name>
git add .
git commit -m "feat(cheques): add <short-change>"
git push origin <branch>
gh pr create --fill
```

Write commit messages in this format:

```text
<type>[optional scope][!]: <short description>
```

Use a lowercase type that describes the change, an optional scope for the affected area, and a short description of the result. Common types and examples:

```text
feat(cheques): add cheque export
fix(notifications): prevent duplicate reminders
docs(ops): explain database reset scenarios
test(e2e): cover cheque editing flow
refactor(accounts): simplify bank lookup
chore(deps): update Playwright
perf(dashboard): reduce summary queries
```

For a breaking change, add `!` after the type or scope and explain the impact in the commit body, for example `feat(api)!: rename export response fields`. Keep one logical change per commit. Git author identity comes from `git config`; GitHub authentication comes from `gh auth`.

## Environments

**Local** — Coding, isolated migration tests, and UI debugging. Reset freely only when local data is disposable.

**QA** — Shared acceptance tests and E2E. Use `.env.qa`; the standard E2E command resets this database, so coordinate with teammates.

**Production** — Live users and data. Apply reviewed pending migrations only, back up, and follow the release plan. Never reset for routine deployment.

Choose one environment and verify its project ref, API URL, and database URL before every write. A local browser test can still mutate a hosted project if its environment values point there.

## Safety

**Before any DB or function write:**

```bash
git status --short
npx supabase status
npx supabase migration list --linked
```

Check the project ref and environment file, review the SQL or secret file, and take a verified backup before a destructive or production database change. Prefer `--dry-run` where available.

**If a migration fails:** stop and read the full error; do not repeatedly rerun, edit an already-applied migration, or mark it applied just to clear history. Check the actual database state and migration list. `supabase migration repair` changes migration-history metadata—it does not run or undo SQL—and should only be used after diagnosing the state and following an approved recovery plan.

**If a deploy partially fails:** check which functions or migrations succeeded before retrying. Keep the application and database schema compatible during staged releases. Roll forward with a new migration for shared environments rather than rewriting committed history.

## Quick

```bash
# Local development
npm ci
npm run supabase:setup
npm run dev

# Review and apply pending migrations
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase db push --linked

# QA end-to-end (resets QA first)
npm run test:e2e:qa

# Checks
npm run lint
npm run type-check
npm test
npm run build
```
