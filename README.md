<p align="center">
  <img src="public/android-chrome-192x192.png" alt="Cheque Check" width="96" height="96">
</p>

<h1 align="center">Cheque Check</h1>

<p align="center">
  A mobile-first workspace for tracking business cheques, parties, bank accounts, reminders, reports, and follow-up work.
  <br />
  <a href="https://chequecheck.in"><strong>Website</strong></a>
  ·
  <a href="docs/help/en/README.md">Help Center</a>
  ·
  <a href="docs/architecture.md">Architecture</a>
  ·
  <a href="SECURITY.md">Security</a>
</p>

> [!IMPORTANT]
> This README is the repository table of contents. It describes checked-in code and configuration; it does not certify a hosted deployment, provider readiness, passing checks, or live business behavior. See the [documentation constitution](constitution.md) for evidence and reporting rules.

## Contents

- [About](#about)
- [Core capabilities](#core-capabilities)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Common commands](#common-commands)
- [Repository map](#repository-map)
- [Documentation index](#documentation-index)
- [Quality and release](#quality-and-release)
- [Project governance](#project-governance)

## About

Cheque Check is a Next.js application backed by Supabase. It separates records by business and supports the cheque lifecycle from entry through clearance or bounce, with optional AI extraction, reminders, reports, and Premium workflows.

The implementation is organized by feature rather than by a single monolithic application layer. Start with the [architecture guide](docs/architecture.md) for the route, feature, data, provider, and database boundaries.

## Core capabilities

- **Business cheque management:** businesses, parties, bank accounts, issued/received cheques, drafts, tags, status changes, and audit history. See [Cheque management](docs/cheque-management.md).
- **AI-assisted cheque entry:** image upload, durable scan jobs, guarded field application, review, credits, and manual fallback. See [AI cheque scanning](docs/ai-cheque-scanning.md).
- **Reminders and notifications:** inbox events, scheduled voice reminders, push registration, and opt-in party messaging. See [Notifications](docs/notifications.md).
- **Reports and exports:** previews, Business Cheque Overview PDFs, Excel/CSV/JSON exports, and durable export jobs. See [Reports and exports](docs/reports-and-exports.md).
- **Premium and payments:** entitlement-checked tools, Razorpay checkout fulfillment, quotas, referrals, and wallet credits. See [Payments and Premium](docs/payments-and-premium.md).
- **Public and support experience:** landing pages, pricing, onboarding, FAQ/help, feedback, roadmap, and public cheque-bounce tools. See [Public site and feedback](docs/public-site-and-feedback.md) and [Announcements and onboarding](docs/announcements-and-onboarding.md).
- **Localization and installation:** English, Hindi, Hinglish, preference-driven formatting, PWA installation, and a private-data-free offline fallback. See [Application shell and localization](docs/application-shell-and-localization.md).

## Technology

| Area         | Main technologies                                                             |
| ------------ | ----------------------------------------------------------------------------- |
| Web          | Next.js 16, React 19, TypeScript, Tailwind CSS                                |
| Data/auth    | Supabase Auth, PostgreSQL, Row Level Security, Storage, Edge Functions        |
| State/forms  | TanStack Query, React Hook Form, Zod                                          |
| Providers    | OpenAI, Razorpay, Twilio, Web Push, Sentry, Clarity, Meta marketing analytics |
| Quality      | Vitest, Testing Library, Playwright, ESLint, Prettier, TypeScript             |
| Localization | `next-intl` message catalogs for English, Hindi, and Hinglish                 |

Exact runtime, dependency, and script versions are defined in [package.json](package.json).

## Quick start

### Prerequisites

- Node.js `>=22.12.0 <23`
- npm `11.17.0`
- A configured Supabase destination for application features

The repository's supported runtime and package manager are declared in [package.json](package.json). Environment variables and secret destinations are intentionally split between the Next.js app, Supabase Auth, Supabase Edge Functions, and the operations CLI; follow [Environment and secrets](docs/environment-and-secrets.md) before starting.

### Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Populate `.env.local` with values for the intended local or non-production environment. Do not copy production secrets into browser-visible variables. Supabase setup, migrations, hosted deployment, and provider verification are covered in [Infrastructure and deployment](docs/infrastructure-and-deployment.md).

## Common commands

```sh
npm run dev
npm run lint
npm run type-check
npm test
npm run build
npm run format:check
```

| Command                 | Detailed reference                                                   |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run ops -- --help` | [Operations CLI and support runbook](scripts/README.md)              |
| `npm run test:e2e:qa`   | [E2E setup and QA reset boundaries](e2e/README.md)                   |
| `npm run test:coverage` | [Coverage policy and verification scope](e2e/TEST-PLAN.md)           |
| `npm run db:migrate`    | [Database and release procedure](deployment-checklist.md)            |
| `npm run test:scaling`  | [Benchmark scope and limitations](docs/scaling-and-observability.md) |

Commands are available only because the repository configures them; their presence is not evidence that they passed. Several test, deployment, and operations commands are destructive or environment-specific. Read their linked guide before use.

## Repository map

| Path                                 | Purpose                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| [`src/app/`](src/app/)               | Next.js routes, layouts, pages, and HTTP handlers                           |
| [`src/features/`](src/features/)     | Feature-owned UI, hooks, services, repositories, and domain integration     |
| [`src/components/`](src/components/) | Shared application and interface components                                 |
| [`src/domain/`](src/domain/)         | Shared business entities and lifecycle rules                                |
| [`src/lib/`](src/lib/)               | Environment access, Supabase clients, logging, query keys, and utilities    |
| [`src/validators/`](src/validators/) | Shared runtime/input validation                                             |
| [`src/types/`](src/types/)           | Shared TypeScript contracts                                                 |
| [`messages/`](messages/)             | English, Hindi, and Hinglish translation catalogs                           |
| [`public/`](public/)                 | Static assets, PWA manifest, service worker, and offline page               |
| [`supabase/`](supabase/)             | Migrations, Edge Functions, local config, seed data, and reference data     |
| [`scripts/`](scripts/)               | Operations CLI, deployment automation, benchmarks, and developer tooling    |
| [`e2e/`](e2e/)                       | Playwright tests, fixtures, page objects, and the test plan                 |
| [`docs/`](docs/)                     | Implementation, operations, PRD, and end-user help documentation            |
| [`incidents/`](incidents/)           | Sanitized production and operational incident records                       |
| [`.github/`](.github/)               | CI, production release, issue forms, prompts, and custom instructions       |
| [`ads/`](ads/)                       | Advertising copy and related material                                       |
| [`env/`](env/)                       | Environment-specific local operational files that are not a source template |
| [`DESIGN.md`](DESIGN.md)             | Product design tokens and visual direction                                  |
| [`constitution.md`](constitution.md) | Rules for evidence, privacy, writing, and maintenance of project docs       |

The detailed code map, dependency boundaries, request flow, and implementation limits live in [Architecture](docs/architecture.md).

## Documentation index

### Product and implementation

| Topic                                           | Guide                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Architecture and repository boundaries          | [Architecture](docs/architecture.md)                                             |
| Application shell, PWA, and localization        | [Application shell and localization](docs/application-shell-and-localization.md) |
| Authentication, profiles, and account lifecycle | [Authentication and profile](docs/authentication-and-profile.md)                 |
| Phone OTP and CAPTCHA                           | [Phone authentication](docs/phone-auth.md)                                       |
| Cheques, drafts, lifecycle, and statuses        | [Cheque management](docs/cheque-management.md)                                   |
| AI cheque extraction                            | [AI cheque scanning](docs/ai-cheque-scanning.md)                                 |
| Bank directory and custom banks                 | [Bank catalog](docs/bank-catalog.md)                                             |
| Reports and export formats                      | [Reports and exports](docs/reports-and-exports.md)                               |
| Premium tools, checkout, referrals, and credits | [Payments and Premium](docs/payments-and-premium.md)                             |
| Notifications and reminder delivery             | [Notifications](docs/notifications.md)                                           |
| Public site, feedback, and roadmap              | [Public site and feedback](docs/public-site-and-feedback.md)                     |
| Announcements and onboarding                    | [Announcements and onboarding](docs/announcements-and-onboarding.md)             |
| Marketing analytics and consent                 | [Marketing analytics](docs/marketing-analytics.md)                               |
| Record deletion, recovery, and private media    | [Data lifecycle and storage](docs/data-lifecycle-and-storage.md)                 |

### Infrastructure and operations

| Topic                                          | Guide                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Environment values and secret destinations     | [Environment and secrets](docs/environment-and-secrets.md)             |
| Hosting, Supabase, workers, and providers      | [Infrastructure and deployment](docs/infrastructure-and-deployment.md) |
| Durable worker recovery boundaries             | [Durable background work](docs/durable-background-work.md)             |
| Scaling, diagnostics, and observability        | [Scaling and observability](docs/scaling-and-observability.md)         |
| Support and incident operations                | [Operations runbook](docs/operations-runbook.md)                       |
| Security controls, trust boundaries, and risks | [Security and known risks](docs/security-and-known-risks.md)           |
| Release procedure                              | [Pre-deployment checklist](deployment-checklist.md)                    |
| Release-specific evidence                      | [Production deployment record](deployments.md)                         |
| Incident index and records                     | [Incident records](incidents/README.md)                                |

### Testing and developer tooling

| Topic                                              | Guide                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Operations CLI, support commands, and safety gates | [`scripts/README.md`](scripts/README.md)                                |
| Playwright setup, QA reset, and test boundaries    | [`e2e/README.md`](e2e/README.md)                                        |
| E2E priorities and unit coverage policy            | [`e2e/TEST-PLAN.md`](e2e/TEST-PLAN.md)                                  |
| Package scripts and dependency versions            | [`package.json`](package.json)                                          |
| CI quality workflow                                | [Quality workflow](.github/workflows/quality.yml)                       |
| Production release workflow                        | [Production Release workflow](.github/workflows/production-release.yml) |

### Users, design, and history

| Topic                       | Reference                                     |
| --------------------------- | --------------------------------------------- |
| Day-to-day English guidance | [English Help Center](docs/help/en/README.md) |
| Day-to-day Hindi guidance   | [Hindi Help Center](docs/help/hi/README.md)   |
| Product design system       | [`DESIGN.md`](DESIGN.md)                      |
| Product requirements        | [`docs/prd/`](docs/prd/)                      |
| Checked-in release history  | [`changelog.md`](changelog.md)                |
| Documentation standards     | [`constitution.md`](constitution.md)          |

## Quality and release

The quality workflow configures changed-file formatting, lint, type-checking, Vitest, secret scanning, production dependency audit, and build checks ([workflow](.github/workflows/quality.yml)). The production workflow validates configuration, applies forward database migrations, and deploys a pinned commit to Vercel ([workflow](.github/workflows/production-release.yml)).

Those workflows are automation definitions, not passing-run claims. Use the [deployment checklist](deployment-checklist.md), [deployment record](deployments.md), and [E2E guide](e2e/README.md) to separate repository verification from provider and hosted-environment verification.

## Project governance

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Documentation Constitution](constitution.md)
- [Security Policy](SECURITY.md)
- [Contributor/agent instructions](AGENTS.md)
- [License](LICENSE.md)

Suspected vulnerabilities must be reported privately as described in [SECURITY.md](SECURITY.md). This repository is **all rights reserved**; no permission is granted to use, copy, modify, or distribute its contents under the checked-in [license](LICENSE.md).
