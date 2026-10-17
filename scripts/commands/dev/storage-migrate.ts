import type { SupabaseClient } from '@supabase/supabase-js'
import { TABLES } from '../../../src/lib/supabase/tables'
import {
  buildPrivateMediaUrl,
  PRIVATE_AVATAR_BUCKET,
  PRIVATE_CHEQUE_BUCKET,
  type PrivateMediaBucket,
  validateImageFile,
} from '../../../src/lib/storage'
import { defineAction } from '../../lib/action'
import { confirmMutation } from '../../lib/guards'
import { toOpsError, UsageError } from '../../lib/errors'

type SourceBucket = 'avatars' | 'cheque-images'
const AVATAR_MAX = 5 * 1024 * 1024
const CHEQUE_MAX = 10 * 1024 * 1024
const PAGE_SIZE = 1000

export interface MigrationItem {
  table:
    | typeof TABLES.PROFILES
    | typeof TABLES.BUSINESSES
    | typeof TABLES.PARTIES
    | typeof TABLES.CHEQUES
  column: 'avatar_url' | 'logo_url' | 'image_url'
  id: string
  userId: string
  sourceUrl: string
  targetBucket: PrivateMediaBucket
  maxBytes: number
}

export function parsePublicStorageUrl(
  value: string,
): { bucket: SourceBucket; path: string } | null {
  try {
    const url = new URL(value)
    const marker = '/storage/v1/object/public/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    // Decode before splitting so an encoded "/" cannot smuggle in a ".." segment.
    const segments = decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length),
    ).split(/[/\\]/)
    const bucket = segments.shift()
    if (bucket !== 'avatars' && bucket !== 'cheque-images') return null
    if (
      segments.length === 0 ||
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..',
      )
    ) {
      return null
    }
    return { bucket, path: segments.join('/') }
  } catch {
    return null
  }
}

async function fetchAll<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw toOpsError(error, `Reading ${table}`)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function collectItems(db: SupabaseClient): Promise<MigrationItem[]> {
  const [profiles, businesses, parties, cheques] = await Promise.all([
    fetchAll<{ id: string; user_id: string; avatar_url: string | null }>(
      db,
      TABLES.PROFILES,
      'id, user_id, avatar_url',
    ),
    fetchAll<{ id: string; user_id: string; logo_url: string | null }>(
      db,
      TABLES.BUSINESSES,
      'id, user_id, logo_url',
    ),
    fetchAll<{ id: string; business_id: string; avatar_url: string | null }>(
      db,
      TABLES.PARTIES,
      'id, business_id, avatar_url',
    ),
    fetchAll<{ id: string; business_id: string; image_url: string | null }>(
      db,
      TABLES.CHEQUES,
      'id, business_id, image_url',
    ),
  ])
  const owners = new Map(
    businesses.map((business) => [business.id, business.user_id]),
  )
  const items: MigrationItem[] = []
  for (const row of profiles) {
    if (row.avatar_url) {
      items.push({
        table: TABLES.PROFILES,
        column: 'avatar_url',
        id: row.id,
        userId: row.user_id,
        sourceUrl: row.avatar_url,
        targetBucket: PRIVATE_AVATAR_BUCKET,
        maxBytes: AVATAR_MAX,
      })
    }
  }
  for (const row of businesses) {
    if (row.logo_url) {
      items.push({
        table: TABLES.BUSINESSES,
        column: 'logo_url',
        id: row.id,
        userId: row.user_id,
        sourceUrl: row.logo_url,
        targetBucket: PRIVATE_AVATAR_BUCKET,
        maxBytes: AVATAR_MAX,
      })
    }
  }
  for (const row of parties) {
    const userId = owners.get(row.business_id)
    if (row.avatar_url && userId) {
      items.push({
        table: TABLES.PARTIES,
        column: 'avatar_url',
        id: row.id,
        userId,
        sourceUrl: row.avatar_url,
        targetBucket: PRIVATE_AVATAR_BUCKET,
        maxBytes: AVATAR_MAX,
      })
    }
  }
  for (const row of cheques) {
    const userId = owners.get(row.business_id)
    if (row.image_url && userId) {
      items.push({
        table: TABLES.CHEQUES,
        column: 'image_url',
        id: row.id,
        userId,
        sourceUrl: row.image_url,
        targetBucket: PRIVATE_CHEQUE_BUCKET,
        maxBytes: CHEQUE_MAX,
      })
    }
  }
  return items
}

async function migrateItem(
  db: SupabaseClient,
  item: MigrationItem,
  source: { bucket: SourceBucket; path: string },
  deleteSource: boolean,
) {
  const { data: blob, error: downloadError } = await db.storage
    .from(source.bucket)
    .download(source.path)
  if (downloadError || !blob)
    throw downloadError ?? new Error('Download failed')
  const file = new File([blob], source.path, {
    type: blob.type || 'application/octet-stream',
  })
  const extension = await validateImageFile(file, item.maxBytes)
  const targetPath = `${item.userId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await db.storage
    .from(item.targetBucket)
    .upload(targetPath, blob, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data: updated, error: updateError } = await db
    .from(item.table)
    .update({
      [item.column]: buildPrivateMediaUrl(item.targetBucket, targetPath),
    })
    .eq('id', item.id)
    .eq(item.column, item.sourceUrl)
    .select('id')
    .maybeSingle()
  if (updateError) throw updateError
  if (!updated) throw new Error('The database URL changed during migration')

  if (deleteSource) {
    const { error: deleteError } = await db.storage
      .from(source.bucket)
      .remove([source.path])
    if (deleteError) throw deleteError
  }
}

interface StorageOutcome {
  mode: 'apply' | 'dry-run'
  pending: number
  migrated: number
  skipped: number
  failed: { item: string; error: string }[]
}

export const storageMigrate = defineAction<StorageOutcome>({
  name: 'storage-migrate',
  title: 'Move public media URLs to private storage buckets',
  description:
    'Copies avatars, logos, and cheque images from the old public buckets to the private buckets and rewrites the database URLs. Dry run by default.',
  mutates: true,
  hubHidden: true,
  options: [
    {
      flags: '--apply',
      description: 'Actually migrate (default is a dry run)',
    },
    {
      flags: '--delete-source',
      description:
        'Delete each public original after it is migrated (requires --apply)',
    },
  ],
  examples: [
    'dev storage-migrate',
    'dev storage-migrate --apply',
    'dev storage-migrate --apply --delete-source',
  ],
  async run(ctx, options) {
    const apply = Boolean(options.apply) && !ctx.flags.dryRun
    const deleteSource = Boolean(options.deleteSource)
    if (deleteSource && !options.apply)
      throw new UsageError('--delete-source requires --apply.')

    const db = ctx.db() as unknown as SupabaseClient
    const items = await ctx.ui.spin('Scanning media URLs', () =>
      collectItems(db),
    )
    const work = items.flatMap((item) => {
      const source = parsePublicStorageUrl(item.sourceUrl)
      return source ? [{ item, source }] : []
    })
    const outcome: StorageOutcome = {
      mode: apply ? 'apply' : 'dry-run',
      pending: work.length,
      migrated: 0,
      skipped: items.length - work.length,
      failed: [],
    }
    if (!apply) {
      for (const { item } of work)
        ctx.ui.debug(`[dry-run] ${item.table}.${item.column} ${item.id}`)
      return outcome
    }
    if (work.length === 0) return outcome

    await confirmMutation(ctx, {
      title: `Migrate ${work.length} media file(s) to private buckets`,
      destructive: deleteSource,
      notes: deleteSource
        ? ['Public originals are deleted after each successful copy.']
        : [],
      changes: [{ field: 'files', before: 'public', after: 'private' }],
    })
    for (const { item, source } of work) {
      const label = `${item.table}.${item.column} ${item.id}`
      try {
        await migrateItem(db, item, source, deleteSource)
        outcome.migrated += 1
        ctx.ui.debug(`[migrated] ${label}`)
      } catch (error) {
        const message = toOpsError(error).message
        outcome.failed.push({ item: label, error: message })
        ctx.ui.warn(`[failed] ${label}: ${message}`)
      }
    }
    if (outcome.failed.length > 0) process.exitCode = 1
    return outcome
  },
  render(ctx, outcome) {
    ctx.ui.kv({
      Mode: outcome.mode,
      [outcome.mode === 'apply' ? 'Migrated' : 'Would migrate']:
        outcome.mode === 'apply' ? outcome.migrated : outcome.pending,
      'Skipped (not public URLs)': outcome.skipped,
      Failed: outcome.failed.length,
    })
    if (outcome.mode === 'dry-run' && outcome.pending > 0)
      ctx.ui.info('Re-run with --apply to migrate.')
    if (outcome.failed.length > 0)
      ctx.ui.error(
        `${outcome.failed.length} file(s) failed to migrate; re-run to retry them.`,
      )
  },
})
