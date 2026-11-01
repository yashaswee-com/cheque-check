# Indian bank catalog

The selector includes the shared, dated RBI reference catalog and banks privately
added by the signed-in user. Private banks are reusable across that user's
businesses; they are never published to other users.

## Reference coverage

Retrieved on 2026-10-21:

| Category                        |   Entries | Source date                                             |
| ------------------------------- | --------: | ------------------------------------------------------- |
| Public sector                   |        12 | RBI page retrieved 2026-10-21 (site updated 2026-10-20) |
| Domestic private sector         |        21 | Same commercial-bank page                               |
| Small finance                   |        11 | Same commercial-bank page                               |
| Regional rural                  |        28 | Same commercial-bank page                               |
| Foreign banks in India          |        44 | Same commercial-bank page                               |
| Scheduled urban cooperative     |        55 | 2026-06-30                                              |
| Non-scheduled urban cooperative |     1,377 | 2026-06-30                                              |
| Scheduled state cooperative     |        26 | PDF updated 2026-05-13                                  |
| Non-scheduled state cooperative |         8 | PDF updated 2026-05-13                                  |
| District central cooperative    |       352 | PDF updated 2026-05-13                                  |
| **Total**                       | **1,934** |                                                         |

Sources:

- [RBI scheduled commercial banks](https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=3657)
- [RBI scheduled urban cooperative banks](https://rbidocs.rbi.org.in/rdocs/Content/pdfs/schedulecoop.pdf)
- [RBI non-scheduled urban cooperative banks](https://rbidocs.rbi.org.in/rdocs/Content/pdfs/nonschedulecoop.pdf)
- [RBI scheduled state cooperative banks](https://rbidocs.rbi.org.in/rdocs/Content/pdfs/SCCB20141702.pdf)
- [RBI non-scheduled state cooperative banks](https://rbidocs.rbi.org.in/rdocs/Content/pdfs/NSCB20141402.pdf)
- [RBI district central cooperative banks](https://rbidocs.rbi.org.in/rdocs/Content/pdfs/DCCB20141702.pdf)

The PDF filenames containing 2014 are stable RBI publication URLs, not the
current document dates. Their downloaded metadata and content were inspected.
Urban lists were checked for consecutive serial numbers; state and district
counts were checked against publication totals.

Payments banks are deliberately excluded from the cheque-account catalog.
Inclusion records RBI list membership, not a guarantee that a particular
institution, branch or account product currently issues/accepts cheques.
Lists are snapshots, not a real-time licensing service. For missing or renamed
institutions, use Other / Add bank; never guess an IFSC or silently substitute
another bank.

## Reproducible seed

[The reference snapshot](../supabase/reference/banks.json) records names,
categories, source URLs, source dates and retrieval date. The generated
[seed migration](../supabase/migrations/20261021030100_seed_bank_catalog.sql)
defines `seed_reference_banks()`. Both the migration and database reset
[seed](../supabase/seed.sql) call that function, so no manual storage/catalog SQL
or duplicated 13-bank list is required.

After reviewing an updated source snapshot:

```powershell
node scripts\generate-bank-seed.mjs --check
```

The existing generated migration must remain immutable after deployment. For
future catalog updates, add a newly timestamped forward migration, update the
generator's destination to that migration, then regenerate it. Before its first
deployment only, `node scripts\generate-bank-seed.mjs` regenerates the current
seed.

Existing IDs and familiar short labels (for example HDFC Bank) are preserved.
Comparison ignores punctuation, case and a trailing Limited/Ltd suffix, so
seeding the corresponding official name does not create a duplicate or change
account references. Historical bank IDs are never deleted or reassigned by
seeding.

## Private additions and lifecycle

- Name is required (2-120 characters, at least one letter, no control characters).
- Existing shared/owned names are detected before creation and in PostgreSQL.
- RLS isolates user-private rows. Accounts cannot reference another user's
  private bank, even through a direct database request.
- Deletion is soft and blocked while any nondeleted account or account draft
  refers to the bank. User deletion cannot physically delete or restore a bank.
- A deleted private name can be reused. Administrative recovery must resolve
  any resulting active-name collision explicitly.
- Optional IFSC belongs to an account; it is normalized and format-checked.
  Format validation is not a bank/branch existence lookup.
- Catalog fetching is paginated, rather than truncated at Supabase's default
  row limit. The selector reserves a fixed avatar footprint and anchor width.
- Bank, party and account selectors render at most 50 options at once, with
  keyboard-accessible previous/next controls. Search uses the existing fuzzy
  matching across the entire fetched catalog, not just the visible page.
  Search changes and dismissal reset pagination. Bank queries are cached for
  five minutes; private-bank mutations still invalidate the cache immediately.
  This is client-side render pagination; the full catalog remains available for
  selected labels, duplicate checks and OCR matching.

## Validation

Bank service, source counts, alias identity, seed synchronization, and real
isolated PostgreSQL tests cover seeding twice, ownership, cross-owner references,
draft dependencies, soft deletion and deactivated-user access:

```powershell
npx vitest run src\features\accounts
```
