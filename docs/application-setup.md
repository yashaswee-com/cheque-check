# Application setup

From-scratch provisioning and deployment runbook for Cheque Check. This covers
where to create accounts, obtain keys, configure providers, and verify the result.
The naming standard below is a **recommended provisioning convention**; names
marked **fixed** are existing contracts required by this repository.

Provider dashboards change over time. Follow the setting names and linked official
guides if a menu has moved. Never put real credentials in this document, tickets,
screenshots, chat, or Git. Record secret-manager references instead.

## Contents

1. [Architecture and required accounts](#1-architecture-and-required-accounts)
2. [Unified naming standard](#2-unified-naming-standard)
3. [Workstation and local application](#3-workstation-and-local-application)
4. [Supabase projects, database, storage, and Auth](#4-supabase-projects-database-storage-and-auth)
5. [Google Cloud Console: Google sign-in](#5-google-cloud-console-google-sign-in)
6. [Meta: Facebook sign-in](#6-meta-facebook-sign-in)
7. [Cloudflare: Turnstile and optional DNS](#7-cloudflare-turnstile-and-optional-dns)
8. [Twilio: SMS OTP and voice reminders](#8-twilio-sms-otp-and-voice-reminders)
9. [Supabase Edge Functions, secrets, and cron](#9-supabase-edge-functions-secrets-and-cron)
10. [OpenAI: cheque scanning](#10-openai-cheque-scanning)
11. [Razorpay: payments and fulfillment](#11-razorpay-payments-and-fulfillment)
12. [Sentry and Microsoft Clarity](#12-sentry-and-microsoft-clarity)
13. [Vercel deployment and environment variables](#13-vercel-deployment-and-environment-variables)
14. [GitHub Actions and QA](#14-github-actions-and-qa)
15. [Acceptance checklist and troubleshooting](#15-acceptance-checklist-and-troubleshooting)
16. [Handover, rotation, and ongoing operations](#16-handover-rotation-and-ongoing-operations)

## 1. Architecture and required accounts

| Service                             | Role                                                                     | Required when                        |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| Supabase                            | Auth, PostgreSQL, private Storage, Edge Functions, Vault, scheduled jobs | Always                               |
| Vercel or another Node.js 22 host   | Next.js frontend and server routes                                       | Deploying the app                    |
| Google Cloud / Google Auth Platform | Google OAuth client and consent screen                                   | Offering Google sign-in              |
| Meta for Developers                 | Facebook OAuth app                                                       | Offering Facebook sign-in            |
| Cloudflare Turnstile                | CAPTCHA verified by Supabase Auth                                        | Enabling production phone sign-in    |
| Twilio Messaging                    | SMS OTP sent by **Supabase Auth**                                        | Offering phone sign-in               |
| Twilio Voice                        | Reminder calls sent by **Supabase Edge Functions**                       | Offering voice reminders             |
| SMTP provider                       | Signup/recovery/account email delivery                                   | Reliable hosted email authentication |
| OpenAI API platform                 | Image-based cheque extraction                                            | Offering AI scans                    |
| Razorpay                            | Checkout, order creation, payment webhook                                | Accepting payments                   |
| Sentry                              | Sanitized errors/traces and optional masked replay                       | Enabling monitoring                  |
| Microsoft Clarity                   | Optional authenticated UX analytics/recordings                           | Enabling Clarity                     |
| GitHub                              | Source, quality workflow, QA test secrets                                | CI and source-connected deployment   |

Google Cloud is used for OAuth, **not Google Vision OCR**. Cloudflare is used for
Turnstile; this application is not configured for Cloudflare Workers hosting.
The WhatsApp support setting is a contact link, not a WhatsApp Business API
integration. Current automated reminder delivery is voice, not SMS/WhatsApp/push.
Apple OAuth, S3, BigQuery, and Supabase's optional analytics/vector features are
not prerequisites merely because template settings appear in the Supabase config.

Provision in this order:

1. Choose names, owners, environments, domains, and enabled features.
2. Create Supabase dev and QA projects; install and run the application.
3. Create hosting projects and decide their stable origins.
4. Apply database migrations and deploy workers for each environment.
5. Configure Auth/OAuth, email, Turnstile, SMS, voice, OCR, and payments as needed.
6. Configure monitoring, environment variables, and CI.
7. Pass QA acceptance checks, then repeat provisioning for production with
   production-only credentials.

## 2. Unified naming standard

### 2.1 Environment vocabulary

Use `dev`, `qa`, and `prod` in **resource names**. Use the exact application and
CLI values below; `prod` is not a valid `NEXT_PUBLIC_APP_ENV` value.

| Purpose                       | Development   | QA         | Production        | Preview                   |
| ----------------------------- | ------------- | ---------- | ----------------- | ------------------------- |
| Resource suffix               | `dev`         | `qa`       | `prod`            | Ephemeral; QA-backed      |
| `NEXT_PUBLIC_APP_ENV`         | `development` | `qa`       | `production`      | `qa`                      |
| `NEXT_PUBLIC_DEPLOYMENT_KIND` | `development` | `qa`       | `production`      | `preview`                 |
| Ops CLI flag                  | `--env local` | `--env qa` | `--env prod`      | QA operations only        |
| Root CLI env file             | `.env.local`  | `.env.qa`  | `.env.production` | Hosting preview variables |

`staging` is supported by the Ops CLI but is not a separate app environment value.
Only add a staging tier deliberately; use `qa` for its app identity and distinct
credentials. Do not use `local` as a deployment-kind value; the schema accepts
`development`.

**Next.js does not automatically load `.env.qa` or files under `env/`.** Local
Next.js development uses the root `.env.local`. The Ops CLI chooses files using
`--env`, with an `env/` fallback if the corresponding root file is absent.
Exported shell variables override Ops env files: clear stale exports before
switching projects.

### 2.2 Provider resource names

Use lowercase kebab-case: `cheque-check-<environment>[-<purpose>]`. Display names
may use `Cheque Check - QA`, but keep machine names/slugs predictable.

| Resource                    | Recommended name / pattern                                                            | Notes                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Supabase organization       | `cheque-check`                                                                        | Shared administrative boundary, with separate projects              |
| Supabase projects           | `cheque-check-dev`, `cheque-check-qa`, `cheque-check-prod`                            | Project refs are provider-generated; never invent them              |
| Vercel projects             | `cheque-check-qa`, `cheque-check-prod`                                                | Separate projects avoid production variables leaking into QA        |
| Google Cloud projects       | `cheque-check-dev-<unique>`, `cheque-check-qa-<unique>`, `cheque-check-prod-<unique>` | IDs must be globally unique; choose the suffix once and record it   |
| Google OAuth web clients    | `cheque-check-<env>-web`                                                              | One client per environment, with that environment's callback        |
| Meta apps                   | `cheque-check-<env>-facebook`                                                         | Separate test and live configuration                                |
| Turnstile widgets           | `cheque-check-<env>-phone-auth`                                                       | Separate key pairs and hostname allowlists                          |
| Twilio subaccounts          | `cheque-check-<env>`                                                                  | Recommended isolation if available; each has its own credentials    |
| Twilio Messaging Services   | `cheque-check-<env>-auth-sms`                                                         | SMS OTP service, not the voice caller                               |
| OpenAI projects             | `cheque-check-<env>`                                                                  | Separate keys, access, and budgets                                  |
| OpenAI key labels           | `cheque-check-<env>-ocr-server`                                                       | Key is server-only                                                  |
| Razorpay webhook labels     | `cheque-check-<env>-order-paid`                                                       | QA uses Test Mode; prod uses Live Mode                              |
| Sentry organization/project | Existing config: `cheque-check` / `javascript-nextjs`                                 | **Code-configured**; see section 12 before choosing different slugs |
| Sentry upload token label   | `cheque-check-<env>-sourcemaps`                                                       | Label is flexible; token must access the configured project         |
| Clarity projects            | `cheque-check-qa`, `cheque-check-prod`                                                | Keep QA recordings separate from prod                               |
| SMTP sender display name    | `Cheque Check`                                                                        | Use a verified sender such as `no-reply@<owned-domain>`             |
| Secret-manager entries      | `cheque-check/<env>/<provider>/<credential>`                                          | Logical path; adapt to the manager's supported characters           |

Example secret-manager references: `cheque-check/prod/supabase/service-role`,
`cheque-check/prod/twilio/auth-token`, and
`cheque-check/prod/cloudflare/turnstile-secret`. These are **labels**, not new
environment-variable names.

### 2.3 Domains and URL contracts

Choose an owned domain; the examples below use the reserved `example.com`.
Provider-generated Vercel domains are also acceptable. Use HTTPS when deployed.

| Purpose                         | Example                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| Production app origin           | `https://app.example.com`                                                |
| QA app origin                   | `https://qa.example.com`                                                 |
| Local app origin                | `http://localhost:3000`                                                  |
| Supabase API origin             | `https://<actual-project-ref>.supabase.co`                               |
| **Provider OAuth redirect URI** | `https://<actual-project-ref>.supabase.co/auth/v1/callback`              |
| **Application Auth callback**   | `https://app.example.com/auth/callback`                                  |
| Password-recovery callback      | `https://app.example.com/auth/callback?next=/settings/password`          |
| Razorpay webhook                | `https://<actual-project-ref>.supabase.co/functions/v1/razorpay-webhook` |

Do not confuse the two OAuth callbacks. Google/Facebook returns to **Supabase**;
Supabase then returns to the **application**. In hosted-dev OAuth, even when the
frontend runs on localhost, the provider redirect remains the hosted Supabase
callback.

### 2.4 Fixed database, bucket, function, and secret names

Separate environments through Supabase projects, **not renamed database schemas,
tables, buckets, or functions**.

| Contract                      | Fixed names                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Database schemas              | App objects in `public`; Supabase-managed `auth`, `storage`, `vault`; cron in `cron`        |
| Storage buckets               | `private-cheque-images`, `private-avatars`, `report-exports`                                |
| Edge Functions                | `notifications-scheduler`, `notifications-dispatcher`, `razorpay-webhook`, `report-exports` |
| Cron jobs                     | `notifications-scheduler-tick`, `notifications-dispatcher-tick`, `report-exports-tick`      |
| Vault entries                 | `project_url`, `service_role_key`                                                           |
| Cron provisioning/status RPCs | `configure_cron_credentials`, `cron_credentials_status`                                     |
| Environment-variable names    | Exact uppercase names listed in sections 8, 9, and 13                                       |
| CI secret names               | Exact `QA_SUPABASE_*` names in section 14                                                   |

Do not add `-qa` to a bucket or function name. Do not rename product IDs or enum
values to match provider labels. Migrations and application constants own those
contracts. New migrations use the repository's timestamped naming convention;
never edit shared migrations to customize a deployment.

### 2.5 Non-secret setup register

Maintain one register per environment in your team's approved operations system:

| Field                               | Record                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Environment and enabled features    | `qa`; Google, email, SMS, voice, OCR, payments, monitoring               |
| Provider display name and actual ID | Supabase name/ref, Google project ID/client ID, Twilio SID, Sentry slugs |
| App origin and callback URLs        | Exact values, including scheme and path                                  |
| Secret references                   | Secret-manager paths only; never secret values                           |
| Credential destinations             | Vercel, Supabase Auth, Edge Function secrets, Vault, CI                  |
| Owner and approval                  | Responsible team, billing owner, privacy/security approval               |
| Verification                        | Date, environment, successful smoke-test reference                       |

## 3. Workstation and local application

1. Install Git, Node.js 22, and npm 11, matching
   [package.json](../package.json) and [.nvmrc](../.nvmrc).
2. Clone the repository and open its root directory in a terminal.
3. Install from the lockfile:

   ```powershell
   npm ci
   ```

4. Use a **disposable hosted dev Supabase project** for the simplest setup:

   ```powershell
   npm run supabase:setup
   ```

   The wizard logs in, links the project, applies migrations, writes
   `.env.local`, adds the project to a local dev allowlist, and regenerates
   database types. If you choose function deployment, it also asks for provider
   secrets and provisions cron credentials when the service-role key is supplied.
   It does **not** finish external Auth/OAuth setup, load the bank seed through
   its plain `db push`, or enable the initially paused export cron job.
   **Never use this dev wizard for production:** it allowlists the project as dev
   and always writes `.env.local`.

5. Set the development identity and safe flags from section 13 in `.env.local`.
   If the wizard has not created it, copy [.env.example](../.env.example) only
   when the destination does not already exist:

   ```powershell
   Copy-Item .env.example .env.local
   ```

6. For a fresh linked dev project, include reference seed data:

   ```powershell
   npx supabase db push --linked --include-seed
   ```

7. Start Next.js:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:3000`. Configure that exact hostname in Auth and
   Turnstile; `localhost` and `127.0.0.1` are not interchangeable allowlist entries.

For fully local Supabase, also install and start a Docker-compatible container
runtime, then use `npx supabase start` and `npx supabase db reset`. That reset
applies to the **local** database, not a production project. Get the local
credentials from `npx supabase status`; regenerate types with
`npm run supabase:gen-types:local`. Review the local CAPTCHA/provider settings
before starting: the checked-in config references a CAPTCHA secret and disables
Twilio. Never enable fixed test OTPs in production.

## 4. Supabase projects, database, storage, and Auth

### 4.1 Create each project and collect credentials

1. Open [Supabase Dashboard](https://supabase.com/dashboard), create/select an
   organization, and create `cheque-check-dev`, then QA, then production.
2. Choose a region appropriate to users and data obligations. Record it; choose
   the hosting region with latency in mind. Use a production plan with appropriate
   backups, availability, and capacity; do not rely on a paused free-tier project.
3. Generate a strong database password and put it in the secret manager.
4. In **Project Settings > API / API Keys**, obtain:
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL`.
   - Public anon key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Service-role key -> server-only `SUPABASE_SERVICE_ROLE_KEY`.
5. In **Connect**, obtain the direct or session-pooler PostgreSQL connection
   string for operational database commands -> `SUPABASE_DB_URL`.
   The session pooler is useful where direct IPv6 connectivity is unavailable.
   URL-encode special characters in the database password.

This repository's setup wizard looks for the **legacy `anon` / `service_role`
keys**, and internal workers compare the incoming bearer value to their
auto-injected `SUPABASE_SERVICE_ROLE_KEY`. Do not substitute an arbitrary
`sb_secret_...` key for that bearer token. Use compatible keys consistently and
verify worker authentication before changing key systems.

The database password, service-role key, public anon key, and CLI access token
are four different credentials. The service role bypasses RLS: never expose it
to the browser or use it as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 4.2 Apply migrations and seed a fresh hosted project

For QA/production, use explicit project selection rather than the dev wizard.
Run commands individually and stop if one fails:

```powershell
npx supabase login
$projectRef = Read-Host "Target Supabase project ref"
npx supabase link --project-ref $projectRef
npx supabase db push --linked --dry-run
npx supabase db push --linked --include-seed
npm run supabase:gen-types
```

Confirm the project displayed during linking and review the migration preview.
The linked target persists on this workstation. Re-link deliberately before
switching environments. `--include-seed` loads the idempotent bank reference
data in [seed.sql](../supabase/seed.sql); it does not create customer accounts.

Migrations create application tables, RLS policies, private storage, payment
catalog/entitlement structures, queues, and cron jobs. If extension creation is
blocked, check **Database > Extensions** for `pg_cron` and `pg_net` and Vault
availability, then resolve the migration error. Do not hand-create a partial
schema from copied fragments.

For later production changes, apply pending migrations only and take appropriate
backups. See [database operations](../scripts/README.md#production-database-reset-and-migrations).
**A production reset is not an installation or upgrade step.**

### 4.3 Verify private Storage and image configuration

In **Storage**, verify:

| Bucket                  | Visibility | Migration-configured upload limit                 |
| ----------------------- | ---------- | ------------------------------------------------- |
| `private-cheque-images` | Private    | 10 MiB; JPEG, PNG, WebP                           |
| `private-avatars`       | Private    | 5 MiB; JPEG, PNG, WebP                            |
| `report-exports`        | Private    | Worker-managed files and owner/entitlement checks |

Do not make any bucket public to fix a download error. Migrations install
ownership policies. App media paths start with the Auth user UUID; reports use
the user UUID/export job structure defined by the export migration.

**New-project code setting:** [next.config.ts](../next.config.ts) currently
contains an existing Supabase hostname under `images.remotePatterns`. Replace
it with the intended project's hostname, or explicitly allow both QA and prod
hostnames when the same code is deployed to both. Preserve the narrow HTTPS
storage paths and signed-image support. Environment variables alone do not
update this allowlist. Follow the installed Next.js
[image configuration guide](../node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/images.md)
before editing it. Rebuild and verify an avatar and cheque image.

### 4.4 Auth URL configuration

In **Authentication > URL Configuration**, set:

- **Site URL:** the environment's canonical frontend origin.
- **Redirect URLs:** the environment's `/auth/callback` and
  `/auth/callback?next=/settings/password` URLs.
- For hosted dev, add the same callback paths at `http://localhost:3000`
  (and `http://127.0.0.1:3000` only if used).
- For QA previews, add explicitly authorized preview callbacks or a narrowly
  scoped QA-project Vercel redirect pattern following
  [Supabase redirect rules](https://supabase.com/docs/guides/auth/redirect-urls).

Never allow all Vercel tenants or QA/local callbacks against production as a
convenience. When adding a custom Auth domain, update provider callbacks and test
the full redirect chain.

### 4.5 Email Auth and SMTP

1. In **Authentication > Sign In / Providers**, enable Email if used.
2. Decide whether email confirmation is required. The checked-in local config
   has confirmations off; changing this for hosted production changes the UX.
   Test signup and the actual confirmation template before adopting the change.
3. Configure **Authentication > SMTP Settings** with your chosen provider's host,
   port, username, password, verified sender address, and sender display name.
   Store SMTP credentials in **Supabase Auth**, not public app variables.
4. On the sender domain, add the provider's exact SPF/DKIM records and a suitable
   DMARC policy. Avoid multiple independent SPF TXT records.
5. Review **Email Templates** for password recovery, signup confirmation when
   enabled, and other used flows. Preserve the token/link placeholders and route
   users through the intended Auth callback.
6. Review **Rate Limits**, password policy, session settings, and redirect URLs.
   The template's `email_sent=2` is not a production capacity recommendation.
   Increase limits only with delivery capacity and abuse controls in place.
7. Verify recovery email delivery, expiry, and return to `/settings/password`.

The built-in email sender has delivery restrictions; configure your own SMTP
for real users. See [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

### 4.6 Dashboard versus `config push`

For from-scratch hosted setup, configure Auth in the dashboard and record the
values in the setup register. The checked-in
[config.toml](../supabase/config.toml) is **not a production-ready Auth profile**:
it declares localhost URLs, enables CAPTCHA, disables Twilio, and includes local
email/security defaults.

Do not blindly run `npx supabase config push` against production. It can overwrite
declared hosted settings. If adopting config-as-code:

1. Prepare/review the correct environment's non-secret config, including URLs,
   enabled providers, rate limits, and email policy.
2. Supply the referenced secrets securely to the CLI process:
   `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` and `SUPABASE_AUTH_CAPTCHA_SECRET`
   when those integrations are configured.
3. Run `npx supabase config diff --project-ref $projectRef` and review the changes.
4. Only then run `npx supabase config push --project-ref $projectRef`.
5. Recheck dashboard settings and all authentication methods.

These shell substitution names are **not Vercel variables**. Google/Facebook
credentials configured only in the dashboard do not need invented app env names.
Do not commit environment-specific secrets to the TOML.

## 5. Google Cloud Console: Google sign-in

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select/create
   `cheque-check-<env>-<unique>`.
2. Open **Google Auth Platform** (older UI: **APIs & Services > OAuth consent
   screen**).
3. Configure **Branding**:
   - App name: `Cheque Check` (use `Cheque Check - QA` for testing).
   - Support/developer contact: your team's monitored address.
   - Homepage, privacy policy, and terms: your deployed URLs. The app currently
     has policy pages under `/settings/privacy-policy` and
     `/settings/terms-and-conditions`; confirm they are publicly accessible for
     reviewers, or provide appropriate public policy pages.
   - Authorized domains: domains you own/control and can verify. Do not claim
     ownership of shared `vercel.app` or `supabase.co` domains.
4. Configure **Audience**:
   - External for public consumer/business users; Internal only if access is
     deliberately restricted to your Workspace organization.
   - In Testing, add authorized test users.
   - Before public launch, publish the app and complete any required brand/domain
     verification. Testing status is not public-launch readiness.
5. Under **Data Access**, configure only `openid`, `userinfo.email`, and
   `userinfo.profile`. Do not request Drive/Gmail/Cloud scopes for this app.
6. Under **Clients > Create client**, choose **Web application**:
   - Name: `cheque-check-<env>-web`.
   - Authorized JavaScript origins: the environment's app origins, without paths.
   - Authorized redirect URIs: copy the exact callback from
     **Supabase > Authentication > Providers > Google**, normally
     `https://<project-ref>.supabase.co/auth/v1/callback`.
7. Save the Client ID and Client Secret in the approved register/secret manager.
8. In **Supabase > Authentication > Providers > Google**, enable Google and enter
   the matching Client ID and Client Secret. Keep nonce checks enabled for this
   browser flow; do not enable unrelated native-app exceptions.
9. Verify Google sign-in and account creation from the intended app origin.

No Google API key, Firebase project, Google service-account JSON, or Google Cloud
billing-enabled Vision API is needed for this OAuth integration. The OAuth
secret belongs in **Supabase Auth**, not Vercel.

Official setup: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## 6. Meta: Facebook sign-in

The application offers Facebook sign-in; configure it if this button will be
supported for users.

1. Open [Meta for Developers](https://developers.facebook.com/), create the
   environment's app, and select the Facebook Login/authentication use case.
2. Configure app name, domains, contact, website URL, privacy policy, terms, and
   user-data deletion instructions/URL as required by Meta.
3. In **Facebook Login > Settings**, configure web OAuth and add the exact
   Supabase callback to **Valid OAuth Redirect URIs**.
4. In the authentication/account-creation **Use Case**, enable `public_profile`
   and **email** permissions. Email is needed for the expected Auth flow.
5. Get the **App ID** and **App Secret** under **App Settings > Basic**.
6. In **Supabase > Authentication > Providers > Facebook**, enable the provider
   and enter these values. The secret stays in Supabase Auth.
7. Use authorized roles/testers while the Meta app is in development mode.
   Complete the current review/verification requirements and switch to Live
   before offering public sign-in.
8. Verify the callback, email availability, profile creation, and logout.

Official setup: [Supabase Facebook sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook).

## 7. Cloudflare: Turnstile and optional DNS

### 7.1 Turnstile

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Turnstile** >
   **Add widget**.
2. Name it `cheque-check-<env>-phone-auth`.
3. Add the exact frontend hostnames, **without** scheme, port, or path:
   `app.example.com` for prod, `qa.example.com` for QA, or the actual Vercel host.
   Use a dev-only widget/test setup for localhost.
4. Select **Managed** mode. Pre-clearance is not needed for the application's
   Supabase CAPTCHA verification flow.
5. Copy:
   - **Site key** -> `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the matching app environment.
   - **Secret key** -> **Supabase Authentication > Bot and Abuse Protection >
     CAPTCHA**, select Turnstile, save the secret.
6. If using config push instead, provide the secret as shell-only
   `SUPABASE_AUTH_CAPTCHA_SECRET`.

Turnstile works without moving your domain's DNS to Cloudflare. No Cloudflare API
token, zone ID, Worker, or R2 bucket is required. Site key and secret must belong
to the **same widget**. Test keys are not production credentials.

**Authentication rollout blocker:** Supabase CAPTCHA protection is project-wide,
not a phone-only switch. The repository currently supplies CAPTCHA tokens in
the phone OTP flow, but its email password login/signup and password-recovery
methods do not supply them. Enabling Supabase CAPTCHA can therefore break those
email flows. Validate every offered auth method in QA. If affected, frontend
CAPTCHA wiring for those flows is required before production phone/CAPTCHA
rollout; provider configuration alone cannot resolve this. Do not disable
production abuse protection as the workaround.

Official guides:
[widget creation](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/),
[testing](https://developers.cloudflare.com/turnstile/reference/testing/),
[Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

### 7.2 Optional custom-domain DNS

If Cloudflare manages your domain:

1. Add the domain and complete registrar nameserver changes if necessary.
2. Add the app hostname under **Vercel > Project > Settings > Domains**.
3. Create the exact DNS record Vercel currently requests; do not copy a historical
   IP/CNAME from another project.
4. Start with DNS-only routing while verifying Vercel domain ownership and TLS.
   If enabling Cloudflare proxying later, validate cookies, OAuth redirects,
   Turnstile, `/monitoring`, and private downloads.
5. Do not cache authenticated app/API responses or signed private media as public
   content. Avoid broad challenges on OAuth callbacks and provider webhook paths.
6. Add SMTP SPF/DKIM/DMARC records as directed by the email provider.
7. Update Supabase redirect URLs, OAuth client settings, and Turnstile hostnames
   whenever the frontend domain changes.

## 8. Twilio: SMS OTP and voice reminders

### 8.1 Account, billing, and permissions

1. Open [Twilio Console](https://console.twilio.com/), create/upgrade the account,
   verify business details, and configure billing.
2. Prefer separate dev/QA/prod subaccounts and numbers. Record their Account SIDs;
   always use the SID/token and sender from the same account.
3. Configure usage alerts, suitable operational spending controls, and monitored
   failure notifications. Budget alerts alone are not guaranteed hard stops.
4. Restrict SMS and voice geographic permissions to intended destinations.
   Phone login is currently **India-only** (`+91`, ten-digit mobile starting 6-9).
   Enable India in the relevant Voice low-/high-risk permission categories where
   required by Twilio, not every country globally.
5. Complete India sender/template/DLT requirements for the messaging route you
   will actually use. Confirm current routing and registration requirements with
   Twilio; approval and delivery cannot be replaced by app settings.

Trial accounts have destination/sender restrictions and are not production-ready.
Official references: [India SMS guidelines](https://www.twilio.com/en-us/guidelines/in/sms),
[Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login).

### 8.2 SMS OTP: configure in Supabase Auth

1. In **Twilio > Messaging > Services**, create
   `cheque-check-<env>-auth-sms`, with the approved sender pool/routing.
2. Record its **Messaging Service SID** (`MG...`), the account **SID** (`AC...`),
   and account **Auth Token**.
3. In **Supabase > Authentication > Providers > Phone**, enable phone signup and
   phone confirmation; choose **Twilio** SMS provider.
4. Enter the Account SID, Auth Token, and Messaging Service SID.
5. Configure a six-digit OTP, an expiry such as **300 seconds**, and **60-second**
   resend frequency. Review `sms_sent` and verification/sign-in rate limits.
   The checked-in config has `sms_sent=30`; choose real limits based on expected
   load, SMS cost, and abuse protection.
6. Match the OTP text to the approved template. The repository template is
   `Your ChequeCheck code is {{ .Code }}`; preserve Supabase's code placeholder
   and validate any required India template mapping with the provider.
7. Configure Turnstile as described above, then enable
   `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` only after QA verification.

For config-as-code, the matching fields are `[auth.sms.twilio]`:
`enabled=true`, `account_sid`, `message_service_sid`, and
`auth_token="env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"`.
The Auth token goes to the config-push process, **not Vercel**.
This runbook uses the repository's Twilio SMS provider, not Twilio Verify;
switching provider changes its required configuration.

Test signup, existing-user login, invalid/expired code, resend delay, linking and
changing login phone, and duplicate ownership. Login must not silently create a
new account. Reminder phone and login phone are separate fields.
See [phone authentication behavior](phone-auth.md).

### 8.3 Voice: configure Edge Function secrets

1. Obtain a Twilio number/caller authorized for outbound calls to the intended
   destinations. Verify voice capability and geographic permissions.
2. Add these **Supabase Edge Function secrets**:

   ```dotenv
   TWILIO_ACCOUNT_SID=<account-sid>
   TWILIO_AUTH_TOKEN=<account-auth-token>
   TWILIO_FROM_NUMBER=<voice-caller-in-e164-format>
   NOTIFICATIONS_TEST_MODE=true
   NOTIFICATIONS_TEST_PHONE=<authorized-qa-recipient-in-e164-format>
   NOTIFICATIONS_FORCE_RUN=false
   ```

3. Deploy scheduler and dispatcher, provision Vault, and test through the Ops CLI.
4. Before real production delivery, explicitly set
   `NOTIFICATIONS_TEST_MODE=false` and `NOTIFICATIONS_FORCE_RUN=false`.

**Test mode redirects every outbound call**, including scheduled customer
reminders, to the test number. It is not restricted to sample calls.

The code submits **inline TwiML** using Twilio Calls API and `Polly.Aditi`
(`en-IN`/`hi-IN`). No TwiML Bin, Studio Flow, inbound voice webhook, AWS Polly
account, or application call-status callback is required by this implementation.
An accepted Twilio Call SID proves provider acceptance, not that a user answered.

For a real reminder, the test user needs an active Voice Reminder entitlement,
quota, enabled voice preference, reminder phone, timezone, and eligible cheque
reminder dates. Grant test access through the Ops CLI, not direct table edits.
See [notification system](notification-system.md) and [Ops CLI](../scripts/README.md).

## 9. Supabase Edge Functions, secrets, and cron

### 9.1 Set custom secrets and deploy

In each project's **Edge Functions > Secrets**, set Twilio voice variables and
`RAZORPAY_WEBHOOK_SECRET` if payments are enabled. Prefer dashboard secret input
or the CLI's `secrets set --env-file` with an access-controlled, ignored file
outside the repository. Do not put secret literals in shell command history.

Supabase automatically injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
into workers; do not set custom secrets starting with `SUPABASE_`.

Deploy explicitly to the target project:

```powershell
$projectRef = Read-Host "Target Supabase project ref"
npx supabase functions deploy notifications-scheduler --project-ref $projectRef
npx supabase functions deploy notifications-dispatcher --project-ref $projectRef
npx supabase functions deploy report-exports --project-ref $projectRef
npx supabase functions deploy razorpay-webhook --project-ref $projectRef --no-verify-jwt
```

| Function                   | Authentication / readiness                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `notifications-scheduler`  | Internal; service-role bearer; do not make public                                               |
| `notifications-dispatcher` | Internal; service-role bearer; Twilio secrets required for calls                                |
| `report-exports`           | Internal; service-role bearer; private export bucket required                                   |
| `razorpay-webhook`         | External POST; gateway JWT verification **off**, application HMAC signature verification **on** |

**Important:** the generic `npm run supabase:functions:deploy` alias and the dev
wizard do not pass the Razorpay-specific `--no-verify-jwt` flag, and the checked-in
config has no function-specific exception. Razorpay does not send a Supabase JWT.
Use the explicit webhook deployment above and verify the dashboard setting after
every redeployment. For a repeatable config-as-code setup, add the non-secret
`[functions.razorpay-webhook]` / `verify_jwt=false` setting to your reviewed
Supabase config. Do not apply it to all functions.

Official reference: [Edge Function configuration](https://supabase.com/docs/guides/functions/function-configuration).

### 9.2 Provision Vault safely

The dev wizard provisions Vault **only when function deployment is selected and
a service-role key is supplied**. QA/prod setup must also call the existing
`configure_cron_credentials` RPC. Merely putting `project_url` and
`service_role_key` lines into an app env file does not create Vault entries.

For manual hosted provisioning/rotation, use the service-role-only RPC over HTTPS.
Run this in a trusted PowerShell terminal, not a shared build log. It prompts for
the secret without echoing it, uses the same key for authorization and Vault, and
prints only credential-presence booleans:

```powershell
$projectUrl = (Read-Host "Target Supabase HTTPS project URL").TrimEnd("/")
if ($projectUrl -notmatch '^https://[a-z0-9-]+\.supabase\.(co|red)$') {
  throw "Use the actual hosted Supabase project URL"
}
$secureKey = Read-Host "Matching Supabase service-role key" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential("service-role", $secureKey)
$key = $credential.GetNetworkCredential().Password
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$body = @{
  requested_project_url = $projectUrl
  requested_service_role_key = $key
} | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "$projectUrl/rest/v1/rpc/configure_cron_credentials" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
  Invoke-RestMethod -Method Post -Uri "$projectUrl/rest/v1/rpc/cron_credentials_status" -Headers $headers -ContentType "application/json" -Body "{}"
} finally {
  Remove-Variable key, headers, body, credential, secureKey
}
```

Verify both `project_url` and `service_role_key` report `true`, then verify workers
actually accept cron calls. Do not print `vault.decrypted_secrets` to troubleshoot.

### 9.3 Verify schedules and enable exports deliberately

In **Supabase > Cron**, or via the SQL Editor, inspect only non-secret metadata:

```sql
select jobname, schedule, active
from cron.job
where jobname in (
  'notifications-scheduler-tick',
  'notifications-dispatcher-tick',
  'report-exports-tick'
)
order by jobname;
```

Current migrations schedule all three every minute (`* * * * *`). The notification
jobs are active; `report-exports-tick` intentionally starts **paused**.
Minute ticks are worker cadence, not a call to every user every minute.

For exports:

1. Deploy `report-exports` and provision Vault.
2. In QA, request an export with a qualified test account and invoke the worker
   once using an authorized service-role caller (for example Supabase's function
   test interface). Validate successful completion and a private owner download.
3. Validate that another user cannot download it and expired files become unavailable.
4. Only after that validation, activate the job in the target environment:

   ```sql
   select cron.alter_job(
     (select jobid from cron.job where jobname = 'report-exports-tick'),
     active := true
   );
   ```

Do not create duplicate schedules in Vercel, Cloudflare, or Twilio. Check Cron
execution history and Edge Function logs for successful worker responses; a
successful `net.http_post` enqueue alone does not prove the worker returned 200.

## 10. OpenAI: cheque scanning

1. Open [OpenAI API platform](https://platform.openai.com/); create/select the
   environment's project.
2. Enable API billing/credits, verify model access and rate limits, and configure
   budgets and alerts. ChatGPT subscription billing is not API billing.
3. Create a server/service-account project key named
   `cheque-check-<env>-ocr-server`, with the required model API permissions.
4. Set `OPENAI_API_KEY` in the matching Vercel/server environment; for local dev,
   use `.env.local`.
5. The current provider defaults to **`gpt-4o-mini`** in
   [ocr.service.ts](../src/features/cheques/services/ocr.service.ts). Model choice
   is code-configured, not an existing model-name env variable.
6. Verify an authorized test user's AI entitlement/quota and scan a synthetic
   cheque image. Confirm date/number/account/payee extraction and nulls for
   unreadable fields. Do not send real customer cheque data in setup smoke tests.

Cheque images are sent to OpenAI for processing. Complete the necessary provider
and data-handling approval before enabling this for customers. A key cannot fix
missing model access, exhausted credits, private image access, or app quota.

## 11. Razorpay: payments and fulfillment

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/) and complete business,
   settlement/bank, KYC, and website requirements for Live Mode.
2. Configure QA in **Test Mode** first.
3. In **Account & Settings > API Keys**, generate the environment's pair:
   - Key ID -> both `NEXT_PUBLIC_RAZORPAY_KEY_ID` and `RAZORPAY_KEY_ID`.
   - Matching Key Secret -> server-only `RAZORPAY_KEY_SECRET`.
4. In **Webhooks**, create `cheque-check-<env>-order-paid`:
   - URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`.
   - Event: **`order.paid`**. This is the event the current handler fulfills.
   - Secret: generate a strong independent webhook secret; it is **not** the API
     Key Secret.
   - Enable the webhook and configure a monitored alert address.
5. Put that same webhook secret into **Supabase Edge Function secrets** as
   `RAZORPAY_WEBHOOK_SECRET`. It is not consumed by Next.js, even though the
   example app env file lists it.
6. Deploy the webhook with gateway JWT verification off as described in section 9.
7. Confirm catalog/prices and purchase entitlements created by the migrations.
   Do not rename `payment_products` IDs to provider labels.
8. Complete a real Test Mode checkout through the app and verify:
   - Server creates the order with the intended product/user notes.
   - Razorpay captures the test payment.
   - `order.paid` webhook delivery returns 2xx.
   - The app purchase history and correct entitlement/quota are updated.
   - Re-delivery does not grant duplicate benefits.
9. Repeat provisioning with **Live Mode** keys and the **prod** webhook/project
   before launch; test and live settings are separate.

The browser checkout success callback is **not fulfillment**. The webhook verifies
the raw-body HMAC signature, captured payment/order match, amount/currency, and
calls `fulfill_payment_order`. Do not disable its signature checks.

If fulfillment fails, inspect webhook delivery history and use
`npm run ops -- payment reconcile --help` for the supported recovery procedure;
do not manually grant benefits just because a browser callback fired.
Official reference: [Razorpay webhooks](https://razorpay.com/docs/webhooks/).

## 12. Sentry and Microsoft Clarity

### 12.1 Sentry project, DSN, and source maps

1. Open [Sentry](https://sentry.io/), create/select the organization and a Next.js
   project.
2. **Code-configured slugs:** [next.config.ts](../next.config.ts) currently uses
   `org: 'cheque-check'` and `project: 'javascript-nextjs'`. Use that project if
   you have authorized access, or update these two non-secret config values to
   your own organization's/project's actual slugs. Setting `SENTRY_ORG` or
   `SENTRY_PROJECT` alone is not this repository's configured mechanism.
3. Get the project **Settings > Client Keys (DSN)** value ->
   `NEXT_PUBLIC_SENTRY_DSN`.
4. Create a narrowly scoped build/upload token named
   `cheque-check-<env>-sourcemaps`, authorized for the configured organization,
   project, and release/source-map upload operations. Use Sentry's current
   organization-token flow, or the required release/project scopes for a personal
   token; do not grant full organization administration.
5. Add `SENTRY_AUTH_TOKEN` only to the trusted build environment as a secret.
   Do not expose it to untrusted preview builds/forks or `NEXT_PUBLIC_*`.
6. Set the flags below before building:

   ```dotenv
   NEXT_PUBLIC_OBSERVABILITY_ENABLED=true
   NEXT_PUBLIC_MONITORING_POLICY_APPROVED=false
   NEXT_PUBLIC_REPLAY_ENABLED=false
   NEXT_PUBLIC_CLARITY_ENABLED=false
   NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
   NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE=0.01
   NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE=0.25
   ```

7. Use `NEXT_PUBLIC_APP_ENV=qa` or `production` as appropriate. Vercel supplies
   the default release `cheque-check@<commit-sha>`; enabled local/non-Vercel
   monitoring needs an explicit `NEXT_PUBLIC_APP_RELEASE`.
8. Configure Sentry alerts, retention, team access, and environment filters.
   The existing monitoring design uses one project with QA/prod environment
   filters; do not silently invent separate upload destinations.
9. In QA, verify a sanitized error has readable source-mapped stack frames,
   the intended environment/release, and request/diagnostic references.

The repository already integrates the SDK: do not rerun an installation wizard
that overwrites its privacy/instrumentation configuration. Enabled Vercel Sentry
builds require the upload token. The app uses `/monitoring` as a tunnel and
deletes source maps after upload.

Official reference: [Sentry Next.js build options](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/).

### 12.2 Clarity and optional replay

1. Open [Microsoft Clarity](https://clarity.microsoft.com/) and create
   `cheque-check-qa` and `cheque-check-prod` with their corresponding website URLs.
2. Copy each project ID from **Settings / Setup** ->
   `NEXT_PUBLIC_CLARITY_PROJECT_ID` in that environment.
3. Configure strict masking and limited team access/retention. Do not paste a
   second Clarity script into the app; it already loads the integration.
4. Complete provider/privacy review, then set
   `NEXT_PUBLIC_MONITORING_POLICY_APPROVED=true`.
5. Set `NEXT_PUBLIC_CLARITY_ENABLED=true` for Clarity and/or
   `NEXT_PUBLIC_REPLAY_ENABLED=true` for Sentry replay, only after QA validation.
   Essential observability must also be enabled.
6. Verify inputs/text/media masking, no auth-screen recording, correct identity
   after account switches, logout teardown, and the browser-local analytics
   opt-out plus GPC/Do Not Track behavior.

Both identity integrations can carry approved user information; masking alone is
not permission to collect it. See the full
[monitoring and privacy rollout guide](monitoring-and-session-lookup.md).
Previews are off by default; opt-in previews require
`NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED=true`, QA identity/destinations, and
approved access to upload credentials.

## 13. Vercel deployment and environment variables

### 13.1 Create projects

1. Open [Vercel](https://vercel.com/), import the repository, choose **Next.js**,
   use the repository root, and select **Node.js 22**.
2. Use the committed npm lockfile: install with `npm ci`, build with
   `npm run build`; keep the Next.js output defaults.
3. Create `cheque-check-qa` and `cheque-check-prod`; set the appropriate production
   branch for each. Add stable domains and verify TLS.
4. Under **Settings > Environment Variables**, assign variables to their correct
   Production/Preview/Development scopes. In the QA hosting project, even a
   Vercel "Production" deployment uses `NEXT_PUBLIC_APP_ENV=qa`.
5. All prod-project **Preview** builds must use the **QA/preview Supabase
   project**, never prod. Use test payments, QA analytics, and no live call
   destinations. Prefer not exposing privileged keys to untrusted previews.
6. Apply Supabase migrations, secrets, workers, and Auth settings separately;
   Vercel does not provision them.
7. Deploy/redeploy after setting variables. Public values are embedded at build
   time; changing a dashboard variable alone does not change an existing build.

The current Next.js config derives deployment kind from Vercel preview detection
or `NEXT_PUBLIC_APP_ENV`. Set the **app environment correctly**, not just the
deployment-kind variable. Do not change `NODE_ENV` to identify QA.

### 13.2 Credential destination matrix

| Value                              | Local Next.js / Vercel                            | Supabase Auth             | Edge Function secrets              | Vault / operations / CI                                   |
| ---------------------------------- | ------------------------------------------------- | ------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Project URL + public anon key      | Yes, `NEXT_PUBLIC_*`                              | Project itself            | Auto project URL                   | CLI/QA CI use corresponding project                       |
| Service-role key                   | Server-only, needed for administrative app routes | Not a provider credential | Auto-injected; do not manually set | Ops server key; Vault `service_role_key`; QA CI           |
| Google Client ID/Secret            | No                                                | Google provider           | No                                 | Secret manager only                                       |
| Facebook App ID/Secret             | No                                                | Facebook provider         | No                                 | Secret manager only                                       |
| Turnstile site key                 | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                  | No                        | No                                 | Non-secret register                                       |
| Turnstile secret                   | No                                                | CAPTCHA provider          | No                                 | Shell `SUPABASE_AUTH_CAPTCHA_SECRET` only for config push |
| Twilio SMS credentials/Service SID | No                                                | Phone provider            | No for SMS OTP                     | Shell Auth token only for config push                     |
| Twilio voice credentials/number    | No                                                | No                        | `TWILIO_*`                         | Secret manager                                            |
| OpenAI key                         | Server-only `OPENAI_API_KEY`                      | No                        | Not used by these workers          | Secret manager                                            |
| Razorpay Key ID                    | Public + server names                             | No                        | No                                 | Ops reconcile uses server Key ID                          |
| Razorpay Key Secret                | Server-only                                       | No                        | No                                 | Ops reconcile uses matching secret                        |
| Razorpay webhook secret            | Not used by app                                   | No                        | `RAZORPAY_WEBHOOK_SECRET`          | Razorpay webhook configuration                            |
| Sentry DSN                         | Public                                            | No                        | Not configured here                | Non-secret register                                       |
| Sentry upload token                | Build-only `SENTRY_AUTH_TOKEN`                    | No                        | No                                 | Trusted build secrets                                     |
| Clarity project ID                 | Public                                            | No                        | No                                 | Non-secret register                                       |
| SMTP password                      | No                                                | SMTP settings             | No                                 | Secret manager                                            |
| Database connection string         | No app runtime need                               | No                        | No                                 | Ops `SUPABASE_DB_URL`; QA CI                              |
| Supabase access token              | No app runtime need                               | No                        | No                                 | CLI login/approved automation only                        |
| Vault project URL                  | Does not create Vault                             | No                        | No                                 | Vault `project_url`, provisioned through RPC              |

### 13.3 Baseline application configuration

Use this as the starting block for root `.env.local` or individual hosting
variables. Replace placeholders; omit unavailable optional credentials rather
than deploying fake values.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<actual-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<matching-public-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<matching-server-only-service-role-key>

NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_DEPLOYMENT_KIND=development
NEXT_PUBLIC_LOG_LEVEL=debug

NEXT_PUBLIC_PHONE_AUTH_ENABLED=false
NEXT_PUBLIC_OBSERVABILITY_ENABLED=false
NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED=false
NEXT_PUBLIC_MONITORING_POLICY_APPROVED=false
NEXT_PUBLIC_REPLAY_ENABLED=false
NEXT_PUBLIC_CLARITY_ENABLED=false
```

For QA set identity to `qa`/`qa`; for prod set `production`/`production` and
`NEXT_PUBLIC_LOG_LEVEL=info`. Previews use `qa`/`preview`.
Use a hosted Supabase URL for every deployed environment.

Add these only when their feature has passed setup:

```dotenv
# Phone sign-in: also configure Supabase Auth + Turnstile + Twilio SMS.
NEXT_PUBLIC_PHONE_AUTH_ENABLED=true
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<matching-widget-site-key>

# AI scans.
OPENAI_API_KEY=<server-api-key>

# Checkout: use matching test or live pair, never mix.
NEXT_PUBLIC_RAZORPAY_KEY_ID=<key-id>
RAZORPAY_KEY_ID=<same-key-id>
RAZORPAY_KEY_SECRET=<matching-server-key-secret>

# Sentry: also set observability flags and valid release/environment.
NEXT_PUBLIC_SENTRY_DSN=<project-dsn>
SENTRY_AUTH_TOKEN=<build-only-upload-token>

# Clarity: omit the variable entirely when not configured.
NEXT_PUBLIC_CLARITY_PROJECT_ID=<environment-project-id>

# Optional support contact; not a WhatsApp API credential.
NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER=<support-number-in-e164-format>
```

Do not copy this whole optional block without the providers. In particular,
omit unset `NEXT_PUBLIC_CLARITY_PROJECT_ID` rather than assigning an empty string
because enabled/configured monitoring validates its format.
Do not leave identity values blank. See the full
[environment reference](../README.md#environment) for all sampling/release options.

For Ops, create separate root `.env.qa` and `.env.production` with their respective
project URL, service-role key, public anon key, database connection if needed,
and matching Razorpay server credentials if reconciling payments. Mark **only
disposable** dev/QA projects as dev-allowlisted; never allowlist prod.

## 14. GitHub Actions and QA

In **GitHub repository > Settings > Secrets and variables > Actions**, set these
exact **repository secret** names used by
[quality.yml](../.github/workflows/quality.yml):

| CI secret                      | Value from the disposable QA project                |
| ------------------------------ | --------------------------------------------------- |
| `QA_SUPABASE_URL`              | HTTPS Supabase project URL                          |
| `QA_SUPABASE_ANON_KEY`         | Public anon key                                     |
| `QA_SUPABASE_SERVICE_ROLE_KEY` | QA service-role key                                 |
| `QA_SUPABASE_DB_URL`           | QA direct/session-pooler Postgres URI with password |

Repository secrets are what the current workflow reads; storing them only in a
GitHub Environment without wiring that environment into the workflow will not
make them available.

**The E2E job resets the QA application's database before running.** Use a
dedicated, disposable project without customer data; shared manual QA data can
also be lost. The workflow serializes runs against this project. Never point
these four values at production.

The quality job supplies dummy values for local builds/tests; these are not
usable deployed provider credentials. Real-provider SMS/OAuth/call/payment smoke
tests remain separate from automated CI. Privileged QA secrets should not be
exposed to untrusted fork workflows.

For authorized local QA verification, consult [E2E setup](../e2e/README.md), then:

```powershell
npm run ops -- ops doctor --env qa
npm run ops -- ops notification-health --env qa --json
npm run test:e2e:qa
```

The final command is destructive to the configured QA database; do not run it
against a shared project without approval.

## 15. Acceptance checklist and troubleshooting

### 15.1 Required release gates

Check only enabled integrations, but do not mark a configured key as a passed
end-to-end test.

- [ ] Register has correct project IDs, resource names, owners, origins, and secret references.
- [ ] QA/previews and prod do not share Supabase databases or live payment/call credentials.
- [ ] Fresh migrations and bank seed succeeded; regenerated types match the schema.
- [ ] Private buckets/policies exist; avatar and cheque images render on the new hostname.
- [ ] Core signup/login, onboarding, business, party, account, and cheque CRUD work.
- [ ] Password recovery works with real SMTP and the intended callback.
- [ ] Google/Facebook public/test audiences and both callback layers are correct.
- [ ] Phone OTP signup/login/link/change pass with Turnstile and real authorized SMS.
- [ ] Email signup/login/recovery still work after Supabase CAPTCHA is enabled.
- [ ] Invalid codes, duplicate phone ownership, resend/rate limits, and deactivation are enforced.
- [ ] All internal workers reject unauthorized requests; cron calls are authenticated.
- [ ] Vault presence check and Cron/worker execution checks pass.
- [ ] Authorized voice sample is accepted; actual scheduled reminder and quota accounting work.
- [ ] Production voice test redirection/force-run flags are explicitly false.
- [ ] AI scan succeeds with a synthetic cheque and expected entitlement/quota.
- [ ] Razorpay Test Mode checkout results in verified `order.paid` fulfillment exactly once.
- [ ] Live payment keys/webhook are set only in prod; signature verification remains enabled.
- [ ] Export worker is verified with private owner download before its cron job is enabled.
- [ ] Sentry QA stacks are source-mapped with correct release/environment.
- [ ] Optional replay/Clarity masking, opt-out, logout/account switch, and GPC/DNT checks pass.
- [ ] DNS/TLS, billing, backups/restore procedure, alerts, and team access are reviewed.
- [ ] No secrets are tracked; hosting variables have been followed by a new deployment.

### 15.2 Common failures

| Symptom                                        | Check                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| App fails environment validation               | Required Supabase values, nonblank identity enums, hosted URL in QA/prod, Turnstile key when prod phone auth is on               |
| Google `redirect_uri_mismatch`                 | Google needs Supabase `/auth/v1/callback`, not app `/auth/callback`; check exact project/scheme                                  |
| OAuth works only for the developer             | Google Testing audience / Meta development roles and publication requirements                                                    |
| Auth returns to localhost or wrong environment | Supabase Site URL/redirect list; an unreviewed config push may have restored local defaults                                      |
| Email auth fails after enabling Turnstile      | Project-wide CAPTCHA and missing email/recovery token wiring; see section 7 rollout blocker                                      |
| SMS send fails                                 | Supabase Phone provider enabled, matching Twilio SID/token/service, funding, India route/template, Turnstile hostname and secret |
| OTP accepted nowhere                           | Six-digit code, configured expiry, correct flow purpose and phone ownership; never solve with prod fixed test codes              |
| Images fail only on a new project              | Project hostname in `next.config.ts`, signed URL access/expiry, private Storage policies                                         |
| No bank choices                                | Seed was not included; the dev wizard only runs plain `db push`                                                                  |
| Worker returns 401                             | Gateway JWT setting and exact matching service-role bearer/Vault value; do not make internal workers public                      |
| All calls go to one phone                      | `NOTIFICATIONS_TEST_MODE=true`; turn it off for real delivery                                                                    |
| No reminder jobs                               | Entitlement/quota, enabled voice preference, phone/timezone, cheque offsets/date eligibility, scheduler checkpoints              |
| Call rejected                                  | Twilio number capability, matching subaccount, trial restrictions, India voice permissions, balance                              |
| Paid but not upgraded                          | Webhook `order.paid`, matching webhook secret, gateway JWT off, captured order validation, delivery retries/reconciliation       |
| Exports stay queued                            | `report-exports-tick` starts inactive; verify worker/Vault/private download before activating                                    |
| Monitoring build fails                         | Enabled Vercel build needs upload token; token and hard-coded Sentry slugs must match                                            |
| No Sentry/Clarity data                         | Build-time flags, release/env, approved policy for analytics, preview gate, browser opt-out/GPC/DNT                              |
| Env changes have no effect                     | Rebuild/redeploy; Next.js does not load CLI `.env.qa` or `env/` files                                                            |
| QA E2E fails before tests                      | Missing exact CI secrets, wrong DB URI/ref, blocked pooler connection, database reset error                                      |

## 16. Handover, rotation, and ongoing operations

- Use team-owned provider accounts, least-privilege access, MFA, and documented
  billing/alert ownership. Avoid production resources owned only by one developer.
- Keep dev/QA secrets distinct from prod and restrict production upload/admin
  credentials from untrusted builds.
- Rotate a Supabase service-role credential across app-server configuration,
  Ops/CI where applicable, and **Vault via `configure_cron_credentials`**. Verify
  worker runtime compatibility and successful cron authentication afterward.
- Rotate Google/Facebook client secrets in Supabase Auth; Turnstile secrets in
  Supabase CAPTCHA; Twilio SMS tokens in Auth and voice tokens in Edge secrets.
  Account-token rotation may affect both integrations if they share an account.
- Rotate Razorpay API credentials in app/Ops and webhook secrets in both Razorpay
  and Supabase. Account for pending webhook retries during rotation.
- Rotate OpenAI server keys and Sentry build tokens in the corresponding host.
  Rebuild for changes to any public key/flag/ID.
- When changing domains, update hosting DNS/TLS, Supabase redirect lists, OAuth
  client origins/callbacks, Turnstile hostnames, SMTP sender records where relevant,
  and the setup register.
- Monitor queue age, scheduler progress, uncertain provider outcomes, worker
  failures, storage/export cleanup, provider usage, and payment webhook retries.
  Use `npm run ops -- ops notification-health --env prod --check --json` for the
  existing read-only health check; it does not start a polling service.
- Delete only the specifically created temporary secret files after provisioning;
  do not retain them as setup artifacts.

Related runbooks: [environment configuration](environment-configuration.md),
[Ops CLI](../scripts/README.md), [phone authentication](phone-auth.md),
[notification system](notification-system.md),
[monitoring and session lookup](monitoring-and-session-lookup.md),
[data lifecycle](data-lifecycle.md), and
[Premium access policy](premium-access-policy.md).
