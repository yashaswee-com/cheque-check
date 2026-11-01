# Cheque statistics

Dashboard and Reports share the same status distribution component and helpers.

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
- New cheques default both cheque and expected deposit dates to today in the
  profile time zone (browser-local when unavailable). Resumed drafts retain
  their stored dates, including incomplete values.
- Fully cleared nonempty data shows 100% Cleared. Empty data is neutral;
  bounced-only data says No pending cheques, not All cleared.
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
