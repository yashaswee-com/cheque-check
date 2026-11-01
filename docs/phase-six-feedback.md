# Feedback, roadmap, and help

The signed-in Help & Support page contains searchable FAQs in the Getting
started, Cheques/scanning, Plans/payments, Notifications, and Privacy/security
categories. Each answer can branch to related questions; every answer includes
a Report issue route, while the existing WhatsApp support link remains
available.

Feedback at `/feedback` accepts a category, title, and description only; file
attachments are not accepted. Bug
reports and other feedback are visible only to their submitter and operators.
Feature requests are also private until an operator publishes them to the
signed-in `/roadmap`. Roadmap votes are unique per user and request. The
database accepts at most five successful submissions per user in each
one-hour rate-limit window.

Apply `supabase/migrations/20261106020000_feedback_roadmap.sql`. The migration
adds row-level security, private-owner reads, published-feature-only roadmap
reads and votes, a vote counter, bounded keyset page functions, and an
audited, service-role-only admin update function. App pages request at most 25
rows at a time (the repository caps requests at 50).

Operators can inspect recent submissions and update their status/publication
through the existing CLI:

```powershell
npm run ops -- ops feedback-list --env qa --limit 50
npm run ops -- ops feedback-update --env qa --id <uuid> --status planned --publish --reason "Accepted for roadmap"
```

Supported statuses are `under_review`, `planned`, `in_progress`, `shipped`,
and `declined`. Mutations use the CLI's existing environment and production
confirmation guards; each update and its admin-audit entry commit atomically.
Only feature requests can be published.

The local-only `runFeedbackScaling({ users = 10_000, iterations = 30 })`
helper seeds a migrated PGlite database and measures the bounded roadmap page
with matching vote volume; it makes no provider calls:

```powershell
npx tsx -e "import { runFeedbackScaling } from './scripts/lib/feedback-scaling.ts'; runFeedbackScaling().then(console.log)"
```

FAQ and feedback strings are maintained in all three catalogs:
`messages/en.json`, `messages/hi.json`, and `messages/hi-en.json`.
