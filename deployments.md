# Launch deployment checklist

This is the launch gate and evidence log for the production release. It separates repository checks from live-provider verification; a local example file or green build does not prove a hosted setting is correct. Never record project references, secret values, tokens, or customer data here. See [the operations runbook](docs/operations-runbook.md), [environment and secrets](docs/environment-and-secrets.md), and [infrastructure and deployment](docs/infrastructure-and-deployment.md) for operational detail.

## Current readiness snapshot — 2026-11-07

**Status: blocked; do not launch or reset production yet.** The checks below were performed from the `qa` branch after fetching remote refs. No database reset, migration application, function deployment, secret change, Vercel deployment, commit, or push was performed.

<!-- prettier-ignore -->
| Area | Evidence from this checkout/session | Status |
| --- | --- | --- |
| Git branches | `main` matches `origin/main`; `qa` is 3 commits ahead of `origin/qa`. Fetched `origin/dev` is an ancestor of `qa` and 182 commits behind it. There is no local `dev` branch. | Blocked: tests fail; review the large dev sync and use the normal PR/review process. |
| Existing worktree | [issues/3.txt](issues/3.txt) and [todo.txt](todo.txt) were already modified before this task. They were left untouched. | Blocked: owner must review/preserve these edits before staging or committing. |
| Formatting | `npm run format:check` passed. | Pass |
| Lint | `npm run lint` passed. | Pass |
| TypeScript | `NODE_OPTIONS=--max-old-space-size=6144 npm run type-check` passed. | Pass, with runtime caveat below. |
| Unit tests | `npm test` ran 316 test files: 312 passed, 4 failed; 2,944 tests passed and 13 failed. Playwright E2E was not run, as requested. | Blocked: fix or explicitly disposition all 13 failures and rerun. |
| Production build | `NODE_OPTIONS=--max-old-space-size=6144 npm run build` completed successfully. | Pass, with runtime caveat below. |
| Node runtime | The active shell used Node `v24.15.0`; [package.json](package.json#L1-L8) requires `>=22.12.0 <23`. Node 22 was not installed in the local nvm environment, so the checks were not run on the supported runtime. | Blocked: install/select a supported Node 22 release, then repeat required checks. |
| Production Ops doctor | Read-only `ops doctor --env prod --json` connected to the selected production target. It confirmed local production env values are present, database connectivity, `admin_audit_log`/admin RPC availability, and deployed scheduler/dispatcher functions. It reported **2 profiles** and `razorpay-webhook` and `report-exports` returning 404. | Blocked: verify the target against the approved inventory; resolve the non-empty DB and missing functions. |
| Complete schema/migrations | Doctor checks one admin migration/RPC, not the full migration history or schema parity. No full migration-list comparison was performed. | Human/operator verification required. |
| Secrets and providers | Doctor checks local production app credential presence and Razorpay API key presence only. It does not inspect Vercel settings, Supabase Auth settings, Edge secret values/names, Vault, or third-party dashboards. No secret values were read into this document. | Human/operator verification required. |
| Hosted release | No Vercel deployment or live provider transaction/delivery test was performed. | Not verified. |

## P0 — stop conditions

- [ ] **Confirm the production project identity**: compare the target shown by the read-only doctor with the approved environment inventory. The repository does not define the authoritative Supabase-project-to-hosting-environment map. Do not run any hosted write until this matches.
- [ ] **Provision a separate production Supabase project** as requested. Keep the existing project and its data untouched. The project owner must provide the new project's ref and set its URL/database URL and matching credentials in ignored `.env.production`; do not share secret values. Verify that the Ops doctor and database-target guard identify this new project before any write.
- [ ] **Do not reset the current production database.** The doctor found 2 profiles, so the selected database is not demonstrably empty. A reset would delete data and reseed; it is not a migration operation. If launch requires a clean database, the safer path is a new, explicitly approved production project. If a reset is still required, the accountable data owner must approve a maintenance window, verified restorable backup, retention/legal obligations, and exact target first; rehearse recovery away from production.
- [ ] Once the new project is confirmed and still has no application data, run the production reset workflow against that project only. It applies all checked-in migrations and invokes `seed.sql`; the checked-in seed calls `seed_reference_banks()` (reference bank catalog only, no demo users). The reset does not clear managed Auth users or Storage files.
- [ ] Review the 13 failing unit tests; do not treat the passing build/type-check as a clean release while they remain unresolved.
- [ ] Select the package-supported Node 22 runtime and repeat format, lint, type-check, unit tests, and build. Keep E2E excluded unless separately approved; QA E2E resets the hosted QA database.
- [ ] Review the 3 unpushed QA commits and pre-existing modified files. Merge/push through reviewed branches only; do not force-push or push unreviewed worktree changes.

## Production deployment checklist

### Source, CI, and artifact

- [ ] Confirm intended release commit and branch; fetch and compare all relevant remote refs.
- [ ] Review the QA commits and working-tree changes; obtain required PR review and green required CI checks.
- [ ] On supported Node 22 and lockfile-installed dependencies, pass `npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`, and `npm run build`.
- [ ] Record test totals and any approved exclusions. E2E is optional for this checklist, but if run against QA, confirm it targets the approved QA project because its standard runner resets that database.
- [ ] Confirm the production artifact includes the correct build-time public environment and release metadata; rebuild after changing any `NEXT_PUBLIC_*` setting.

### Supabase database and functions

- [ ] Confirm the target project ref against the private approved inventory and verify the app URL and database URL resolve to the same project.
- [ ] Compare the complete applied migration history with checked-in migrations; inspect every pending migration and rehearse it against a representative non-production database.
- [ ] Take a production backup and verify a restore before any schema/data operation. Apply only forward migrations using the production migration command; do not use reset as a migration command.
- [ ] After migration, verify migration history, schema/RLS/policies, required RPCs, storage buckets, and application smoke checks.
- [ ] Deploy `notifications-scheduler`, `notifications-dispatcher`, `razorpay-webhook`, and `report-exports` to the explicit approved project ref. Verify each endpoint and logs without exposing credentials.
- [ ] Resolve the Razorpay gateway/JWT mismatch: the package deploy alias does not pass `--no-verify-jwt`, while the webhook handler performs HMAC validation. Confirm the provider request can reach the handler and test a correctly signed event in QA before relying on it.
- [ ] Verify `pg_cron` schedules and Supabase Vault entries (`project_url`, `service_role_key`), including that schedules are enabled only as intended. A migration or function deployment alone does not establish this.

### Secrets, identity, and external infrastructure

Check presence/configuration in each provider's own protected console or secret manager. **Do not paste secret values into chat, this document, command arguments, or logs.** Record only owner, target environment, date, and pass/fail.

- [ ] **Hosting (Vercel or approved platform):** production app URL, Supabase public URL/anon key, required public feature/build settings, and server-only service role/OpenAI/Razorpay credentials; Sentry DSN/release settings if enabled; Sentry source-map upload token in protected build settings if used. Verify production target/project and the final deployment URL.
- [ ] **Supabase Auth:** production URL/keys, email templates/redirect allowlists, CAPTCHA secret/provider, and SMS/Twilio setup if phone auth is enabled. Confirm production phone-auth feature flag and Turnstile site key agree.
- [ ] **Supabase Edge Function secrets:** required Twilio voice credentials, VAPID public/private key and subject, and `RAZORPAY_WEBHOOK_SECRET` (distinct from the Razorpay API secret). Verify the secrets exist in the correct project and test provider paths safely; never expose values.
- [ ] **Supabase Vault/database jobs:** verify Vault credentials and cron schedules/HTTP calls; confirm report-export schedule activation and notification schedules are intended.
- [ ] **Razorpay:** verify Live Mode account readiness, production API key pair, webhook URL/event/secret, alerts, and signed delivery. Keep test and live credentials distinct; complete a controlled transaction/refund verification under the payment owner's procedure.
- [ ] **Twilio and Web Push:** verify approved sender/phone, delivery configuration, quotas/limits, VAPID key pairing, and a controlled opt-in delivery test. Do not use the all-users notification pipeline as a connectivity probe.
- [ ] **OpenAI:** verify production API key, account limits, and a controlled OCR smoke test without real customer material.
- [ ] **Sentry and Clarity:** verify consent/policy approvals, project/environment/release routing, data scrubbing, identity/contact-field handling, and whether diagnostic routes are intentionally exposed.
- [ ] **Domains/network/security:** verify DNS/TLS, proxy client-IP forwarding, redirect/callback allowlists, CORS, security headers, backups/retention, monitoring alerts, and access/incident ownership.

### Final go/no-go and release record

- [ ] Product/data owner confirms intended initial production data state (empty vs retained) and approves any data-affecting operation.
- [ ] Operations owner confirms every required infrastructure check above, with no secret values recorded.
- [ ] Run post-deploy health checks and application smoke tests; verify auth, storage/RLS, OCR, payment webhook, notifications, and exports only in the approved test flows.
- [ ] Confirm rollback/restore owner, procedure, and decision window; capture deployment URL/commit, operator, timestamp, outcome, and follow-up below.

<!-- prettier-ignore -->
| Deployment | Commit | Environment | Operator | Result / follow-up |
| --- | --- | --- | --- | --- |
| Not deployed | — | — | — | Launch blocked pending P0 gates. |

## Human help needed now

1. Provision the new production project, then update the ignored local `.env.production` with its matching app/database target and credentials. Do not provide secret values in chat.
2. Confirm the new target from a read-only check before reset. The currently configured production project is the existing project with 2 profiles; it was not reset.
3. Resolve the 13 unit-test failures and provide/select a supported Node 22 runtime (Node 22 is not installed in this checkout's nvm environment).
4. Have each infrastructure owner attest to the checklist items they control. Only presence/status is needed; do not send credentials or secret values.
5. After gates pass, run the reset only against the verified new project, then review migrations/functions and branch PRs. Until the new project is verified, no production reset, migration, deployment, secret mutation, commit, or push has been made.
