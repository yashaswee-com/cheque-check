import { TABLES } from '../../src/lib/supabase/tables'
import {
  NotFoundError,
  OpsError,
  toOpsError,
  unwrap,
  unwrapRows,
} from '../lib/errors'
import type { AdminClient } from '../lib/supabase'
import type { ProfileRow } from './users'

export const EDITABLE_PROFILE_FIELDS = [
  'phone',
  'time_zone',
  'language',
  'voice_call_enabled',
  'sms_enabled',
  'reminders_per_day',
] as const
export type ProfilePatch = Partial<
  Pick<ProfileRow, (typeof EDITABLE_PROFILE_FIELDS)[number]>
>

export async function updateProfile(
  db: AdminClient,
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileRow> {
  const row = unwrap(
    await db
      .from(TABLES.PROFILES)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('*')
      .maybeSingle(),
    'Updating profile',
  )
  if (!row) throw new NotFoundError(`User ${userId} has no profile row.`)
  return row
}

export type AuthEmailKind = 'magic-link' | 'password-reset'

/**
 * Asks Supabase Auth to email the user (the link is never shown to the
 * operator). Uses the anon client, exactly like the app's own login screens.
 */
export async function sendAuthEmail(
  anon: AdminClient,
  email: string,
  kind: AuthEmailKind,
  appUrl?: string,
): Promise<void> {
  const base = appUrl?.replace(/\/+$/, '')
  const { error } =
    kind === 'magic-link'
      ? await anon.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            ...(base ? { emailRedirectTo: `${base}/auth/callback` } : {}),
          },
        })
      : await anon.auth.resetPasswordForEmail(
          email,
          base
            ? { redirectTo: `${base}/auth/callback?next=/settings/password` }
            : {},
        )
  if (error) {
    throw new OpsError(
      `Supabase Auth refused to send the email: ${error.message}`,
      {
        hint:
          error.status === 429
            ? 'Auth email rate limit hit; wait a minute (Auth → Rate Limits in the dashboard).'
            : 'Check the redirect URL is allowed under Auth → URL Configuration.',
        cause: error,
      },
    )
  }
}

/** Changes the login email (pre-confirmed) and keeps profiles.email in sync. */
export async function changeEmail(
  db: AdminClient,
  userId: string,
  email: string,
): Promise<{ profileUpdated: boolean }> {
  const { error } = await db.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  })
  if (error) throw toOpsError(error, 'Updating auth email')
  const { data, error: profileError } = await db
    .from(TABLES.PROFILES)
    .update({ email, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('id')
  if (profileError) {
    throw new OpsError(
      `Auth email WAS changed, but syncing profiles.email failed: ${profileError.message}`,
      {
        hint: 'Re-run the command; it is safe to repeat.',
        cause: profileError,
      },
    )
  }
  return { profileUpdated: (data ?? []).length > 0 }
}

export const BAN_PRESETS = {
  '24h': '24h',
  '7d': '168h',
  '30d': '720h',
  permanent: '876000h',
  none: 'none',
} as const
export type BanPreset = keyof typeof BAN_PRESETS

/** `none` lifts a ban. Banned users cannot sign in or refresh sessions. */
export async function setBan(
  db: AdminClient,
  userId: string,
  duration: string,
): Promise<string | null> {
  const { data, error } = await db.auth.admin.updateUserById(userId, {
    ban_duration: duration,
  })
  if (error) throw toOpsError(error, 'Updating ban')
  return (
    (data.user as { banned_until?: string | null } | null)?.banned_until ?? null
  )
}

export const RESTORABLE = {
  business: TABLES.BUSINESSES,
  party: TABLES.PARTIES,
  account: TABLES.ACCOUNTS,
} as const
export type RestorableKind = keyof typeof RESTORABLE

export interface RestorableRecord {
  kind: RestorableKind
  id: string
  name: string | null
  businessId: string
  ownerId: string | null
  deletedAt: string | null
  parentDeletedAt: string | null
}

export async function getRestorable(
  db: AdminClient,
  kind: RestorableKind,
  id: string,
): Promise<RestorableRecord> {
  if (kind === 'business') {
    const row = unwrap(
      await db
        .from(TABLES.BUSINESSES)
        .select('id, name, user_id, deleted_at')
        .eq('id', id)
        .maybeSingle(),
      'Loading business',
    )
    if (!row) throw new NotFoundError(`No business with id ${id}.`)
    return {
      kind,
      id,
      name: row.name,
      businessId: row.id,
      ownerId: row.user_id,
      deletedAt: row.deleted_at,
      parentDeletedAt: null,
    }
  }

  const child =
    kind === 'party'
      ? unwrap(
          await db
            .from(TABLES.PARTIES)
            .select('id, name, business_id, deleted_at')
            .eq('id', id)
            .maybeSingle(),
          'Loading party',
        )
      : await db
          .from(TABLES.ACCOUNTS)
          .select('id, account_name, business_id, deleted_at')
          .eq('id', id)
          .maybeSingle()
          .then((result) => {
            const row = unwrap(result, 'Loading account')
            return row && { ...row, name: row.account_name }
          })
  if (!child) throw new NotFoundError(`No ${kind} with id ${id}.`)

  const parent = unwrap(
    await db
      .from(TABLES.BUSINESSES)
      .select('user_id, deleted_at')
      .eq('id', child.business_id)
      .maybeSingle(),
    'Loading parent business',
  )
  return {
    kind,
    id,
    name: child.name,
    businessId: child.business_id,
    ownerId: parent?.user_id ?? null,
    deletedAt: child.deleted_at,
    parentDeletedAt: parent?.deleted_at ?? null,
  }
}

export async function listDeleted(
  db: AdminClient,
  kind: RestorableKind,
  ownerId: string,
): Promise<RestorableRecord[]> {
  const businesses = unwrapRows(
    await db
      .from(TABLES.BUSINESSES)
      .select('id, name, deleted_at')
      .eq('user_id', ownerId),
    'Loading businesses',
  )
  if (kind === 'business') {
    return businesses
      .filter((row) => row.deleted_at)
      .map((row) => ({
        kind,
        id: row.id,
        name: row.name,
        businessId: row.id,
        ownerId,
        deletedAt: row.deleted_at,
        parentDeletedAt: null,
      }))
  }
  const ids = businesses.map((row) => row.id)
  if (ids.length === 0) return []
  const parentDeleted = new Map(
    businesses.map((row) => [row.id, row.deleted_at]),
  )
  const rows =
    kind === 'party'
      ? unwrapRows(
          await db
            .from(TABLES.PARTIES)
            .select('id, name, business_id, deleted_at')
            .in('business_id', ids)
            .not('deleted_at', 'is', null),
          'Loading deleted parties',
        )
      : unwrapRows(
          await db
            .from(TABLES.ACCOUNTS)
            .select('id, account_name, business_id, deleted_at')
            .in('business_id', ids)
            .not('deleted_at', 'is', null),
          'Loading deleted accounts',
        ).map((row) => ({ ...row, name: row.account_name }))
  return rows.map((row) => ({
    kind,
    id: row.id,
    name: row.name,
    businessId: row.business_id,
    ownerId,
    deletedAt: row.deleted_at,
    parentDeletedAt: parentDeleted.get(row.business_id) ?? null,
  }))
}

export async function restoreRecord(
  db: AdminClient,
  kind: RestorableKind,
  id: string,
): Promise<void> {
  const rows = unwrapRows(
    await db
      .from(RESTORABLE[kind])
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id'),
    `Restoring ${kind}`,
  )
  if (rows.length === 0) {
    throw new OpsError(`The ${kind} is no longer deleted; nothing to restore.`)
  }
}

export async function listRateLimits(db: AdminClient, userId: string) {
  return unwrapRows(
    await db
      .from(TABLES.API_RATE_LIMITS)
      .select('*')
      .eq('user_id', userId)
      .order('endpoint'),
    'Loading rate limits',
  )
}

export async function resetRateLimits(
  db: AdminClient,
  userId: string,
  endpoint?: string,
): Promise<number> {
  let query = db.from(TABLES.API_RATE_LIMITS).delete().eq('user_id', userId)
  if (endpoint) query = query.eq('endpoint', endpoint)
  const rows = unwrapRows(
    await query.select('endpoint'),
    'Resetting rate limits',
  )
  return rows.length
}
