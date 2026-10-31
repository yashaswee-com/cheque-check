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
