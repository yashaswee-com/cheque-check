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
shell win over the file. Default: `local`.

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
- **Dispatching** processes up to 50 pending jobs for _all_ users, not just
  the one you queued.
- **Refunds** are database-only: the transaction is marked refunded and
  what it bought is revoked (skipped if a newer purchase covers it; top-ups
  reduce the limit, never below what is used). Use `--no-revoke` to keep
  access. Admin grants cannot be refunded.

## Command reference

`[W]` = writes (goes through the safety gate). Run any command with
`--help` for its flags and examples.

| Command                       | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `user find`                   | Search users                                                    |
| `user show`                   | Snapshot: profile, businesses, premium, quotas, recent payments |
| `user list-premium`           | Premium / subscription holders (`--feature`, `--status`)        |
| `premium grant-lifetime` W    | Lifetime Premium                                                |
| `premium trial` W             | Premium trial for `--days`                                      |
| `premium extend` W            | Extend any entitlement by `--days`                              |
| `premium set-expiry` W        | Exact expiry (`--until <date\|never>`)                          |
| `premium pause` / `resume` W  | Pause or resume an entitlement                                  |
| `premium cancel` W            | Cancel (keeps the record; access ends)                          |
| `premium revoke` W            | Revoke immediately                                              |
| `quota topup` W               | Add Voice Reminders / AI Scans                                  |
| `quota sub` W                 | Grant or extend the Voice / AI subscription                     |
| `quota set` W                 | Set limit / used / reset date exactly (corrections)             |
| `voice trigger-business` W    | Reminder call for one business now                              |
| `voice sample` W              | Sample test call                                                |
| `voice diagnose`              | Checklist of why reminders are not happening                    |
| `voice jobs`                  | List jobs (`--user`, `--status`)                                |
| `voice jobs-inspect`          | Job details and provider logs                                   |
| `voice jobs-retry` W          | Failed/skipped/cancelled → pending                              |
| `voice jobs-cancel` W         | Pending → cancelled                                             |
| `voice pipeline` W            | Run the scheduler and dispatcher once (all users)               |
| `payment list`                | Transactions (`--user`, `--status`)                             |
| `payment reconcile` W         | Fulfil a paid-but-not-granted order (verifies with Razorpay)    |
| `payment refund` W            | Record a refund and revoke                                      |
| `account profile` W           | Phone, time zone, language, voice/SMS, reminders per day        |
| `account magic-link` W        | Email a sign-in or password-reset link                          |
| `account change-email` W      | Change the login email                                          |
| `account ban` W               | Ban (`24h`, `7d`, `30d`, `permanent`, `48h`…) or `none`         |
| `account restore` W           | Restore a soft-deleted business, party, or bank account         |
| `account rate-limits`         | API rate-limit counters                                         |
| `account rate-limits-reset` W | Clear them (all, or `--endpoint`)                               |
| `ops doctor`                  | Env, credentials, target, migration, functions                  |
| `ops stats`                   | Key numbers                                                     |
| `ops audit`                   | Audit log (`--user`, `--action`, `--by`, `--since`)             |
| `ops bulk` W                  | Apply grants from a CSV                                         |
| `ops allowlist-add`           | Mark a project as dev on this machine                           |

### Bulk CSV

```csv
email,action,amount,reason
priya@example.com,lifetime,,Launch offer
ravi@example.com,topup-voice,100,Support #42
asha@example.com,trial,30,
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
