# Retained data lifecycle

The forward migrations `20261021000000_lifecycle.sql` and
`20261021010000_closed_choices.sql` must precede application deployment. They do
not contact a live database or erase existing data.

## Inventory and operations

| Records                                                               | Ordinary removal                                                  | Recovery                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Business                                                              | `lifecycle_delete('businesses', id)`; one atomic descendant batch | Admin restores that batch                                              |
| Parties, accounts, cheques, including drafts                          | Same RPC with the table name                                      | Admin-only, active parents required                                    |
| Tags                                                                  | Same RPC; logically removes attachments, never the tagged objects | Restores only attachments in the selected batch                        |
| `entity_tags`                                                         | `lifecycle_set_tag(tag, type, entity, false)`                     | Explicit authorized reattachment preserves the composite identity      |
| Saved Premium tools                                                   | Existing delete RPC delegates to the lifecycle RPC                | Admin recovery with active-name conflict checks                        |
| Saved print layouts                                                   | Lifecycle RPC uses the account ID                                 | Admin recovery with an active account                                  |
| User-private banks                                                    | `delete_private_bank`; not a business descendant                  | Admin `account restore --kind bank`                                    |
| Profile                                                               | `lifecycle_deactivate()`                                          | Explicit admin profile recovery, followed by Auth unban/session policy |
| Transactions, entitlements, quotas, notification delivery/admin audit | Not ordinary user-deletable saved objects                         | Preserve historical financial/audit semantics                          |
| Push endpoints and API rate-limit counters                            | Operational registries, not saved business records                | Re-register/reset through their existing operational paths             |
| Private media                                                         | Remove/replace references, never delete the object                | Restoring an active reference restores access                          |

`deleted_at` and `deletion_batch_id` are server-controlled lifecycle metadata.
Authenticated requests cannot physically delete retained rows, alter these
fields, change tenant/identity, or update deleted rows. Restrictive RLS filters
active records and active owners/businesses even when an older permissive
policy exists. Triggers additionally validate and lock parent references for
direct writes, publication, imports and Premium operations.

Account/party removal is blocked by **every nondeleted referencing cheque**,
including drafts and Cleared history. Account removal also removes its layout
and saved tools referencing it; party removal removes saved tools referencing
that party. Business removal stamps only previously active descendants with
the new batch. Previously deleted children retain their original batch.
Queued/processing business reminders are cancelled, not revived by recovery.

Active-only unique indexes cover tag names, saved tool names and published
cheque numbers. Restore executes transactionally, parents before children.
A uniqueness or missing-parent failure rolls back the entire recovery and
returns a diagnostic; it never overwrites, renames, or revives unrelated data.
Existing pre-migration deletions without batch metadata restore only the
selected record.

## Administration and deactivation

Use the existing audited command:

```powershell
npm run ops -- account restore --kind business --id <uuid>
npm run ops -- account restore --kind cheque --id <uuid>
npm run ops -- account restore --kind tag --user <owner>
```

Supported kinds include profile, business, party, account, cheque, tag, tool,
layout and bank. Layout IDs are account IDs. Restore a deleted business/profile
before attempting a separately deleted descendant. Recovery calls a
service-role-only RPC and adds both database lifecycle and existing operator
audit records.

Deactivation first marks the profile unavailable in the database, cancelling
queued work and denying existing JWTs access through RLS and guarded resource
RPCs. The server Auth flow then bans login and revokes sessions. Provider
cleanup failures must be visible and retryable; signing out alone is not the
authorization boundary. Recovering a profile in the database is not permission
to silently remove an independent Auth ban: explicit administrator review is
required. If provider cleanup is incomplete, the user is warned after access is
blocked. An operator can safely retry the Auth ban with the audited command
`npm run ops -- account ban --user <uuid> --duration permanent`; do not lift the
ban as part of a cleanup retry. No hard-erasure or purge policy is introduced.

## Private media

Private objects are immutable uploads under the owner's path. Storage denies
ordinary UPDATE/DELETE and authorizes reads/signing only when an active owned
profile, business, party or cheque references the object. Multiple references
are supported: deleting one reference must not hide another legitimate active
reference. Replaced and deleted-only objects remain retained but cannot receive
new signed URLs. The application route checks the same database predicate
before signing. Previously issued URLs retain their short (60-second) lifetime;
they are not a permanently public URL or immediate revocation mechanism.

## Draft save feedback

Cheque, account and party creation forms, including resumed draft editors, use
the bottom-right save FAB for draft progress and completion. They do not render
an inline draft-status label beneath the navigation steppers or above the form.
Autosave, manual saves, leave confirmation and save-failure toasts are unchanged.
Business creation and published-entity editors do not use this draft indicator.

The draft leave sheet shows Save Draft only when no draft exists or user edits
remain unsaved, including edits made during an in-flight autosave. After saving,
only Discard (with its trash icon) and Keep Editing remain. Required entity
fields in create/edit forms use a small red asterisk; optional fields are unmarked.

## Default accounts

Each business can have at most one active, published default account. Selecting
another default replaces the previous selection atomically when the account is
saved or published. Autosaving a draft keeps its preference but does not change
the published default; failed saves roll back the replacement.
Restoring a deleted account that was default replaces the current default in
the same transaction.

Create/edit forms show an inline replacement notice naming the current bank
and only the last four account-number digits. Unchecking cancels the replacement.
The notice is scoped to the business, and existing defaults show a small badge
on account list and detail cards. Optimistic caches clear the old selection and
restore it on failure; successful replacement invalidates account detail caches.

Apply the forward migration
`supabase/migrations/20261101060000_published_default_accounts.sql` before deploying
the UI. It excludes draft/deleted rows from the unique default index and handles
publication and restoration transitions without rewriting older migrations.

## Atomic tagged duplication

`duplicate_cheque_draft(requested_cheque)` freshly checks Premium entitlement,
owner, active business and active account/party references. In one transaction
it copies amount, direction, notes and reminder lead days, sets the cheque date
using the profile's IANA time zone, clears cheque number/image/deposit/status,
and copies only active links to active tags. Any insertion failure rolls back
the draft and its attachments.

The create page loads these existing draft links and serializes edits back to
the same draft identity. Autosave/reload and publication retain the links.
Publication waits for pending tag persistence and derives Issued/Received from
direction, not the source's terminal status. Duplicate-link edits never change
source links; repeated detail-page activation is guarded while duplication runs.

## Closed-choice inventory

PostgreSQL enums preserve these exact stored spellings:

- Existing cheque status/direction, feature IDs, entitlement/transaction
  status and transaction type remain their existing enums.
- Profile display currency: `₹`, `$`, `€`, `£`; date format:
  `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd`; time format: `12h`, `24h`;
  language: `en`, `hi`, `hi-en`.
- Tag entity: `cheque`, `account`, `party`, `business`.
- Notification channels: `voice`, `whatsapp`, `email`, `push`, `sms`;
  job states: `pending`, `processing`, `sent`, `failed`, `skipped`, `cancelled`;
  delivery states: `success`, `failed`; purposes: `cheque_reminder`,
  `sample_voice_test`. New purposes now require a migration, replacing the
  earlier intentionally free-form TEXT contract.
- Saved tool kind: `cheque-template`, `saved-view`, `message-template`;
  lifecycle action: `delete`, `restore`, `deactivate`.
- Bank categories are defined in the separate bank-catalog migration.

Unknown stored values fail the casts and stop migration; they are never mapped
to a fallback. Audit action/target names, provider IDs, payment-product IDs,
bank references and API endpoint keys remain extensible strings/catalogs.
IANA time zones are an external evolving standard, not a frozen picker enum.
Reminder days/frequency, scores, quotas, prices and durations remain bounded
numeric quantities. JSON tool/layout payloads retain their execution-time
validators rather than encoding configurable measurements as enum labels.

The checked-in Supabase snapshot is updated without removing unrelated types;
regenerate against the migrated deployment during the normal release process.

## Validation and limitations

`src/test/lifecycle-migrations.test.ts` runs the actual schema/RLS/trigger/RPC
migrations in isolated in-memory PostgreSQL (PGlite); it excludes only network
cron scheduling. It covers unauthorized writes/deletes/recovery, draft and
Cleared dependencies, batch recovery, uniqueness rollback, active-tag copying,
Premium expiry, injected copy failure, publication, shared media references
and deactivated JWTs. Hook/service tests cover reload and serialized tag edits.
This requires no live database, secrets, Auth provider or notification sends.

PGlite's single connection does **not** prove multi-session lock/race behavior.
Before production release, run deletion-versus-child-write and
deactivation-versus-write race tests against isolated multi-session PostgreSQL.
Provider ban/revocation and already issued media URLs also require environment
verification; these tests do not claim external-provider activation.
