# Reports and exports

Reports separate bounded summaries from complete-history exports. Standard report views read aggregate totals and a small preview; export workflows fetch the complete selected business history only after an authorized request ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54), [report repository](../src/features/reports/repositories/report.repository.ts)).

## Quick reference

- The report page preview is limited to ten recent cheques and summary totals ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)).
- Browser PDF/Excel adapters load on demand and operate on requested export data ([report repository](../src/features/reports/repositories/report.repository.ts)).
- The PDF is an owner-focused Business Cheque Overview, not a row-only data dump. CSV, JSON, Excel, and the separate party-statement PDF retain their existing formats.
- CSV/JSON can use durable background export jobs with frozen snapshots and explicit row/size limits ([export migration](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).
- Downloads require authentication and current authorization, and stream private storage parts ([download route](../src/app/api/reports/exports/%5Bid%5D/download/route.ts#L8-L108)).

## Report reads

The report hook requests summary data and a bounded preview instead of downloading every cheque during page load ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)). The database analytics RPC aggregates date, direction, status, and bank data ([analytics migration](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L92)). Export scope is the business and current authorization context; statistics date controls do not silently become export bounds ([report repository](../src/features/reports/repositories/report.repository.ts), [export snapshot function](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).

## Export paths

PDF and Excel use browser-side adapters. Their dependencies are dynamically imported for the chosen format; final file serialization still happens in the browser ([report repository](../src/features/reports/repositories/report.repository.ts), [dependency declarations](../package.json#L49-L92)).

### Business Cheque Overview PDF

Choose **Export > PDF business overview** on Reports. The A4 portrait report covers the active business's entire exportable history, independently of the statistics date filter. It follows the app's language (English, Hindi, or Hinglish), currency display, date format, and timezone. Existing received-cheque visibility settings are preserved; an outward-only report explicitly identifies that scope.

The [overview renderer](../src/features/reports/lib/business-overview-pdf.ts) produces:

- Business name, preparation timestamp, cheque-date coverage, and record count.
- Pending receivables/payables, cleared inward/outward amounts, and net pending exposure.
- Overdue, due-today, next-7-day, next-30-day, and separately identified bounced exposure.
- Deterministic follow-ups, the five largest pending parties per direction, and a bank-name breakdown.
- Six monthly activity buckets and a comparison of the last two completed calendar months.
- A complete cheque register with repeated column headers, wrapped cells, and page numbers; exceptionally long cells continue across pages.

The [metrics model](../src/features/reports/lib/business-overview.ts) sums amounts in integer hundredths of the display currency before formatting. Pending means `Issued` or `Received`; bounced and cleared amounts do not enter pending totals. Overdue means a pending cheque date before the user's local today. Future windows exclude today; the 30-day window includes the 7-day window.

Monthly figures use **cheque dates and all current recorded statuses**, not settlement dates or historical status snapshots. Future-dated cheques remain in the all-history totals. Comparisons are unavailable when recorded dates do not extend to the start of the earlier month or the earlier direction's amount is zero. These figures are not bank balances, verified debts, or cash-flow forecasts; no currency conversion or AI-generated financial advice is provided.

For sharing, the PDF includes party names, cheque numbers, bank names, and amounts, but excludes account names/numbers, contact details, and internal notes. It is still a private business document, not an anonymized report. Browser-font raster rendering preserves translated labels, names, and currency glyphs without fetching remote fonts; PDF text is image-based rather than selectable/searchable.

The [metrics tests](../src/features/reports/lib/business-overview.test.ts) cover status separation, monetary precision, timezone/date boundaries, grouping, and comparison availability. The [renderer tests](../src/features/reports/lib/business-overview-pdf.test.ts) cover localization, privacy exclusions, oversized cells, and complete pagination of 1,001 cheques. Browser generation still consumes memory proportional to the resulting document; the background CSV/JSON job limits do not imply a supported PDF size ceiling.

CSV and JSON can be requested as durable jobs. The database creates a snapshot, enforces an upper bound of 50,000 cheques and 50 MiB, and records the job for resumable worker processing ([snapshot and limits](../supabase/migrations/20261031040000_background_exports.sql#L57-L112), [worker checkpoint fields](../supabase/migrations/20261031040000_background_exports.sql#L140-L190)). The worker schedule is created inactive; enabling it is an operational deployment action, not an outcome proved by the migration file ([cron configuration](../supabase/migrations/20261031040000_background_exports.sql#L217-L234)).

The download route validates the authenticated owner and export status, then streams private storage content with no-store response behavior ([download route](../src/app/api/reports/exports/%5Bid%5D/download/route.ts#L8-L108), [private bucket policy](../supabase/migrations/20261031040000_background_exports.sql#L29-L55)). A saved job is not a public URL ([storage policy](../supabase/migrations/20261031040000_background_exports.sql#L29-L55)).

## Access and limits

Reports/exports use Premium authorization checks at execution and database boundaries ([Premium RPC](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38), [export authorization](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)). The ordinary report preview does not prove export eligibility; the export operation checks its own authorization ([report execution path](<../src/app/(dashboard)/reports/page.tsx>), [export RPC](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).

Known resource limits include the snapshot size/row ceiling and browser memory/final serialization for client-generated files ([export limits](../supabase/migrations/20261031040000_background_exports.sql#L100-L112), [report adapters](../src/features/reports/repositories/report.repository.ts)). Hosted storage throughput and worker completion require environment measurements; the local PGlite benchmark does not establish them ([scaling scope](scaling-and-observability.md#benchmark-scope)).
