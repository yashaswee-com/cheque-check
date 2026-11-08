# Pre-deployment checklist

A reusable, chronological checklist for a release to any environment. It defines the normal order of work; it is **not evidence** that a particular environment is configured or ready. Use [deployments.md](deployments.md) as the per-release evidence record, and use the linked feature guides for exact settings. Mark an optional feature **N/A** only when the release owner confirms it is disabled and not part of the release.

Never put secret values, tokens, customer data, or private credentials in this checklist. Record only whether a setting is present, its destination, owner, date, and verification result.

## Release record

| Field                    | Value |
| ------------------------ | ----- |
| Application/version      |       |
| Target environment       |       |
| Release commit           |       |
| Release owner/operator   |       |
| Planned window           |       |
| Approval / change record |       |
| Rollback owner           |       |

## 1. Start the release from Git

- [ ] Confirm the release scope, target environment, feature flags, change window, and responsible owners.
- [ ] Fetch the current target branch and confirm the intended base commit.
- [ ] Create a release/topic branch from the approved base; do not make production changes directly on a shared branch.
- [ ] Check `git status`; preserve unrelated worktree changes and exclude them from the release.
- [ ] Review the diff for migrations, secret/config changes, feature flags, generated files, and accidental data or credential inclusion.
- [ ] Open a pull request, obtain required review, resolve conflicts, and merge through the repository's normal process.
- [ ] Record the exact merged commit and ensure the deployment artifact will use that commit.

## 2. Confirm target and environment boundaries

- [ ] Verify the environment-to-hosting-project, Supabase project, domain, and provider-account mapping against the approved inventory.
- [ ] Confirm QA/staging use test credentials and production uses only production credentials. Never reuse live credentials in previews or test projects.
- [ ] Confirm the application URL and Supabase URL/database connection belong to the same intended environment.
- [ ] Identify the protected destination for each setting: hosting build/runtime variables, Supabase Auth, Edge Function secrets, Vault, or provider console.
- [ ] Confirm credentials were issued or rotated by their owners and are stored only in approved secret stores. Do not print them in command arguments, CI logs, tickets, or documentation.
- [ ] Select the package-supported runtime and dependency lockfile; record the runtime version used for verification.
- [ ] Decide which optional integrations are enabled for this release. Keep their flags off when configuration, consent, or verification is incomplete.

## 3. Pass repository and artifact gates

- [ ] Install from the committed lockfile using the supported runtime.
- [ ] Pass formatting, lint, type-check, unit tests, and production build. Record totals and investigate failures; an approved exception is not a pass.
- [ ] Run E2E tests only against an approved disposable/QA target. Confirm whether the standard runner resets or mutates that target; never point destructive test setup at production.
- [ ] Run configured dependency, secret-scanning, and static/security checks. Review results rather than assuming that a workflow's existence means it passed.
- [ ] Verify public build-time variables are for the target environment. Rebuild after changing any `NEXT_PUBLIC_*` value.
- [ ] Check source maps, release identifiers, asset/output contents, and deployment metadata as required by the hosting platform.

## 4. Prepare the database and storage

- [ ] Confirm the target project and migration plan before any database write.
- [ ] Take a production backup and verify a restore path before a production schema or data operation.
- [ ] Review pending migrations and rehearse them on a representative non-production database.
- [ ] Apply forward migrations using the migration workflow. **Do not use a reset command as a production migration method.** A reset is destructive and must have separate explicit approval for a disposable/new target.
- [ ] Verify the hosted migration ledger matches the intended release and inspect schema, constraints, indexes, triggers, RPCs, grants, and RLS policies.
- [ ] Verify required extensions, storage buckets, privacy/access policies, upload limits, lifecycle/retention rules, and private download paths.
- [ ] Verify database extensions and scheduled jobs. Keep jobs paused or inactive until required secrets and workers are configured; enable only intended schedules.
- [ ] Confirm Vault entries and database-to-function credentials by presence/status checks that never reveal values.

## 5. Prepare hosting, domains, and routing

- [ ] Confirm the correct hosting project, production branch, build command, runtime, region, and environment-variable scopes.
- [ ] Configure the canonical app origin, DNS, TLS certificate, redirects, and any custom domains.
- [ ] Configure proxy/client-IP forwarding so the application cannot trust caller-supplied forwarding headers.
- [ ] Verify CORS, security headers, content security policy, callback URLs, public-route rules, and rate-limit behavior for the deployed topology.
- [ ] Set public and server-only environment variables in their correct hosting scopes; keep private credentials out of browser-visible variables.
- [ ] Verify health checks, build output, startup behavior, and deployment protection/access controls before releasing traffic.

## 6. Configure identity and authentication

- [ ] Set the hosted Auth Site URL and exact redirect allowlist for the target app origin; include only necessary QA/preview/local callbacks in their respective projects.
- [ ] **Google OAuth, if enabled:** create a Google OAuth Web client; authorize the app origin as a JavaScript origin and the Supabase Auth callback as a redirect URI. Configure the consent screen/audience and only required scopes. Enter the client ID/secret in the Supabase Google provider settings, enable the provider, and test with an approved account. Keep the provider secret out of the app environment.
- [ ] Configure email signup/recovery templates, sender identity, SMTP, links, and deliverability. Test signup, confirmation if enabled, and password recovery.
- [ ] Configure CAPTCHA in Supabase Auth and the matching public site key/hostname in the app build where required. Test failed and successful challenges.
- [ ] **Phone authentication, if enabled:** configure the separate Supabase Auth SMS provider credentials, sender/service, country restrictions, billing, and templates; set the app feature flag and CAPTCHA site key consistently. Reminder/voice Twilio credentials do not configure Auth SMS.
- [ ] Verify signup policy, email/phone confirmation, session lifetime/rotation, account linking, sign-out, deactivation/ban behavior, and recovery contacts.
- [ ] Test password, OAuth, email confirmation/recovery, and optional phone flows on the actual target origin. Verify redirects return to the expected route and cookies/session persist.

## 7. Configure notifications and background workers

- [ ] Choose which notification channels are enabled; document opt-in, locale/time-zone, quiet hours, quotas, consent, and recipient-safety rules.
- [ ] Configure the notification provider credentials in the correct Edge Function secret store. Keep Auth SMS credentials separate from voice-reminder credentials.
- [ ] For Web Push, generate one VAPID key pair in a protected local environment. Configure the private key only as an Edge Function secret; use the matching public key in the app's public build setting. Set a valid VAPID contact subject and rebuild the app after changing the public key.
- [ ] Confirm production test/force-run switches are disabled and test destinations are absent unless a specifically approved test requires them.
- [ ] Deploy the scheduler/dispatcher to the explicit target project after secrets are configured; verify JWT/gateway behavior and worker logs.
- [ ] Provision and verify Vault entries used by scheduled HTTP calls. Confirm cron URLs, authorization, cadence, enabled state, and last-run/error logs.
- [ ] Keep export/cleanup jobs inactive until the worker is deployed and a private QA export/download/cleanup flow passes; enable the schedule only with an owner-approved decision.
- [ ] Test one explicit, opted-in recipient or test device. Do not use an all-users job as a connectivity probe; review uncertain provider outcomes before retrying.

## 8. Configure payments and financial callbacks

- [ ] Confirm the payment account's legal, settlement, tax/KYC, alert, and production-readiness state.
- [ ] Configure the matching API Key ID and API Key Secret in server-only hosting settings; expose only the public Key ID to browser checkout. Keep test and live pairs separate.
- [ ] Create the provider webhook for the exact target endpoint and required event types. Store its independently generated signing secret in the corresponding Edge Function secret store; it is not the API Key Secret.
- [ ] Configure gateway/JWT behavior so the provider can reach the webhook, while retaining application-level signature/HMAC verification. Do not disable the webhook's signature verification.
- [ ] Verify order ID, payment ID, amount, currency, captured status, event allowlist, idempotency, retry behavior, and reconciliation path.
- [ ] Run a controlled test-mode payment and signed webhook through the application; verify database entitlement/transaction state and provider delivery logs. Exercise refund/dispute handling only when its operational path is defined.
- [ ] Obtain explicit payment-owner approval before switching to live mode; perform a low-risk production verification only under the approved procedure.

## 9. Configure AI and other external integrations

- [ ] Configure provider API keys server-side, account billing/quotas, model/feature permissions, and rate limits.
- [ ] Check retention/data-use settings and ensure test material contains no real customer data unless explicitly approved.
- [ ] Run a bounded, controlled smoke test and verify failures/timeouts do not expose credentials or sensitive inputs.
- [ ] Verify any other integrations (SMS, messaging, analytics, CAPTCHA, support, or email) in their own provider consoles and target environments.

## 10. Set up monitoring, privacy, and operations

- [ ] Configure Sentry DSN, environment, release, sampling, alert routing, and source-map upload credentials where enabled. Keep the upload token in trusted build settings.
- [ ] Review error, trace, replay, and user-identity collection against privacy/consent policy. Confirm scrubbing and retention; do not assume SDK defaults eliminate all personal data.
- [ ] Enable Clarity/session recording only after policy approval and consent behavior are verified. Confirm preview/production flags and domains are separated.
- [ ] Configure availability, database, queue/cron, storage, and provider-failure alerts with an owner and escalation path.
- [ ] Review operational dashboards and logs for secret leakage, user data, callback failures, worker backlog, provider limits, and error spikes.
- [ ] Confirm incident contacts, support path, status communication, access controls, and audit-log retention.

## 11. Deploy in dependency order

- [ ] Confirm approvals, backup/restore readiness, target identity, and release commit immediately before deployment.
- [ ] Apply reviewed database migrations first; verify migration status and critical database health.
- [ ] Set/verify provider and Edge Function secrets through protected tooling; never put secret values in CLI arguments or output.
- [ ] Deploy Edge Functions with explicit project/environment selection and required per-function gateway settings. Confirm deployment versions and endpoint reachability.
- [ ] Build and deploy the web application from the approved commit with the final public environment and release metadata.
- [ ] Verify DNS/TLS, health checks, server startup, static assets, and the intended deployment URL before sending production traffic.

## 12. Run post-deployment smoke tests

- [ ] Confirm app health, sign-in/sign-out, account creation policy, redirects/cookies, and one representative authenticated data read/write.
- [ ] Confirm RLS/ownership and private storage access with an authorized account and a denied cross-account attempt.
- [ ] Test enabled OAuth/phone/email flows on the production origin; check Auth and application logs.
- [ ] Test one bounded OCR request, notification delivery to an explicitly opted-in test recipient/device, and report export/download/cleanup where enabled.
- [ ] Verify the payment webhook with a signed, approved event and confirm server-side fulfillment; never treat a browser success redirect as proof of payment.
- [ ] Confirm cron last-run state, worker backlog, error rate, Sentry/Clarity routing and privacy controls, and provider usage/limits.
- [ ] Observe the system for the agreed monitoring window. Do not retry ambiguous payment or notification outcomes without checking the provider and durable job state.

## 13. Go/no-go, rollback, and closeout

- [ ] Product/data owner approves the initial data state and any data-affecting actions.
- [ ] Operations and security owners review all applicable checks; record N/A decisions, exceptions, and follow-up owners.
- [ ] Confirm rollback decision-maker, time window, app rollback procedure, and database recovery strategy. Treat database changes as forward-fix/restore decisions, not automatic code rollback.
- [ ] Make the go/no-go decision and record commit, environment, operator, time, outcome, verification evidence, and follow-up in [deployments.md](deployments.md)—without secret values.
- [ ] Keep monitoring the production release and close the change only after logs, alerts, scheduled jobs, and provider activity are healthy.

## Repository references

- [Environment and secrets](docs/environment-and-secrets.md)
- [Infrastructure and deployment](docs/infrastructure-and-deployment.md)
- [Authentication and profile](docs/authentication-and-profile.md)
- [Notifications](docs/notifications.md)
- [Payments and Premium](docs/payments-and-premium.md)
- [Reports and exports](docs/reports-and-exports.md)
- [Scaling and observability](docs/scaling-and-observability.md)
- [Security and known risks](docs/security-and-known-risks.md)
- [Operations runbook](docs/operations-runbook.md)
- [E2E test safety](e2e/README.md)
