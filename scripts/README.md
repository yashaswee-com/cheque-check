# Ops CLI (`npm run ops`)

One CLI for support and developer operations: granting Premium, topping up
quotas, triggering voice reminders, reconciling payments, fixing accounts,
and the dev tooling (project setup, resets, e2e). Every write is previewed,
confirmed, and recorded in `admin_audit_log`.

```bash
npm run ops                       # interactive menu (pick env → area → action)
npm run ops -- <group> <action> [flags]
npm run ops -- <group> <action> --help
```

Anything not passed as a flag is asked for interactively. In non-interactive
runs (CI, pipes, `--json`) a missing value fails fast with the flag to add,
so scripts never hang.

## Contents

- [One-time setup](#one-time-setup)
- [Environments and safety](#environments-and-safety)
- [Global flags and exit codes](#global-flags-and-exit-codes)
- [Support runbook](#support-runbook)
- [Command reference](#command-reference)
- [Developer tooling](#developer-tooling)
- [Code layout and conventions](#code-layout-and-conventions)

## One-time setup

1. **Apply the admin migration** to every project you will operate on:
   `supabase/migrations/20261018000000_admin_ops.sql` adds `admin_audit_log`
   and the atomic `admin_*` RPCs that every grant goes through.

   ```bash
   npx supabase db push
   ```

2. **Redeploy the notification functions.** `voice trigger-business` uses
   the scheduler's targeted mode and `--to` uses the dispatcher's
   `to_override`:

   ```bash
   npm run supabase:functions:deploy
   ```

3. **Create env files** for the environments you use (copy `.env.example`):
   `.env.local`, `.env.qa`, `.env.staging`, `.env.production`. Each needs
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`;
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is needed for `account magic-link`, and
   `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for `payment reconcile`
   verification.

4. **Mark your dev projects** so they are not treated as production
   (see below):

   ```bash
   npm run ops -- ops allowlist-add --env local
   ```

5. **Check everything:**

   ```bash
   npm run ops -- ops doctor --env qa
   ```

## Environments and safety

`--env local|qa|staging|prod` picks the env file (`.env.local`, `.env.qa`,
`.env.staging`, `.env.production`). Variables already exported in your
shell win over the file. Default: `local`. If the root env file is absent,
the CLI reads the same filename from `env/` (for example
`env/.env.production`). Root files take precedence; the two are not merged.
This fallback is CLI-specific; Next.js still expects env files at the root.

A target is **production** when `--env prod` is used, **or** its project
ref is not listed in `supabase/.dev-projects.json` (shared, committed) or
`supabase/.dev-projects.local.json` (this machine, git-ignored). Local
Supabase (`127.0.0.1`/`localhost`) is never production. Unknown = production.

Every write follows the same gate:

1. A before → after **preview** is shown.
2. `--dry-run` stops here (exit 0).
3. **Production:** a red banner, then you must type the project ref. In
   scripts, pass `--confirm-ref <ref>` instead. `--yes` never bypasses this.
4. **Non-production:** confirm, or pass `--yes`.
5. The change is applied atomically by an `admin_*` RPC that also writes
   the audit row (operator, reason, before/after) in the same transaction.
   Grants also record a ₹0 `admin_` transaction in the user's purchase
   history (opt out with `--no-transaction`).

The operator is your `git config user.email` (override with `--operator`).
`--reason` is optional but recommended ("Support #123").

## Global flags and exit codes

Global flags work before or after the command.

| Flag                  | Meaning                                       |
| --------------------- | --------------------------------------------- |
| `--env <name>`        | `local` (default), `qa`, `staging`, `prod`    |
| `--json`              | JSON on stdout only (implies non-interactive) |
| `--dry-run`           | Preview writes without applying               |
| `-y, --yes`           | Skip confirmation (non-production only)       |
| `--operator <email>`  | Recorded in the audit log                     |
| `--reason <text>`     | Recorded in the audit log                     |
| `--confirm-ref <ref>` | Confirm a production write non-interactively  |
| `--verbose`           | Debug output and stack traces                 |

| Exit | Meaning                                            |
| ---- | -------------------------------------------------- |
| 0    | Success (including a completed `--dry-run`)        |
| 1    | Error (database, network, partial failure in bulk) |
| 2    | Usage: bad/missing flag, or confirmation needed    |
| 3    | Cancelled by the operator                          |
| 4    | Not found (user, job, transaction)                 |
| 5    | Refused by a safety guard (production, allowlist)  |

`--json` output is `{"ok": true, "action": "...", "data": ...}` or
`{"ok": false, "error": {"type", "message", "hint", "exitCode"}}`.

## Support runbook

`--user` accepts an email, phone, user id, business id, or part of a name.
When several users match, you pick one interactively (non-interactive runs
fail and list the matches).

| The user says…                         | Run                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| "Give them Lifetime Premium"           | `premium grant-lifetime --user <u> --reason "..."`                                      |
| "Let them try Premium"                 | `premium trial --user <u> --days 14`                                                    |
| "I'm out of reminder calls / AI scans" | `quota topup --user <u> --kind voice` (or `--kind ai`; default = pack size)             |
| "My subscription expired"              | `quota sub --user <u> --kind voice` (catalog days + quota)                              |
| "I paid but didn't get it"             | `payment list --user <u>` then `payment reconcile --ref <reference>`                    |
| "Refund me"                            | Refund in the Razorpay dashboard, then `payment refund --ref <reference>`               |
| "I'm not getting reminder calls"       | `voice diagnose --user <u>`                                                             |
| "Call me now for this business"        | `voice trigger-business --user <u> --business <id>`                                     |
| "Does calling even work?"              | `voice sample --user <u>` (or `--to <phone>` to call yourself)                          |
| "A call failed"                        | `voice jobs --user <u>`, `voice jobs-inspect --id <job>`, `voice jobs-retry --id <job>` |
| "Wrong phone / time zone / language"   | `account profile --user <u> --phone +91... --time-zone Asia/Kolkata`                    |
| "I can't log in"                       | `account magic-link --user <u>` (or `--kind password-reset`)                            |
| "Change my login email"                | `account change-email --user <u> --email new@example.com`                               |
| "I deleted a business by mistake"      | `account restore --user <u>` (pick from deleted records)                                |
| "It says too many requests"            | `account rate-limits --user <u>` then `account rate-limits-reset --user <u>`            |
| Abuse                                  | `account ban --user <u> --duration 7d` (`--duration none` lifts it)                     |
| "What did we change for this user?"    | `ops audit --user <u>`                                                                  |

Notes:

- **Quota top-ups vs. subscriptions.** A top-up adds to the quota limit.
  An _expired_ quota pool cannot be consumed, so `quota topup` refuses
  in scripts and interactively offers to grant the subscription instead.
- **`voice trigger-business`** first dry-runs the scheduler for that
  business and stops with the exact blockers (voice disabled, no phone, no
  time zone, no due cheques…). The call consumes one Voice Reminder from the
  user's quota, like a scheduled one. `--to` calls a different number (e.g.
  yours) and skips the "no phone" blocker. `--no-dispatch` only queues the job.
- **`voice trigger-user`** does the same for _every_ business of one user that
  has due cheques: it previews recipient, businesses, due-cheque and call
  counts, quota effect and environment, then queues one call per business.
  Use the global `--dry-run` to preview only. Each run has a request id
  (printed in the preview; pass `--request-id <uuid>` to repeat a request
  without queuing a second call). `--reason` is stored in the admin audit
  log together with the operator, target, request id and job ids.
- **Dispatching** from `trigger-business`, `trigger-user` and `sample` is
  scoped: the dispatcher only claims the jobs just queued for that user (the
  scope is enforced in the `claim_notification_jobs` database function and
  needs the service role). Only `voice pipeline` and the cron process jobs
  for _all_ users, up to 50 at a time.
- **Outcomes**: `sent` means the call provider accepted the call (the provider
  id is printed), not that the user answered. `skipped` jobs say why
  (deactivated user, voice off - sample calls included -, invalid number, deleted business or cheques,
  no quota).
- **Refunds** are database-only: the transaction is marked refunded and
  what it bought is revoked (skipped if a newer purchase covers it; top-ups
  reduce the limit, never below what is used). Use `--no-revoke` to keep
  access. Admin grants cannot be refunded.

## Command reference

`[W]` = writes (goes through the safety gate). Run any command with
`--help` for its flags and examples.

| Command                            | What it does                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| `user find`                        | Search users                                                          |
| `user show`                        | Snapshot: profile, businesses, premium, quotas, recent payments       |
| `user list-premium`                | Premium / subscription holders (`--feature`, `--status`)              |
| `premium grant-lifetime` W         | Lifetime Premium                                                      |
| `premium trial` W                  | Premium trial for `--days`                                            |
| `premium extend` W                 | Extend any entitlement by `--days`                                    |
| `premium set-expiry` W             | Exact expiry (`--until <date\|never>`)                                |
| `premium pause` / `resume` W       | Pause or resume an entitlement                                        |
| `premium cancel` W                 | Cancel (keeps the record; access ends)                                |
| `premium revoke` W                 | Revoke immediately                                                    |
| `quota topup` W                    | Add Voice Reminders / AI Scans                                        |
| `quota sub` W                      | Grant or extend the Voice / AI subscription                           |
| `quota set` W                      | Set limit / used / reset date exactly (corrections)                   |
| `voice trigger-business` W         | Reminder call for one business now                                    |
| `voice trigger-user` W             | Reminder calls for all of one user's due businesses                   |
| `voice sample` W                   | Sample test call                                                      |
| `voice diagnose`                   | Checklist of why reminders are not happening                          |
| `voice jobs`                       | List jobs (`--user`, `--status`)                                      |
| `voice jobs-inspect`               | Job details and provider logs                                         |
| `voice jobs-retry` W               | Failed/skipped/cancelled → pending                                    |
| `voice jobs-cancel` W              | Pending → cancelled                                                   |
| `voice pipeline` W                 | Run the scheduler and dispatcher once (all users)                     |
| `payment list`                     | Transactions (`--user`, `--status`)                                   |
| `payment reconcile` W              | Fulfil a paid-but-not-granted order (verifies with Razorpay)          |
| `payment refund` W                 | Record a refund and revoke                                            |
| `account profile` W                | Phone, time zone, language, voice/SMS, reminders per day              |
| `account magic-link` W             | Email a sign-in or password-reset link                                |
| `account change-email` W           | Change the login email                                                |
| `account ban` W                    | Ban (`24h`, `7d`, `30d`, `permanent`, `48h`…) or `none`               |
| `account restore` W                | Restore a soft-deleted business, party, or bank account               |
| `account rate-limits`              | API rate-limit counters                                               |
| `account rate-limits-reset` W      | Clear them (all, or `--endpoint`)                                     |
| `ops doctor`                       | Env, credentials, target, migration, functions                        |
| `ops stats`                        | Key numbers                                                           |
| `ops notification-health`          | Read-only queue/scheduler aggregates and threshold alerts             |
| `ops notification-provider-health` | Shared admission limits, request slots and cumulative throttle counts |
| `ops audit`                        | Audit log (`--user`, `--action`, `--by`, `--since`)                   |
| `ops bulk` W                       | Apply grants from a CSV                                               |
| `ops allowlist-add`                | Mark a project as dev on this machine                                 |

### Provider Capacity Diagnostics

`ops notification-provider-health --check --json` is read-only and exits 1 when
expired request-slot rows remain. Normal saturation is informational. Use it
alongside `ops notification-health` for queue-delay alerts; neither command sends
provider calls or automatically changes limits/reconciles uncertain deliveries.
See [notifications](../docs/notifications.md)
for configuration, migration/deployment order and local-test limitations.

### Bulk CSV

The following rows are illustrative and use reserved placeholder email domains:

```csv
email,action,amount,reason
person1@example.invalid,lifetime,,Example grant
person2@example.invalid,topup-voice,100,Example top-up
person3@example.invalid,trial,30,
```

| action           | amount                            |
| ---------------- | --------------------------------- |
| `lifetime`       | ignored                           |
| `trial`          | days (default 14)                 |
| `topup-voice`    | calls to add (default: pack size) |
| `topup-ai`       | scans to add (default: pack size) |
| `sub-voice`      | days (default: catalog)           |
| `sub-ai`         | days (default: catalog)           |
| `cancel-premium` | ignored                           |

`ops bulk --file grants.csv` validates every row and resolves emails
(exact match), shows a preview, asks once, then applies rows one by one.
Failed rows are written to `grants.failed.csv` (with an `error` column) so
you can fix and re-run just those.

## Local Scaling Benchmark

Run on Node 22:

```sh
npm run test:scaling
npm run test:scaling -- --users 10000 --active-users 1000 --samples 50 --concurrency 10
```

This standalone command does not create an ops environment/client. It runs actual
scaling migrations against a disposable in-memory PGlite fixture, without
environment files, remote URLs, Supabase resets, or provider calls. JSON stdout
contains dataset size, p50/p95/p99/max queued SQL latency, scheduler duration and
batch counts, simulated acceptance accounting, and aggregate queue health.
Correctness errors or latency-budget failures exit 1; errors go to stderr.

| Flag                     | Default | Limit                                                |
| ------------------------ | ------- | ---------------------------------------------------- |
| `--users`                | 10000   | 1..100000 registered profiles                        |
| `--active-users`         | 1000    | 1..10000 and no more than registered                 |
| `--cheques-per-business` | 20      | 1..1000 for ordinary active businesses               |
| `--hot-business-cheques` | 10000   | At least ordinary size, at most 100000               |
| `--samples`              | 25      | 1..1000 measured requests per scenario, after warmup |
| `--concurrency`          | 10      | 1..100 queued tasks on one serialized connection     |
| `--max-p95-ms`           | 1000    | Local read regression budget, 1..60000               |
| `--max-scheduler-ms`     | 40000   | Total scheduler regression budget, 1..600000         |

The fixture caps the complete dataset at 1,000,000 cheques. The ten-task default
does **not** emulate independent production connections or authenticated HTTP
sessions. Compare baselines on the same runtime/machine/workload; do not interpret
these results as 10,000 concurrent-user support. See
[scaling and observability](../docs/scaling-and-observability.md#benchmark-scope)
for the measurement assumptions and authorized QA follow-ups.

### Read-only Notification Health

```sh
npm run ops -- ops notification-health --env qa --json
npm run ops -- ops notification-health --env prod --check --json
```

Requires `20261031030000_notification_health.sql` and service-role access.
Defaults: 60-minute recent-outcomes window, due-job alert age 300 seconds,
scheduler checkpoint/window alert age 900 seconds. Configure with
`--window-minutes`, `--max-due-age-seconds`, and
`--max-scheduler-age-seconds`. Any expired lease, unresolved reservation or missing
scheduler observation also alerts. A successful read emits `ok: true`; `--check`
exits 1 when `data.alerts` is nonempty. This never triggers calls, writes data,
or exports private identifiers/payloads. No polling service is started.

## Developer tooling

These keep their npm aliases and are hidden from the interactive menu.

| npm script                       | Command                                              |
| -------------------------------- | ---------------------------------------------------- |
| `npm run supabase:setup`         | `ops dev setup` (interactive wizard)                 |
| `npm run supabase:reset`         | `ops dev reset` (allowlisted projects)               |
| `npm run test:e2e:qa`            | `ops dev e2e-qa` (always `--env qa`)                 |
| `npm run test:e2e:qa:reset-only` | `ops dev e2e-qa --reset-only`                        |
| `npm run test:e2e:cleanup`       | `ops dev e2e-cleanup` (`--confirm`)                  |
| `npm run storage:migrate`        | `ops dev storage-migrate` (dry run unless `--apply`) |
| `npm run notifications:test`     | `ops voice pipeline`                                 |
| `npm run admin:monetization`     | `ops` (interactive menu)                             |

Extra Playwright arguments go after `--`:
`npm run test:e2e:qa -- --skip-reset -- --project=chromium e2e/specs/auth.spec.ts`.

### Production database reset and migrations

The implementation is in [commands/dev/database.ts](commands/dev/database.ts).
Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_DB_URL` in `.env.production`
(or `env/.env.production` if the root file is absent). Use the Supabase
direct or session-pooler Postgres connection string, with a percent-encoded
password, not the API URL or service-role key. The commands refuse to run
if the API and database project refs differ. Exported shell variables still
take precedence, so check the previewed project ref.

```bash
# Preview only: no database connection or writes.
npm run db:reset:production -- --dry-run

# DESTRUCTIVE: delete application data, replay all migrations, load seed.sql.
npm run db:reset:production

# Apply pending migrations only (no reset, no seed reload).
npm run db:migrate:production

# Non-interactive production confirmation; replace with your actual project ref.
npm run db:reset:production -- --confirm-ref <project-ref>

# Other hosted environments use the same commands.
npm run db:migrate -- --env qa
```

Production requires typing the project ref (or `--confirm-ref`); `--yes`
cannot bypass it. Take and verify a backup and stop application writes
before a reset. Remote resets do **not** wipe managed Auth users or Storage
files. Seed data currently contains only the reference bank list. Reset
reapplies migrations itself; a separate migrate command is not required
afterward. If a migration fails, the command exits with an error and the
database may be partially rebuilt.

These commands never use or change the CLI's linked project. The original
`supabase:reset` remains restricted to linked, allowlisted dev projects.
Unlike support mutations, these external CLI operations are not atomic
`admin_*` RPCs and do not write an admin audit row.

## Code layout and conventions

```text
scripts/
  cli.ts            entry point: global flags, subcommands, interactive hub
  hub.ts            interactive menu built from the same action definitions
  lib/              framework: context, env, errors, guards, prompts, ui, audit…
  domain/           Supabase operations (no prompts, no printing) — reusable and testable
  commands/         one file per group; each action is a defineAction({...})
  commands/dev/     developer tooling
  test/             vitest unit tests (npx vitest run scripts)
```

Adding an action:

1. Put data access in `domain/*` (return data, throw `OpsError`s; use
   `unwrap`/`unwrapRows` on every Supabase response).
2. Add a `defineAction({ name, title, description, mutates, options,
examples, run, render })` to the group in `commands/*`. Get missing
   values with `ctx.prompt.*` (pass `flag` so non-interactive runs say which
   flag is missing) and parse them with `lib/validators`.
3. Every write must call `confirmMutation(ctx, plan)` first and be recorded
   in the audit log — through an `admin_*` RPC or `writeAudit`.
4. Return a plain result from `run` (it becomes the `--json` payload) and
   print it in `render`.
5. Add tests in `scripts/test` with `makeTestContext` from `test/helpers.ts`.

Errors: throw `UsageError` (2), `NotFoundError` (4), `GuardRefusedError`
(5), or `AbortedError` (3); anything else is mapped by `toOpsError`, which
also turns PostgREST codes into hints (e.g. "apply the admin migration").
