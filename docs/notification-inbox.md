# Notification inbox

`/notifications` is free and authenticated. The header bell counts unread events
across all active owned businesses (visual badge capped at 99+, accessible count
uncapped). The inbox supports all businesses or the selected business, All/Unread,
explicit refresh, and 50-row keyset pages. Opening the inbox does not mark read.
Clicking an event marks it read, switches to its business, and opens cheques or
export Jobs. Jobs retains its existing premium gate.

Mark all read applies only to the selected scope and the server-captured ID
snapshot. Later arrivals remain unread. Read mutations are ownership/lifecycle
checked; clients cannot insert or update operational event rows directly.
Events store kind and business, never raw provider payloads/contact details.

The existing checkpointed reminder scheduler now scans all active profiles,
not only voice-enabled profiles. Inbox reminders are one per business/local
date/chosen slot. Existing voice eligibility, quotas and idempotency are unchanged.
Outward Issued cheque reminder eligibility is unchanged. Export terminal
ready/failed transitions emit idempotent events.

History is limited to 90 days in reads and counts. The existing scheduler purges
up to 5,000 expired rows per invocation. Inbox queries refresh on focus and after
actions. The header polls every 60 seconds only while visible; no realtime sockets.

Deploy migrations `20261103000000_notification_inbox.sql` and
`20261103010000_export_inbox_events.sql` after the existing scheduler/reminder and
background-export migrations. SQL tests cover RLS, lifecycle, keyset pagination,
cutoff, idempotency, retention, and event generation. Deployment is not performed
by the local tests.
