# Private media migration

New uploads use owner-scoped private buckets. Existing URLs in the legacy public
`avatars` and `cheque-images` buckets continue to work until they are migrated.

## Prerequisites

1. Back up the database and both public storage buckets.
2. Apply `20260924030000_add_private_media_buckets.sql`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
   `.env.local` for the target environment.
4. Stop application writes or schedule a maintenance window.

## Dry run

```bash
npm run storage:migrate
```

The dry run lists recognized profile, business, party, and cheque records. It
does not download, upload, update, or delete data.

## Copy and update

```bash
npm run storage:migrate -- --apply
```

This copies each recognized object into an owner-scoped private path and updates
the database URL with a compare-and-set condition. Legacy source objects remain
public so the migration can be verified before cleanup.

## Copy, update, and remove sources

After validating the dry run in staging, copy records and remove each legacy
source after its database URL has been updated:

```bash
npm run storage:migrate -- --apply --delete-source
```

Do not run `--delete-source` without verified backups. If copy-only mode was
already used, remove only verified, unreferenced legacy objects through the
Supabase storage inventory.

The deployed legacy buckets have already been removed. Clean database resets no
longer create those buckets or their public policies; the historical schema
migrations still add the required image and avatar columns. The obsolete legacy
bucket retirement migration has been removed.

If another existing environment still has legacy buckets, verify migration and
backups before removing the empty buckets through the Supabase Storage API or
dashboard and retiring their old policies. Editing historical migrations does not
change already-applied environments.

The supported media buckets are `private-avatars` and `private-cheque-images`.
Report downloads use the separate private `report-exports` bucket. Its migration
reuses a bucket retained across QA resets, enforces `public = false`, and preserves
existing objects rather than deleting or recreating the bucket.

## Verification

- Open profile, business, party, and cheque images as their owning user.
- Confirm another authenticated user receives `403` for copied URLs.
- Run an OCR scan against a migrated cheque image.
- Confirm database media fields begin with `/api/storage/`.
- Review script failures before deleting either legacy bucket.

Buckets and storage policies are created entirely by migrations; no manual SQL-editor step is required. See [environment configuration](environment-configuration.md) for the deployment sequence.
