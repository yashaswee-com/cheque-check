# Documentation index

This index points to current feature and system guides. Implementation claims in those guides cite repository code, migrations, tests, or configuration; deployment state must be verified separately ([documentation constitution](../constitution.md#L16-L41)).

## System and operations

<!-- prettier-ignore -->
| Guide                                                             | Purpose                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                                   | Repository structure, request/data flow, and design boundaries.                     |
| [Launch deployment checklist](../deployments.md)                    | Launch gates, deployment evidence, and human verification items.                   |
| [Reusable pre-deployment checklist](../deployment-checklist.md)      | Chronological release steps from Git preparation through post-deploy verification. |
| [Environment and secrets](environment-and-secrets.md)             | Public build settings, server credentials, provider destinations, and config gaps.  |
| [Infrastructure and deployment](infrastructure-and-deployment.md) | Service topology, deployable units, and environment verification.                   |
| [Day-to-day operations runbook](operations-runbook.md)            | Daily operations, testing, and deployment command reference.                         |
| [Incident records](../incidents/README.md)                        | Feature-classified reports, including [cheque OCR](../incidents/cheque-management/2026-11-09-cheque-ocr-image-not-found.md), [signup push reconciliation](../incidents/notifications/2026-11-10-signup-push-reconciliation-error.md), and [sample voice test dispatcher](../incidents/notifications/2026-11-08-sample-voice-test-dispatcher-unauthorized.md). |
| [Security and known risks](security-and-known-risks.md)            | Security boundaries, limitations, and repository-level deployment risks.           |
| [Scaling and observability](scaling-and-observability.md)          | Bounded data access, jobs, diagnostics, and local benchmark scope.                  |

## Feature guides

| Guide                                                                       | Purpose                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Authentication and profile](authentication-and-profile.md)                 | Sessions, phone OTP, profile lifecycle, and application PIN.                 |
| [Phone OTP authentication](phone-auth.md)                                   | CAPTCHA-aware sign-in, signup, phone linking, and verification behavior.     |
| [Cheque management](cheque-management.md)                                   | Cheque records, drafts, filters, lifecycle, and dashboard statistics.        |
| [Bank catalog](bank-catalog.md)                                             | Shared reference banks, private custom banks, and selector behavior.         |
| [Reports and exports](reports-and-exports.md)                               | Aggregate reports, browser exports, and durable CSV/JSON jobs.               |
| [Payments and Premium](payments-and-premium.md)                             | Razorpay checkout, entitlement enforcement, referrals, and wallet credit.    |
| [Notifications](notifications.md)                                           | Inbox, voice reminders, Web Push, and worker boundaries.                     |
| [Announcements and onboarding](announcements-and-onboarding.md)             | Published developer messages, acknowledgements, and the first-run tour.      |
| [Public site and feedback](public-site-and-feedback.md)                     | Public routes, contact submissions, help, feedback, and roadmap.             |
| [Application shell and localization](application-shell-and-localization.md) | Route shell, navigation, locale, preferences, and PWA behavior.              |
| [Data lifecycle and storage](data-lifecycle-and-storage.md)                 | Soft deletion, recovery, ownership, private media, and retention boundaries. |

## End-user help

These guides are intended for application users rather than developers. The help catalog is available in English and Hindi ([help indexes](help/en/README.md#L1), [Hindi help index](help/hi/README.md#L1)).

- [Help Center](help/en/README.md)
- [Manage businesses](help/en/businesses.md)
- [Manage parties](help/en/parties.md)
- [Manage cheques](help/en/cheques.md)
- [Manage bank accounts](help/en/accounts.md)
- [Use the dashboard](help/en/dashboard.md)
- [Notifications](help/en/notifications.md)
- [Tags](help/en/tags.md)
- [Reports](help/en/reports.md)
- [Premium](help/en/premium.md)
- [Settings](help/en/settings.md)

## Product requirements

The numbered PRD files preserve product requirements and acceptance criteria; they are not implementation evidence. Check the current feature guide and code before treating a requirement as delivered ([PRD part 1](prd/prd-part-1.md#L1), [constitution](../constitution.md#L21-L41)).

## Naming and evidence

Use lowercase kebab-case names that describe the feature or system concern. Cite current behavior to the narrowest useful repository source, state test scope accurately, and do not claim a hosted setting from local configuration ([documentation constitution](../constitution.md#L16-L41), [naming rules](../constitution.md#L102-L126)).
