# Cheque statistics

Dashboard and Reports share the same status distribution component and helpers.

Phase 2 also adds SQL-aggregated analytics (no full cheque downloads):

- Shared statistics date controls default to Last 30 days. Reports exports
  remain scoped to the whole business, independently of statistics dates.
- Cheques over time compares Outward/Inward count or face value by cheque
  date. Missing buckets are zero-filled: daily up to 31 inclusive days,
  weekly up to 90, monthly beyond. Date ranges longer than 10 calendar years
  are explicitly rejected, including All time when its data spans longer.
- Analytics direction applies to its chart, dashboard summary and bank rows;
  the existing distribution retains its own direction control. Disabled
  inward visibility is honored in server requests and chart controls.
- Dashboard summary displays Pending/Cleared value and count, plus Overdue
  and Due Today, separately for payables/receivables. Due metrics use expected
  deposit date in the profile timezone and pending statuses only.
- By-bank metrics use the account bank (including custom/Unknown banks),
  ordered by descending pending value and paginated at 50 banks. Summary
  totals do not shrink to the page. Bank links retain date/direction filters.
- Aggregate caches are invalidated after cheque/account/business mutations
  and custom-bank changes.

Reports links to `/reports/jobs`, a premium-gated, current-business export
history with server-side status/format filtering and 50-row pagination. Only
ready exports are downloadable; queued jobs can be cancelled; failed jobs
can request a new export using the current inward preference. Notification
jobs and provider payloads are not exposed. Queries poll only queued/processing
jobs while the document is visible; completed histories refresh on focus or
manual refresh instead of idle polling.

Deployment requires the extended-filters, report-jobs business index and
cheque-analytics migrations (`20261102070000` through `20261102090000`) after
their existing Phase 1 dependencies.

- Count mode partitions each active, published cheque into exactly one of
  Issued, Received, Cleared or Bounced. Slice count totals equal the filtered
  cheque count.
- Amount mode partitions the same set by face value. The center, tooltips and
  accessible table use amounts, not count labels.
- Direction filtering (All, Outward, Inward) is independent of status.
  Dashboard's existing cheque-date range is applied before the distribution.
- Dashboard date presets and the selected custom dates share one horizontally
  scrollable row. The unwrapped date pill follows Custom range.
  Measure and Direction stay mounted across range changes; only the graph
  shows a loading state (or an explicit fetch error), preserving both selections.
- Today, Upcoming and Overdue counts are centered immediately below the balance
  card, followed by quick-action buttons with overflow arrows.
- The blue balance card has no decorative document icon.
- Cheque detail party/account rows link to their respective detail pages. The
  cheque date links to `/cheques?date=YYYY-MM-DD`, applying inclusive matching
  cheque-date bounds in the paginated server query. The list shows a clearable
  date-filter label; invalid dates show an error without fetching an unfiltered
  list. Reloads and client-side date-link navigation retain the selected day.
- New cheques default both cheque and expected deposit dates to today in the
  profile time zone (browser-local when unavailable). Resumed drafts retain
  their stored dates, including incomplete values.
- Create and edit expected deposit dates offer Today, +7, +14, +30, +60,
  +90 days and current End of Month shortcuts. Offsets use today's profile
  calendar date, not the cheque date; clicking a shortcut participates in draft
  autosave. Merely opening a draft does not change its date.
- Shared filter pill rows show keyboard-accessible scroll chevrons only when
  content overflows in that direction and respect reduced-motion preferences.
  Dashboard quick-action scrollbars are hidden without disabling scrolling.
- Cheques supports independent inclusive cheque-date and expected-deposit-date
  ranges, open bounds, inclusive decimal amount limits, multi-status selection,
  one party type (including Unclassified), and multiple account banks.
  Pending selects Issued/Received; Returned labels Bounced without changing
  the stored lifecycle. Filters are ANDed in the RLS-protected paginated RPC.
  URL parameters retain filters/search/sort on reload; invalid inputs show an
  error rather than fetching unfiltered data. Clear filters preserves sorting.
- Existing cheque/entity sort-and-filter lists distinguish loading, errors,
  empty records and no matches with entity-specific titles. Clear filters
  resets search/filter selections but preserves sorting on detail lists too.
- Fully cleared nonempty data shows 100% Cleared. Empty data is neutral;
  bounced-only data says No pending cheques, not All cleared.
- Dashboard and Reports show clearance rate: cleared count divided by all
  active published cheques in the selected range/direction, irrespective of
  the distribution's count/amount display mode. Empty data shows No cheques.
- Issued and Received are pending. Bounced and Cleared do not contribute to
  payable, receivable, upcoming or overdue values.
- Net pending cheques is pending receivables minus pending payables; it is
  explicitly not the user's bank cash balance.
- Today/upcoming/overdue comparisons use the profile time zone when available,
  with browser-local dates otherwise, not UTC date truncation.
- Draft and soft-deleted rows are excluded defensively even if supplied by a
  caller. Database lifecycle rules also exclude them from normal reads.

Core unit tests cover exact count/amount totals, direction, draft/deleted
exclusion, cleared/bounced/empty states and local-midnight boundaries.
