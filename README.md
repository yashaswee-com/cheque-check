# Cheque Check

Cheque Check is a Next.js and Supabase application for managing business cheque records, accounts, parties, reports, payments, and notifications ([package dependencies](package.json#L49-L92), [feature routes](<src/app/(dashboard)/dashboard/page.tsx#L1>)). This repository snapshot describes checked-in code; it does not certify production deployment, provider readiness, security scan status, or user adoption ([documentation evidence rules](constitution.md#L16-L41)).

## Start here

- [Architecture](docs/architecture.md): project layout, data flow, and implementation boundaries.
- [Environment and secrets](docs/environment-and-secrets.md): variable groups and secret destinations.
- [Infrastructure and deployment](docs/infrastructure-and-deployment.md): service topology and deployment verification.
- [Security and known risks](docs/security-and-known-risks.md): controls, limitations, and deployment risks.
- [Scaling and observability](docs/scaling-and-observability.md): bounded reads, workers, diagnostics, and benchmark limits.
- [Documentation index](docs/README.md): feature references and end-user guides.

## Local development

The package declares Node.js `>=22 <23` and npm `11.17.0`; its scripts include development, build, lint, type-check, tests, and local Supabase helpers ([runtime and scripts](package.json#L1-L40)). The app's public environment schema requires a Supabase URL and public anon key ([environment schema](src/lib/env/schema.ts#L64-L76)).

```sh
npm ci
npm run dev
```

The available commands and their intent are defined in the package manifest; command availability is not evidence that a command or test passed ([package scripts](package.json#L9-L40)).

## Repository map

- `src/app/` contains App Router pages and API handlers; `src/features/` owns feature UI, hooks, services, repositories, and validators ([architecture map](docs/architecture.md#quick-map)).
- `src/lib/`, `src/domain/`, `src/validators/`, and `src/types/` provide shared infrastructure and contracts ([architecture guide](docs/architecture.md#design-paradigm)).
- `supabase/` contains database migrations, Edge Functions, local configuration, and reference data; `scripts/` contains CLI and scaling tooling ([package scripts](package.json#L25-L40), [Supabase deployment scripts](package.json#L37-L40)).

## Quality and security

The GitHub workflow is configured to run formatting, lint, type-checking, tests, secret scanning, dependency audit, and build; its configuration does not establish the result of a particular run ([quality workflow](.github/workflows/quality.yml#L39-L71)). For risks and important boundaries, use [Security and known risks](docs/security-and-known-risks.md); no vulnerability-free claim is made by this README ([security scope](docs/security-and-known-risks.md#L1-L7)).

## Documentation

The technical guides are maintained as a feature-oriented snapshot with repository citations. Deployment-specific claims must be checked against the target environment, and historic product requirements are not treated as proof of current behavior ([documentation constitution](constitution.md#L16-L41), [documentation index](docs/README.md#L1-L40)).
