# Premium workspace

Premium workflows are integrated into the authenticated product screens:

- Cheque imports, templates, saved views, and batch status actions are in
  Cheques. Saved-view filters also update the surrounding native cheque list.
- Party imports are in Parties; statements are available on a party detail.
- Message templates are in business detail, print layouts are in account
  detail and the cheque print workflow, and consolidated reports are in
  Businesses.

`/premium` remains a compatibility route. It redirects old fragments to the
matching native screen. `/premium?partyId=<uuid>#party-statements` checks the
party against each user's owned business before selecting its detail; unknown
or foreign IDs fall back to the Parties screen without retaining the ID.
Premium panels remain behind their existing feature gates, and mutations
continue to use fresh server-side entitlement checks.

## Integration

Stable exports from `@/features/premium-workspace/services/workspace.service`:

```ts
getMessageTemplate(businessId?: string): Promise<string | null>
getPrintLayout(accountId: string): Promise<PrintLayout | null>
savePrintLayout(accountId: string, layout: PrintLayout): Promise<void>
renderMessageTemplate(body: string, values: MessageValues): string
```

`PrintLayout` is the existing cheque-print layout type. Prefer passing
`cheque.business_id` to message lookup. Without an argument it returns the latest
saved message across the owner's nondeleted businesses. Pass string values for
`party`, `cheque_number`, `amount`, `date`, `status`, and `business` to the renderer;
the template need not contain every placeholder. Replacement values are literal,
not recursively interpreted.

Every lookup performs fresh entitlement checks. Failures reject; null means no
saved record. Surface lookup errors and abort SMS rather than silently replacing
the user's chosen content. Use the default notification message only for a null
result (no saved template). Always scope SMS lookup to `cheque.business_id`;
the optional unscoped API is not used by Notify Party. For printing,
use the existing local layout only when no synced row exists, and write to sync
only on an explicit save. Stored tools remain directly owner-readable after
expiration, while execution and mutations are gated.

Templates create actual new cheques after confirmation, without requiring
changes to existing create pages. Saved views update the native Cheques list.
Batch actions use an explicit selected set and confirmation. Existing individual
cheque links/actions remain unchanged. The latest saved message per business is
the default; applying a saved template only loads the editor, and re-saving
makes it latest.

## Database

Apply `20261017030000_premium_workspace.sql` **after** the parent's enum and
`has_lifetime_premium()` migrations (`010000`, `020000`). It adds
`premium_workspace_tools`, `premium_workspace_print_layouts` and validating,
authenticated RPCs. No core table/RLS policies or AI/voice quota consumers change.
Premium saved-tool and print-layout records participate in the lifecycle
deletion policy; reads and mutations continue through the owner's authorized
RPC and row-level policies. Keep generated database types synchronized with the
forward migrations through the normal local workflow.

Imports are atomic (1–500 records), reject unknown columns and duplicates, and
check party/account ownership. Cheque imports always derive initial status from
direction. Templates cannot contain cheque numbers, dates, images or status.
Bulk status updates lock every row and preserve existing correctable-status
semantics, rejecting drafts, no-ops, foreign IDs and opposite-direction statuses.
Saved tools are validated again when applied.

Statements are cheque activity, not invoice ledgers. Period net cleared movement
starts at zero within the selected period; it is not an opening or overall party
balance. The UI and PDF label this explicitly. Consolidation uses account display
currency without currency conversion. PDF text is rendered with browser fonts
and embedded as page images so Hindi labels and names are preserved without a
remote font.

## Validation

`npx vitest run src\features\premium-workspace` covers CSV/Excel parsing, imports,
duplicates, dates, safe prefills, saved views, status transitions, statements,
PDF-export reauthorization, consolidation, message placeholders, synced print
contracts, localization parity and migration boundaries. Migration tests are
structural checks, not a substitute for applying SQL to a local PostgreSQL instance.
No remote data operations are needed to run these tests.

Local server verification also executed all three migrations in an in-memory
PGlite PostgreSQL instance using production-shaped auth, roles, enums, RLS and
core tables. The session-only `sql-validation/premium-workspace-smoke.mjs` fixture
checks access states, ownership, atomic rollback, duplicate imports, batch status
semantics, stored-tool revalidation, print bounds, expired-owner reads, RPC
privileges and unaffected free core CRUD. This is not a full production schema
replay or multi-connection concurrency test. No remote database was accessed.

An isolated production-browser fixture also checked active and trialing access at
320, 390, 430 and 1280-pixel viewport widths across all seven panels, with long
business/party/account/tool names. No document-level horizontal overflow occurred.
Paused and expired fixtures hid the workspace at all four widths. Browser
Supabase requests were fulfilled locally; the separate local app server used a
fetch preload to block backend requests and supply fixture auth. No mutation
attempts occurred, and the helper server was stopped afterwards. These fixtures
validate rendered layouts and gating, not real remote RPC integration.
