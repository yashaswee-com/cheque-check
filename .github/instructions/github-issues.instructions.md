---
description: 'Use when gathering requirements for, creating, updating, labeling, grouping, or reviewing GitHub issues. This instruction is limited to GitHub issue operations.'
---

# GitHub issue operations

Use this instruction only for GitHub issue work. Do not treat it as general coding guidance.

## Repository and authorization

- The explicitly selected issue repository is `yashaswee-com/cheque-check` (`https://github.com/yashaswee-com/cheque-check`). Use it rather than inferring the destination from the local Git remote. If a later request names a different repository, confirm the change before writing there.
- Check the repository's existing issues, labels, milestones, and templates before creating or changing tracker data. Search for duplicates and related work first.
- Create or edit issues only when the user explicitly asks for that action. If they ask to gather requirements first, ask questions and do not create issues until they say to proceed.
- Treat GitHub writes as public to repository collaborators. Never include secrets, tokens, private customer data, raw sensitive logs, or `.env` contents. Do not expose partial secret characters; report only safe state such as configured/missing/valid/invalid when supported.
- Do not rewrite Git history, close issues, change repository settings, or perform other destructive tracker/repository actions as an assumed implementation detail. Ask for explicit approval and describe consequences first.

## Requirement gathering

Before opening a ticket, clarify enough to make it actionable. Ask concise, topic-specific questions about:

- user, audience, and affected workflow;
- observed behavior, expected behavior, and reproducible steps;
- scope, platforms, routes, account state, and frequency/impact;
- acceptance criteria, edge cases, error/retry behavior, and accessibility;
- test expectations, dependencies, rollout/migration needs, and operational constraints;
- priority, owner, milestone, and whether the issue is a bug, feature, documentation, or investigation.

Do not silently guess unresolved requirements. When the user explicitly asks to create tickets before all details are known, mark unknowns as questions/TBD and make investigation part of the acceptance criteria. Separate operator-reported observations from repository evidence and live-production facts; code or tests do not establish hosted behavior.

For broad lists, propose a small number of thematic parent issues and actionable child issues. Keep one independently verifiable outcome per child. Use GitHub sub-issues or a parent checklist with issue references when available. Do not duplicate an existing issue: reuse/link it under the appropriate parent, or ask whether the existing issue should be updated. Do not edit an existing issue's scope or body without authorization.

## Titles and issue body

- Write concise, plain-English, action-oriented titles. Normalize spelling without changing intent. Avoid vague titles such as “make better”; state the workflow and outcome.
- Use a title pattern such as `Fix <observed problem> in <workflow>` for bugs, `Add <capability> to <workflow>` for features, and `Investigate <specific unknown>` for investigations.
- Use the headings relevant to the ticket; omit headings that do not apply. Do not leave empty template sections.

```markdown
## Summary

One-sentence outcome.

## Problem / context

Who is affected and why this matters. Mark reports as user/operator-reported when not independently verified.

## Current behavior

Observed behavior and reproducible steps, if known.

## Expected behavior

Specific desired behavior, including success, failure, loading, and retry states where relevant.

## Requirements / open questions

- Confirmed requirements.
- Unresolved details explicitly marked as questions or TBD.

## Acceptance criteria

- [ ] Observable, testable outcome.

## Test plan

- Relevant unit, integration, E2E, manual, or operational verification.

## Dependencies / related issues

Link only genuinely related tracker issues (including parent/child links); do not add source-note references unless requested.
```

Keep implementation suggestions non-binding unless the user requires a particular approach. Cite code/docs only when useful and verified. Do not put unsupported production claims in issue descriptions.

## Native issue type

- Set the repository's native GitHub issue type on every issue: `Task`, `Bug`, or `Feature`. Do not rely on labels alone to represent type.
- Use `Bug` for a verified or specifically reported unexpected behavior that needs diagnosis/fix; use `Feature` for a requested user-facing capability or behavior change; use `Task` for audits, investigations, documentation, operational work, and implementation planning without a direct feature outcome.
- Keep the type dropdown on the issue form aligned with these three native types; submitted form values are triage input and must be applied to GitHub's native issue-type field.

## Labels, assignment, and milestones

- Reuse existing repository labels first; do not create near-duplicates. Existing common labels include `bug`, `enhancement`, and `documentation`; inspect the live label list before every batch.
- Approved compact area labels for this repository: `area:auth`, `area:payments`, `area:navigation`, `area:ui`, `area:notifications`, `area:privacy`, `area:security`, `area:data`, `area:operations`, and `area:performance`. Create only missing labels and give each a clear description and distinct color.
- Approved priority labels: `priority:P1`, `priority:P2`, and `priority:P3`. Use P1 for urgent security/privacy exposure, data loss, or a widespread core-workflow outage; P2 for a major user workflow that is substantially blocked; P3 for a scoped defect, feature, or ordinary follow-up. Priority reflects impact and urgency, not implementation size. If evidence is insufficient, leave it unset rather than overstate severity.
- Set the repository's native `Priority` and `Effort` issue fields for every issue. Priority options are `Urgent`, `High`, `Medium`, and `Low`; keep priority labels aligned (`P1` ↔ `Urgent`, `P2` ↔ `High`, `P3` ↔ `Medium`/`Low`). Effort options are `Low`, `Medium`, and `High`, estimated from implementation scope and uncertainty. These are planning estimates, not promises; revise them when requirements or evidence change.
- Apply existing type labels (`bug`, `enhancement`, `documentation`, or `question`) only when appropriate; do not infer `good first issue`.
- Resolve email addresses to GitHub logins for assignment; never publish the email in the issue. Verify the account mapping where ambiguous. Do not assign arbitrary owners.
- Ask before applying a milestone or project unless the user names one or has explicitly set a current default. Do not assume an existing milestone is appropriate just because it exists.

## Completed 34-note batch preferences

These choices applied to the completed 34-note batch; reconfirm them for future batches:

- Use 8 thematic parents with actionable child issues. Reuse/link existing open issues rather than creating duplicates, and do not edit their bodies without approval.
- Assign new parent and child issues to `@sde-yashaswee`, the authenticated GitHub account already assigned to existing repository issues; the user's email is for identity resolution only and must not appear in issue text.
- Apply the existing `Public Preview - Testing` milestone to the new issues.
- Use the approved area and priority labels above, plus existing type labels where suitable.
- Create issues only after the user reviews and approves the proposed issue plan. Use explicit TBDs where an approved issue still has unknown details.
- The user approved adding a selectable GitHub issue form in `.github/ISSUE_TEMPLATE/` as well as this reusable instruction.
- Set each newly created issue's native type to the best fit among the repository's configured `Task`, `Bug`, and `Feature` types.

## Parent/child planning and safe tracking

- Parents should state the shared outcome, boundaries, and completion conditions; children should be independently actionable and testable.
- Link existing issues instead of opening duplicates. If an issue already exists, preserve its number and report that it will be linked; ask before modifying it.
- Keep operational work, product behavior, documentation, and risky repository maintenance separately scoped when their owners or verification differ.
- For payment work, distinguish checkout reservation expiry from provider-order expiry and verified fulfillment. Keep payment amounts in paise in persisted/database contracts; do not assume cheque face-value units share that rule.
- For privacy/security work, describe safe observable behavior without including secrets or personal data. Incident records should protect unnecessary personal disclosure without suppressing material evidence or accountability.
- For history cleanup, create a planning issue only. Any history rewrite requires an explicit scope, collaborator impact assessment, backup/rollback plan, and separate approval before execution.

## Before reporting completion

- Verify every issue URL, title, body, label, assignee, milestone, and parent/child relationship in the target repository.
- Report created issues and their URLs, reused/linked existing issues, labels added, and any unresolved questions. Be explicit about work not done; do not claim a production setting, deployment, or runtime behavior was verified unless it was.
