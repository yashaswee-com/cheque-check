# Cheque-Check Documentation Constitution

**Edition:** 1.0  
**Recorded:** 7 November 2026  
**Purpose:** Set binding rules for writing, reviewing, and maintaining Cheque-Check documentation.

This constitution applies to every new or changed project document, including the root README, documents under `docs/`, operational guides, examples, and technical references. It does not replace project code, tests, security controls, or release approval.

## Preamble: evidence before assertion

Documentation describes what repository evidence supports. Authors inspect the relevant code, tests, configuration, migrations, workflows, and current documentation before writing a factual claim. Authors do not present memory, assumption, product intent, or confidence as proof.

The repository already states that documentation naming is descriptive and uses lowercase kebab-case, and that historical design records are not current status reports. This constitution adopts that distinction as a project-wide rule.

> **Project evidence — documentation conventions:** “Keep each document's top-level heading aligned with its filename and update inbound links when a filename changes.” The documentation index also says historical observations “are not a current status report.” ([docs/README.md](docs/README.md#L3-L12), [docs/README.md](docs/README.md#L48-L52))

## Article I — Claims require evidence

1. Every factual statement about current behavior, architecture, security, configuration, data, operations, test results, or performance includes a citation to the source that supports it.
2. Cite the narrowest useful source and line range. Use workspace-relative Markdown links. Recheck line links after editing the cited file.
3. Prefer evidence in this order for implementation claims:
   - Executable code, database migrations, and configuration show what is implemented or configured.
   - Tests show the behavior those tests exercise, within their stated setup and limits.
   - CI workflows show which checks are configured to run, not whether a particular run passed.
   - Current documentation explains the system and points to implementation evidence.
   - Historical plans, reviews, and issue records explain their original scope only. They do not prove current behavior.
4. A source supports only what it directly shows. A test does not prove behavior outside its inputs, environment, or assertions. A setting does not prove that a provider is enabled in a live deployment. A CI step does not prove a successful run.
5. For important or surprising claims, include a short exact quotation or a small code excerpt with its citation. Keep quotations short and faithful. Do not silently change a quote's meaning.
6. If the evidence is missing, conflicting, stale, or cannot establish the claim, state the specific gap and do not state the claim as fact. Never fill a gap with a guess.

> **Project evidence — architectural limit:** “These checks prevent common layer bypasses, not arbitrary semantic duplication.” The README identifies the limit of its checks rather than claiming they prove more than they do. ([README.md](README.md#L321-L327))

## Article II — Distinguish implementation, intent, and observation

1. Label requirements and proposals as requirements or proposals. Do not describe them as implemented until code or deployment evidence confirms implementation.
2. Label test findings as test findings. State the test environment and important limits next to the result.
3. Label repository configuration as configured behavior, not observed production behavior.
4. Give time-sensitive claims an “as of” date and identify the source or environment checked.
5. Separate facts from interpretation. Cite facts first, then label any conclusion and show how the facts support it.

> **Project evidence — test limitation:** “PGlite's single connection does not prove multi-session lock/race behavior.” The lifecycle documentation names a specific limit instead of treating passing single-connection tests as proof of concurrent production behavior. ([docs/data-lifecycle.md](docs/data-lifecycle.md#L158-L172))

## Article III — Protect secrets and people

1. Never publish passwords, API keys, access tokens, private keys, session cookies, recovery codes, connection strings, secret environment values, or other credentials.
2. Never publish identifiable user or customer details. This includes email addresses, phone numbers, names, account or cheque data, business details, PINs, addresses, private files, and identifiers that can be joined to a person or account.
3. Redact sensitive values before quoting, summarizing, screenshotting, logging, or adding examples. Use labels such as `[REDACTED_SECRET]`, `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, or `[GENERIC_ID]`. Do not retain a revealing prefix, suffix, hash, or nearby context that makes the value identifiable.
4. Examples use invented, generic values only. Mark examples as illustrative. Never copy real data from fixtures, logs, screenshots, support tickets, environment files, or test output into documentation.
5. A security test may use sensitive-looking sample data. Quote only the test's relevant assertion or description; do not reproduce the sample values.
6. If a source contains a secret or personal data, do not repeat it in the document. Redact the value and cite the source only when the citation itself does not expose it. Otherwise describe the evidence without the value and use the project's documented private reporting route, if one exists.

> **Project evidence — privacy behavior and test scope:** The monitoring guide says request bodies, raw exception messages, and arbitrary logger extras are excluded. A privacy test is named “never includes raw request data, arbitrary context or exception messages.” These are documented and tested telemetry rules; they do not authorize copying sensitive values into documentation. ([docs/monitoring-and-session-lookup.md](docs/monitoring-and-session-lookup.md#L66-L74), [src/lib/monitoring/monitoring.test.ts](src/lib/monitoring/monitoring.test.ts#L16-L18))

> **Code evidence — route sanitization:** `if (pathname.startsWith('/api/storage/')) return '/api/storage/[private]'`. ([src/lib/monitoring/privacy.ts](src/lib/monitoring/privacy.ts#L34))

## Article IV — Write direct, certain, simple English

1. Use short sentences, familiar words, active voice, and present tense for current behavior.
2. Use exact conditions. Replace vague claims with a concrete scope, trigger, actor, environment, or limit.
3. Do not use uncertainty language to cover missing evidence. When behavior is unknown, name what remains unverified.
4. Avoid ambiguous terms such as “safe,” “secure,” “fast,” “complete,” or “supported” unless the document defines the measure and cites evidence.
5. Explain acronyms on first use. Define project-specific terms before relying on them.
6. Keep required actions explicit: name the actor, action, prerequisite, outcome, and failure path when those details apply.

## Article V — Serve readers in a hurry and readers who need detail

A technical document includes both a short path and a complete path when its subject needs explanation:

1. Start with a brief summary of the purpose and the main outcome.
2. Add a quick-reference section for urgent use. Include the essential decision, command, checklist, or next step. Do not omit a safety warning from this section.
3. Provide the full explanation after the summary: context, exact behavior, prerequisites, steps or data flow, edge cases, failure modes, security boundaries, validation, and limitations as relevant.
4. Include minimal, runnable snippets when they clarify a technical task. Explain prerequisites and expected output. Redact credentials and use generic example data.
5. Link to deeper references rather than repeating long sections. A short summary never replaces necessary technical detail.

## Article VI — Numbers and metrics must be reproducible

1. Attach a unit and a defined scope to each metric. State the population, time window, environment, and measurement method when they apply.
2. Cite the implementation, query, test, report, or command that produces the number. For a changing measurement, include the date and exact command or query.
3. Distinguish a configured limit from an observed measurement, a test count from a passing-test result, and a benchmark from production performance.
4. Do not use false precision, an unexplained percentage, or a total without a denominator. Do not claim a trend without comparable measurements over a stated period.
5. A repository claim can be stated narrowly. For example, the README documents a cheque list page size of 50 rows and a global search limit of five matches. That citation supports the documented limits; it does not prove response time or production usage. ([README.md](README.md#L195-L201))

## Article VII — Explain examples and snippets safely

1. Use examples that answer one clear question and match the cited implementation.
2. Label illustrative data and avoid examples that resemble a real person's account, cheque, business, or authentication detail.
3. Keep snippets minimal and syntactically valid where the document presents them as runnable. State the file, command, runtime, or setup they require.
4. Identify destructive actions, production impact, irreversible effects, and required access before the reader reaches the command or snippet.
5. Do not present pseudocode as production code. Label pseudocode and describe what is omitted.

## Article VIII — State boundaries and limitations

1. Document relevant trust boundaries, authorization checks, data ownership, retention, deletion, external services, and failure behavior.
2. Say what a control or test does not cover when that limit affects the reader's decision.
3. Do not turn a security mechanism into a guarantee. Name the threat or operation the mechanism addresses and cite the implementation and test evidence.
4. When a procedure depends on a provider, deployment, or environment, state which part is verified in the repository and which part requires an environment check.

## Article IX — Keep documents current and navigable

1. Use descriptive lowercase kebab-case names, a heading that matches the filename, and maintained inbound links, in line with the documentation index. ([docs/README.md](docs/README.md#L3-L12))
2. Update the relevant index when adding or renaming a document.
3. Separate current implementation guidance from historical records. Give historical documents a clear date or baseline and link to current implementation guidance when available.
4. Check commands, paths, line links, configuration names, and code snippets against the current repository before publishing.
5. Do not duplicate a changing fact in several documents. Choose a canonical source and link to it.

## Article X — Review and verification

Before publishing a new or changed technical document, the author checks:

- Each factual claim has a working citation to direct evidence.
- Direct quotations match their source and include a useful citation.
- Test, CI, provider, and production claims use the correct scope and do not overstate results.
- Metrics include units, scope, source, and date or measurement method as required.
- Examples, screenshots, and snippets contain no secrets or personal data.
- Safety warnings appear before risky steps.
- The quick summary and full explanation agree.
- Links, commands, and code snippets match the current repository.
- Historical documents are not presented as current status.

A review records checks that were run and their results. Do not claim a check passed unless it ran and passed.

## Article XI — Amendments and version history

1. Amendments are recorded in the ledger below in the same change that updates this constitution.
2. Each amendment records its version, date, affected articles, change, reason, and evidence or request that supports it.
3. Do not erase or rewrite an earlier ledger entry. Add a new entry that explains the change.
4. Use a major version for a change that reverses or replaces a core rule, a minor version for a new or materially expanded rule, and a patch version for a clarification that does not change the rule.
5. Update the edition at the top of this document whenever an amendment changes its rules.

### Amendment ledger

- **1.0 — 7 November 2026**
  - **Articles:** Initial edition (Articles I–XI).
  - **Change:** Establishes the rules in this constitution.
  - **Basis:** Created in response to the documentation constitution request; repository evidence is cited in this edition.

## Quick checklist

Before publishing, answer **yes** to each item:

- Can a reader trace every factual claim to current, direct evidence?
- Does each number state what it measures and where it comes from?
- Are test and configuration claims limited to what they prove?
- Are secrets and personal details absent or fully redacted?
- Can a reader in a hurry find the main answer and safe next step?
- Can a technical reader follow the full explanation, caveats, and validation path?
- Does the amendment ledger record any change to this constitution?
