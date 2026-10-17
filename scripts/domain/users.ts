import type { Database } from '../../src/types/database.types'
import { TABLES } from '../../src/lib/supabase/tables'
import { FEATURE_IDS } from '../../src/features/monetization/constants'
import {
  resolvePremiumState,
  type PremiumState,
} from '../../src/features/monetization/lib/premium-access'
import {
  NotFoundError,
  UsageError,
  unwrap,
  unwrapRows,
  toOpsError,
} from '../lib/errors'
import type { AdminClient } from '../lib/supabase'
import { isEmail, isUuid, parsePhone } from '../lib/validators'

type Tables = Database['public']['Tables']
export type ProfileRow = Tables['profiles']['Row']
export type EntitlementRow = Tables['user_entitlements']['Row']
export type QuotaRow = Tables['user_quotas']['Row']
export type TransactionRow = Tables['transactions']['Row']
export type JobRow = Tables['notification_jobs']['Row']
export type BusinessRow = Tables['businesses']['Row']

export interface UserMatch {
  userId: string
  email: string | null
  name: string | null
  phone: string | null
  deletedAt: string | null
  matchedBy: string
}

const SEARCH_LIMIT = 20
const PROFILE_COLUMNS = 'user_id, email, name, phone, deleted_at'

/** Escapes LIKE wildcards so user input is matched literally. */
function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function toMatch(
  profile: Pick<
    ProfileRow,
    'user_id' | 'email' | 'name' | 'phone' | 'deleted_at'
  >,
  matchedBy: string,
): UserMatch {
  return {
    userId: profile.user_id,
    email: profile.email,
    name: profile.name,
    phone: profile.phone,
    deletedAt: profile.deleted_at,
    matchedBy,
  }
}

async function profilesByUserIds(db: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return []
  return unwrapRows(
    await db
      .from(TABLES.PROFILES)
      .select(PROFILE_COLUMNS)
      .in('user_id', userIds),
    'Loading profiles',
  )
}

async function ownersOfBusinesses(
  db: AdminClient,
  businesses: { user_id: string; name: string }[],
): Promise<UserMatch[]> {
  const profiles = await profilesByUserIds(db, [
    ...new Set(businesses.map((business) => business.user_id)),
  ])
  return businesses.flatMap((business) => {
    const profile = profiles.find((row) => row.user_id === business.user_id)
    return profile ? [toMatch(profile, `business "${business.name}"`)] : []
  })
}

/**
 * Finds users by user id, profile id, business id, email, phone, or a
 * case-insensitive fragment of their name, email, or business name.
 */
export async function searchUsers(
  db: AdminClient,
  rawQuery: string,
): Promise<UserMatch[]> {
  const query = rawQuery.trim()
  if (!query) throw new UsageError('Enter an email, phone, user id, or name.')
  const matches: UserMatch[] = []

  if (isUuid(query)) {
    const id = query.toLowerCase()
    const [byUser, byProfile, businesses] = await Promise.all([
      db.from(TABLES.PROFILES).select(PROFILE_COLUMNS).eq('user_id', id),
      db.from(TABLES.PROFILES).select(PROFILE_COLUMNS).eq('id', id),
      db.from(TABLES.BUSINESSES).select('user_id, name').eq('id', id),
    ])
    for (const row of unwrapRows(byUser, 'Searching users'))
      matches.push(toMatch(row, 'user id'))
    for (const row of unwrapRows(byProfile, 'Searching users'))
      matches.push(toMatch(row, 'profile id'))
    matches.push(
      ...(await ownersOfBusinesses(
        db,
        unwrapRows(businesses, 'Searching businesses'),
      )),
    )
    if (matches.length === 0) {
      const { data } = await db.auth.admin.getUserById(id)
      if (data.user) {
        matches.push({
          userId: data.user.id,
          email: data.user.email ?? null,
          name: null,
          phone: data.user.phone ?? null,
          deletedAt: null,
          matchedBy: 'auth user (no profile)',
        })
      }
    }
  } else if (isEmail(query)) {
    const rows = unwrapRows(
      await db
        .from(TABLES.PROFILES)
        .select(PROFILE_COLUMNS)
        .ilike(
          'email',
          query.replace(/[\\%_]/g, (char) => `\\${char}`),
        ),
      'Searching users',
    )
    matches.push(...rows.map((row) => toMatch(row, 'email')))
  } else if (/^\+?[\d\s()-]{7,}$/.test(query)) {
    const phone = parsePhone(query)
    const [profiles, businesses] = await Promise.all([
      db.from(TABLES.PROFILES).select(PROFILE_COLUMNS).eq('phone', phone),
      db.from(TABLES.BUSINESSES).select('user_id, name').eq('phone', phone),
    ])
    matches.push(
      ...unwrapRows(profiles, 'Searching users').map((row) =>
        toMatch(row, 'phone'),
      ),
    )
    matches.push(
      ...(await ownersOfBusinesses(
        db,
        unwrapRows(businesses, 'Searching businesses'),
      )),
    )
  } else {
    const pattern = likePattern(query)
    const [byName, byEmail, businesses] = await Promise.all([
      db
        .from(TABLES.PROFILES)
        .select(PROFILE_COLUMNS)
        .ilike('name', pattern)
        .limit(SEARCH_LIMIT),
      db
        .from(TABLES.PROFILES)
        .select(PROFILE_COLUMNS)
        .ilike('email', pattern)
        .limit(SEARCH_LIMIT),
      db
        .from(TABLES.BUSINESSES)
        .select('user_id, name')
        .ilike('name', pattern)
        .is('deleted_at', null)
        .limit(SEARCH_LIMIT),
    ])
    matches.push(
      ...unwrapRows(byName, 'Searching users').map((row) =>
        toMatch(row, 'name'),
      ),
    )
    matches.push(
      ...unwrapRows(byEmail, 'Searching users').map((row) =>
        toMatch(row, 'email'),
      ),
    )
    matches.push(
      ...(await ownersOfBusinesses(
        db,
        unwrapRows(businesses, 'Searching businesses'),
      )),
    )
  }

  const unique = new Map<string, UserMatch>()
  for (const match of matches) {
    const existing = unique.get(match.userId)
    if (existing) {
      if (!existing.matchedBy.includes(match.matchedBy)) {
        existing.matchedBy = `${existing.matchedBy}, ${match.matchedBy}`
      }
    } else {
      unique.set(match.userId, { ...match })
    }
  }
  return [...unique.values()].slice(0, SEARCH_LIMIT)
}

export interface AuthSummary {
  email: string | null
  createdAt: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  bannedUntil: string | null
}

export async function getAuthSummary(
  db: AdminClient,
  userId: string,
): Promise<AuthSummary> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error || !data.user) {
    if (error && error.status !== 404)
      throw toOpsError(error, 'Loading auth user')
    throw new NotFoundError(`No auth user with id ${userId}.`)
  }
  const user = data.user as typeof data.user & { banned_until?: string | null }
  return {
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    bannedUntil: user.banned_until ?? null,
  }
}

export async function getProfile(
  db: AdminClient,
  userId: string,
): Promise<ProfileRow | null> {
  return unwrap(
    await db
      .from(TABLES.PROFILES)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    'Loading profile',
  )
}

export async function requireProfile(db: AdminClient, userId: string) {
  const profile = await getProfile(db, userId)
  if (!profile) throw new NotFoundError(`User ${userId} has no profile row.`)
  return profile
}

export async function listBusinesses(
  db: AdminClient,
  userId: string,
): Promise<Pick<BusinessRow, 'id' | 'name' | 'phone' | 'deleted_at'>[]> {
  return unwrapRows(
    await db
      .from(TABLES.BUSINESSES)
      .select('id, name, phone, deleted_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at'),
    'Loading businesses',
  )
}

export interface UserSnapshot {
  userId: string
  auth: AuthSummary
  profile: ProfileRow | null
  premium: { state: PremiumState; validUntil: string | null }
  entitlements: EntitlementRow[]
  quotas: QuotaRow[]
  businesses: (Pick<BusinessRow, 'id' | 'name' | 'phone' | 'deleted_at'> & {
    cheques: number
  })[]
  transactions: TransactionRow[]
  jobs: JobRow[]
}

export async function getUserSnapshot(
  db: AdminClient,
  userId: string,
  now = Date.now(),
): Promise<UserSnapshot> {
  const [auth, profile, entitlements, quotas, businesses, transactions, jobs] =
    await Promise.all([
      getAuthSummary(db, userId),
      getProfile(db, userId),
      db
        .from(TABLES.USER_ENTITLEMENTS)
        .select('*')
        .eq('user_id', userId)
        .order('feature_id'),
      db
        .from(TABLES.USER_QUOTAS)
        .select('*')
        .eq('user_id', userId)
        .order('feature_id'),
      db
        .from(TABLES.BUSINESSES)
        .select('id, name, phone, deleted_at')
        .eq('user_id', userId)
        .order('created_at'),
      db
        .from(TABLES.TRANSACTIONS)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      db
        .from(TABLES.NOTIFICATION_JOBS)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  const entitlementRows = unwrapRows(entitlements, 'Loading entitlements')
  const businessRows = unwrapRows(businesses, 'Loading businesses')
  const chequeCounts = await Promise.all(
    businessRows.map(async (business) => {
      const { count, error } = await db
        .from(TABLES.CHEQUES)
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
      if (error) throw toOpsError(error, 'Counting cheques')
      return count ?? 0
    }),
  )
  const lifetime = entitlementRows.find(
    (row) => row.feature_id === FEATURE_IDS.LIFETIME_PREMIUM,
  )

  return {
    userId,
    auth,
    profile,
    premium: {
      state: resolvePremiumState(lifetime, now),
      validUntil: lifetime?.valid_until ?? null,
    },
    entitlements: entitlementRows,
    quotas: unwrapRows(quotas, 'Loading quotas'),
    businesses: businessRows.map((business, index) => ({
      ...business,
      cheques: chequeCounts[index],
    })),
    transactions: unwrapRows(transactions, 'Loading transactions'),
    jobs: unwrapRows(jobs, 'Loading notification jobs'),
  }
}

export interface PremiumListRow {
  userId: string
  email: string | null
  name: string | null
  featureId: EntitlementRow['feature_id']
  status: EntitlementRow['status']
  validUntil: string | null
  updatedAt: string | null
}

export async function listEntitlementHolders(
  db: AdminClient,
  filters: {
    featureId: EntitlementRow['feature_id']
    status?: EntitlementRow['status']
    limit: number
  },
): Promise<PremiumListRow[]> {
  let query = db
    .from(TABLES.USER_ENTITLEMENTS)
    .select('*')
    .eq('feature_id', filters.featureId)
    .order('updated_at', { ascending: false })
    .limit(filters.limit)
  if (filters.status) query = query.eq('status', filters.status)
  const rows = unwrapRows(await query, 'Listing entitlements')
  const profiles = await profilesByUserIds(
    db,
    rows.map((row) => row.user_id),
  )
  return rows.map((row) => {
    const profile = profiles.find((item) => item.user_id === row.user_id)
    return {
      userId: row.user_id,
      email: profile?.email ?? null,
      name: profile?.name ?? null,
      featureId: row.feature_id,
      status: row.status,
      validUntil: row.valid_until,
      updatedAt: row.updated_at,
    }
  })
}
