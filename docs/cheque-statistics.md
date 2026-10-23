# Cheque statistics

Dashboard and Reports share the same status distribution component and helpers.

- Count mode partitions each active, published cheque into exactly one of
  Issued, Received, Cleared or Bounced. Slice count totals equal the filtered
  cheque count.
- Amount mode partitions the same set by face value. The center, tooltips and
  accessible table use amounts, not count labels.
- Direction filtering (All, Outward, Inward) is independent of status.
  Dashboard's existing cheque-date range is applied before the distribution.
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
