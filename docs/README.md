# Documentation index

Documentation filenames use descriptive lowercase kebab-case:

- Name the subject directly (`data-lifecycle.md`, `notification-system.md`).
- Add a qualifier when it makes the subject clearer (`environment-configuration.md`,
  `premium-access-policy.md`).
- Avoid dates in narrative documents, generic names such as `notes.md`, and
  redundant prefixes such as `doc-`. Database migration filenames retain their
  timestamped naming convention.
- Keep each document's top-level heading aligned with its filename and update
  inbound links when a filename changes.

## Current implementation and operations

| Document                                                          | What it covers                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Application setup](application-setup.md)                         | From-scratch provider provisioning, unified resource naming, credential destinations, deployment, and acceptance checks.                                              |
| [Agentic SEO](agentic-seo.md)                                     | llms.txt, ARD discovery, accessibility, and Lighthouse agentic audit maintenance.                                                                                     |
| [Markdown articles](articles.md)                                  | Localized Markdown content, article frontmatter, routes, validation, and sitemap behavior.                                                                            |
| [Bank catalog](bank-catalog.md)                                   | RBI reference snapshot, generated seed, private bank additions, and validation.                                                                                       |
| [Cheque statistics](cheque-statistics.md)                         | Dashboard/report status partitions and date/amount semantics.                                                                                                         |
| [Data lifecycle](data-lifecycle.md)                               | Soft deletion, recovery, ownership, private media, and retained records.                                                                                              |
| [Environment configuration](environment-configuration.md)         | Deployment sequence and environment-specific Supabase setup. See also the [README environment reference](../README.md#environment) for variable purposes and sources. |
| [Monitoring and session lookup](monitoring-and-session-lookup.md) | Sentry/Clarity gates, privacy, diagnostics, exports, and operations.                                                                                                  |
| [Notification system](notification-system.md)                     | Voice reminder scheduling, delivery, capacity, and operational recovery.                                                                                              |
| [Phone OTP authentication](phone-auth.md)                         | Phone sign-in/link flows, CAPTCHA, provider setup, and external readiness.                                                                                            |
| [Premium access policy](premium-access-policy.md)                 | Entitlement rules, gated workflows, and Premium access behavior.                                                                                                      |
| [Private media migration](private-media-migration.md)             | Legacy public-media conversion and retirement procedure.                                                                                                              |
| [Shared shell and commerce](shared-shell-and-commerce.md)         | Shared navigation/pending-action behavior and payment-history labels.                                                                                                 |
| [Durable background work](durable-background-work.md)             | Shared worker lifecycle and recovery boundaries for exports, analytics, OCR, and reminder calls.                                                                      |

## Help center for end users

These guides are written for day-to-day users of the application, not developers. They focus on simple language, practical steps, and business-friendly explanations.

| Guide                                                           | What it covers                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Help Center home](help/en/README.md)                           | Current setup flow, plan limits, workflows, and guide navigation.                |
| [Manage your business](help/en/businesses.md)                   | Creating, switching, consolidating, and deleting businesses.                     |
| [Manage parties](help/en/parties.md)                            | Adding, editing, tagging, filtering, and organising payment parties.             |
| [Manage cheques](help/en/cheques.md)                            | Manual entry, statuses, duplicate checks, filters, and Premium actions.          |
| [Scan cheques and use drafts](help/en/scanning-and-drafts.md)   | AI extraction, review, credits, draft autosave, recovery, and manual fallback.   |
| [Manage bank accounts](help/en/accounts.md)                     | Bank catalog, custom banks, account details, defaults, and deletion rules.       |
| [Use the dashboard](help/en/dashboard.md)                       | Pending totals, urgency counts, statistics, quick actions, and today's work.     |
| [Reminders and notifications](help/en/notifications.md)         | Inbox, voice, push, party SMS, timing, device setup, and troubleshooting.        |
| [Use tags and labels](help/en/tags.md)                          | Shared color tags for cheques, accounts, parties, and businesses.                |
| [Review reports and exports](help/en/reports.md)                | Premium analytics, background exports, PDF details, privacy, and metric rules.   |
| [Understand Premium](help/en/premium.md)                        | Free limits, Lifetime Premium, separate credits, transactions, and referrals.    |
| [Security and settings](help/en/settings.md)                    | Profile, preferences, PIN, privacy, cookies, AI mode, installation, and tools.   |
| [Install and work offline](help/en/installation-and-offline.md) | PWA installation, push prerequisites, offline boundaries, and recovery.          |
| [Cheque bounce and legal tools](help/en/public-tools.md)        | Public timeline calculator, cheque status updates, and legal-notice limitations. |
| [Feedback and support](help/en/support-and-feedback.md)         | In-app FAQs, safe feedback attachments, roadmap, email, and WhatsApp support.    |

## Historical design records

These documents retain the scope or findings of earlier work. Their original
baseline observations and validation results are not a current status report;
use the implementation documents above and the root README for present behavior.

| Document                                                      | Record                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Code quality and SOLID review](code-quality-solid-review.md) | Static maintainability review and recommendations from its review baseline.           |
| [Issue 2 resolution plan](issue-2-resolution-plan.md)         | Original backlog requirements and implementation approach; not a current defect list. |

Product requirement documents remain in [`prd/`](prd/) and keep their numbered
part filenames to preserve their reading order.

## Documentation governance

See the [Cheque-Check Documentation Constitution](../constitution.md) for the evidence, citation, privacy, writing, review, and amendment rules that apply to project documentation.
