# Cheque management

Cheque workflows are business-scoped and use feature repositories, domain status rules, server-filtered pagination, and database-enforced ownership. Draft records share the entity tables with published records but are excluded from normal active cheque reads ([cheque repository](../src/features/cheques/repositories/cheque.repository.ts#L53-L168), [draft repository](../src/features/drafts/repositories/draft.repository.ts#L28-L110), [lifecycle policies](../supabase/migrations/20261021000000_lifecycle.sql#L90-L149)).

## Quick reference

- Use the cheque list page and filter state for paginated data; the SQL page RPC enforces business and filter scope ([repository page query](../src/features/cheques/repositories/cheque.repository.ts#L53-L168), [list RPC migration](../supabase/migrations/20261108000000_cheque_list_account_filter.sql#L1-L70)).
- Drafts are incomplete saved records, not published cheques; publication is an explicit status change ([draft repository](../src/features/drafts/repositories/draft.repository.ts#L28-L110), [draft schema](../supabase/migrations/20260928000000_add_drafts.sql#L1-L76)).
- Dashboard analytics use database aggregates and profile-time-zone date boundaries ([dashboard hook](../src/features/cheques/hooks/use-dashboard-cheques.ts#L10-L69), [analytics migration](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L92)).
- Lifecycle deletion is soft; account/party deletion is blocked while nondeleted cheques still reference them ([lifecycle migration](../supabase/migrations/20261021000000_lifecycle.sql#L188-L252)).

## Cheque lifecycle and data access

Cheque repositories call scoped database reads and the paged RPC, then map validated rows and related entities to domain data ([repository query and mapping](../src/features/cheques/repositories/cheque.repository.ts#L53-L168)). Status transitions are centralized in the cheque domain entity ([domain status rules](../src/domain/cheque.entity.ts#L1-L120)). Database constraints and lifecycle policies validate active owner/business relationships independently of UI filters ([lifecycle checks](../supabase/migrations/20261021000000_lifecycle.sql#L90-L149), [published cheque constraints](../supabase/migrations/20261021000000_lifecycle.sql#L300-L354)).

The cheque list uses server-side filters and stable ordering, while accounts and parties can scope the same list to their own IDs ([cheque repository](../src/features/cheques/repositories/cheque.repository.ts#L90-L168), [account repository](../src/features/accounts/repositories/account.repository.ts#L35-L96), [party repository](../src/features/parties/repositories/party.repository.ts#L27-L80)).

## Drafts

Drafts preserve incomplete values and are stored in the account, party, or cheque entity tables with the `is_draft` marker; draft repository methods list, save, delete, and publish those rows ([draft schema](../supabase/migrations/20260928000000_add_drafts.sql#L1-L76), [draft repository](../src/features/drafts/repositories/draft.repository.ts#L28-L110)). Database lifecycle rules exclude drafts from published cheque semantics ([lifecycle draft guards](../supabase/migrations/20261021000000_lifecycle.sql#L300-L354)).

When a user uploads a cheque image on the create form, the application saves its reference in a new or existing draft before starting optical character recognition (OCR). If the draft cannot be saved, it restores the previous form image and does not start OCR; a user-visible error is shown ([upload handler](../src/features/cheques/hooks/use-create-cheque.ts#L247-L286), [pending scan](../src/features/cheques/hooks/use-ocr-extraction.ts#L215-L225)). The existing private-media policy still requires an active record reference ([storage policy](../supabase/migrations/20261021000000_lifecycle.sql#L419-L443)).

## AI Scan Mode

The AI scanner section on Features has a per-user AI Scan Mode switch. The saved profile preference syncs across devices through the existing profile reads (including refetch on window focus); it is not an instantaneous cross-device broadcast. Existing and new profiles default to enabled. Users may always disable scanning; re-enabling requires available, unexpired AI scan credits, enforced by the database as well as the UI.

When disabled, camera/image uploads and draft persistence continue normally, while new AI scans are rejected before rate-limit, quota, or provider work. Existing form values are preserved for manual entry. Already-started provider calls may finish, but further attempts recheck the preference. Profile lookup failures fail closed, and preference-save failures show an error without changing the saved switch.

Apply [the AI Scan Mode migration](../supabase/migrations/20261111010000_ai_scan_mode.sql) before deploying the application change; the API requires the new profile column. No hosted migration or QA deployment is performed by a local code commit.

The scanner now uses durable jobs, credit reservations, versioned AI disclosure, field review, and server-side entity matching. Apply the additional durable OCR migration and deploy/configure its Edge worker before enabling scanning. See [AI cheque scanning](ai-cheque-scanning.md) for user behavior, billing rules, the seven-second deadline, production gates, and recovery instructions. The old synchronous consume-before-provider route is no longer available.

## Dashboard statistics

Dashboard totals use a summary RPC and a bounded today-cheque page; status analytics are computed by SQL aggregates instead of downloading all records ([dashboard hook](../src/features/cheques/hooks/use-dashboard-cheques.ts#L10-L69), [analytics RPC](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L92)). The statistics implementation partitions eligible records into statuses and calculates clearance rate ([statistics helper](../src/features/cheques/lib/statistics.ts#L1-L58), [analytics SQL](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L92)).

## Related features

- [Bank catalog](bank-catalog.md) documents shared reference rows and private user banks ([bank migration](../supabase/migrations/20261021030000_bank_catalog.sql#L1-L65)).
- [Reports and exports](reports-and-exports.md) explains business-level totals and full-history report paths ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)).
- [Data lifecycle and storage](data-lifecycle-and-storage.md) describes soft deletion, recovery, and media authorization ([lifecycle migration](../supabase/migrations/20261021000000_lifecycle.sql#L188-L280)).
