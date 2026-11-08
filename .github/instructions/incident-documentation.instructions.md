---
description: Record production or operational incidents as feature-classified reports, preserving timelines, impact, response, evidence boundaries, and tracking references.
applyTo: 'incidents/**/*.md'
---

# Incident documentation

- Read and follow `constitution.md` before adding or editing an incident record. Cite repository claims to the narrowest current code, test, migration, configuration, or operational source. Update `incidents/README.md` and the relevant index in `docs/README.md` when adding a report.
- Classify each report under the affected feature (for example, `incidents/authentication/`). Use a descriptive lowercase kebab-case filename with the incident date.
- Before writing, collect and confirm: incident date; start and detection times; time zone; priority/severity and who assigned it; affected functionality and user scope/count; symptoms; root cause and how it was established; actions taken and actor; current status; resolution time and duration; follow-up actions/owner; incident or ticket ID; and Sentry issue/reference.
- If a material detail is missing or ambiguous, ask the user a concise follow-up question. Do not silently omit it or infer a value. If it cannot be obtained, write `N/A` (or `unknown`) and explain why, including whether the gap is due to unavailable logs, no tracking record, or an unassigned owner.
- Mark facts supplied by an operator as **operator-reported**. Keep those separate from code/config evidence and independently observed production results. A repository setting or test does not prove a live deployment or incident symptom. For estimates, state the source, scope, and what the figure does not measure.
- Include a short timeline, impact, root cause, response, resolution state/time, tracking references, and an evidence-boundary section. Distinguish incident start from detection where known; state duration only when the timestamps and time zone support it.
- Record absent references explicitly: `Incident/ticket ID: N/A — no ID was assigned` and `Sentry issue: N/A — no issue was created` (or the specific reason reported). Do not invent IDs or infer that an event was captured by Sentry.
- Do not include secrets, access tokens, raw logs, or customer-identifying data. Prefer aggregate counts; omit or generalize an aggregate if it could identify a person, and explain the privacy limitation.
- Use absolute dates and an explicit time zone. Add an “as of” date for mutable status, then verify every citation, index link, command, and line reference after editing.
