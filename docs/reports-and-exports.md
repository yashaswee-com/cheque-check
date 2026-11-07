# Reports and exports

Reports separate bounded summaries from complete-history exports. Standard report views read aggregate totals and a small preview; export workflows fetch the complete selected business history only after an authorized request ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54), [report repository](../src/features/reports/repositories/report.repository.ts#L102-L141)).

## Quick reference

- The report page preview is limited to ten recent cheques and summary totals ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)).
- Browser PDF/Excel adapters load on demand and operate on requested export data ([report repository](../src/features/reports/repositories/report.repository.ts#L102-L141)).
- CSV/JSON can use durable background export jobs with frozen snapshots and explicit row/size limits ([export migration](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).
- Downloads require authentication and current authorization, and stream private storage parts ([download route](../src/app/api/reports/exports/%5Bid%5D/download/route.ts#L8-L108)).

## Report reads

The report hook requests summary data and a bounded preview instead of downloading every cheque during page load ([report hook](../src/features/reports/hooks/use-report-cheques.ts#L9-L54)). The database analytics RPC aggregates date, direction, status, and bank data ([analytics migration](../supabase/migrations/20261102090000_cheque_analytics.sql#L1-L92)). Export scope is the business and current authorization context; statistics date controls do not silently become export bounds ([report repository](../src/features/reports/repositories/report.repository.ts#L102-L141), [export snapshot function](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).

## Export paths

PDF and Excel use browser-side adapters. Their dependencies are dynamically imported for the chosen format; final file serialization still happens in the browser ([report repository](../src/features/reports/repositories/report.repository.ts#L102-L141), [dependency declarations](../package.json#L49-L92)).

CSV and JSON can be requested as durable jobs. The database creates a snapshot, enforces an upper bound of 50,000 cheques and 50 MiB, and records the job for resumable worker processing ([snapshot and limits](../supabase/migrations/20261031040000_background_exports.sql#L57-L112), [worker checkpoint fields](../supabase/migrations/20261031040000_background_exports.sql#L140-L190)). The worker schedule is created inactive; enabling it is an operational deployment action, not an outcome proved by the migration file ([cron configuration](../supabase/migrations/20261031040000_background_exports.sql#L217-L234)).

The download route validates the authenticated owner and export status, then streams private storage content with no-store response behavior ([download route](../src/app/api/reports/exports/%5Bid%5D/download/route.ts#L8-L108), [private bucket policy](../supabase/migrations/20261031040000_background_exports.sql#L29-L55)). A saved job is not a public URL ([storage policy](../supabase/migrations/20261031040000_background_exports.sql#L29-L55)).

## Access and limits

Reports/exports use Premium authorization checks at execution and database boundaries ([Premium RPC](../supabase/migrations/20261017030000_premium_workspace.sql#L22-L38), [export authorization](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)). The ordinary report preview does not prove export eligibility; the export operation checks its own authorization ([report execution path](../src/features/reports/repositories/report.repository.ts#L102-L141), [export RPC](../supabase/migrations/20261031040000_background_exports.sql#L57-L112)).

Known resource limits include the snapshot size/row ceiling and browser memory/final serialization for client-generated files ([export limits](../supabase/migrations/20261031040000_background_exports.sql#L100-L112), [report adapters](../src/features/reports/repositories/report.repository.ts#L102-L141)). Hosted storage throughput and worker completion require environment measurements; the local PGlite benchmark does not establish them ([scaling scope](scaling-and-observability.md#benchmark-scope)).
