import { closedProfileChoices } from '@/validators/profile'
import { Profile } from '@/types'
import type { Database } from '@/types/database.types'
import { TABLES } from '@/lib/supabase/tables'
import { SupabaseRepository } from '@/repositories/base.repository'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

// Lifecycle and identity columns change only through trusted RPCs.
const PROTECTED_PROFILE_FIELDS = [
  'id',
  'user_id',
  'deleted_at',
  'deletion_batch_id',
  'created_at',
] as const

/** Validates closed choices at runtime and strips lifecycle-owned columns. */
export function toProfileUpdate(profile: Partial<Profile>): ProfileUpdate {
  const update: Record<string, unknown> = { ...profile }
  for (const field of PROTECTED_PROFILE_FIELDS) delete update[field]
  const choices = closedProfileChoices.parse({
    currency: update.currency,
    date_format: update.date_format,
    time_format: update.time_format,
    language: update.language,
  })
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    update[key] = choices[key]
  }
  return update as ProfileUpdate
}

export interface IProfileRepository {
  get(): Promise<Profile | null>
  update(profile: Partial<Profile>): Promise<Profile>
  delete(): Promise<{ providerCleanup: boolean }>
}

export class SupabaseProfileRepository
  extends SupabaseRepository
  implements IProfileRepository
{
  async get(): Promise<Profile | null> {
    const { data: userData } = await this.supabase.auth.getUser()
    const user = userData?.user
    if (!user) return null

    const data = await this.query(
      this.supabase
        .from(TABLES.PROFILES)
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
    )

    if (data) {
      return data as Profile
    }

    const existing = (await this.query(
      this.supabase
        .from(TABLES.PROFILES)
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle(),
    )) as { id: string } | null

    // A deactivated profile is never restored by signing in again.
    if (!existing) {
      return this.handle<Profile>(
        this.supabase
          .from(TABLES.PROFILES)
          .insert([
            {
              user_id: user.id,
              email: user.email ?? null,
              name: user.user_metadata?.name || '',
            },
          ])
          .select()
          .single(),
      )
    }

    return null
  }

  async update(profile: Partial<Profile>): Promise<Profile> {
    const { data: userData } = await this.supabase.auth.getUser()
    const user = userData?.user
    if (!user) throw new Error('Not authenticated')

    return this.handle<Profile>(
      this.supabase
        .from(TABLES.PROFILES)
        .update(toProfileUpdate(profile))
        .eq('user_id', user.id)
        .select()
        .single(),
    )
  }

  async delete(): Promise<{ providerCleanup: boolean }> {
    // The route runs lifecycle_deactivate() first, then bans the Auth user and
    // revokes provider sessions.
    const response = await fetch('/api/account/deactivate', { method: 'POST' })
    if (!response.ok) throw new Error('Unable to deactivate your account')

    let result: unknown
    let parseError: unknown
    try {
      result = await response.json()
    } catch (error) {
      parseError = error
    }

    const { error: signOutError } = await this.supabase.auth.signOut({
      scope: 'local',
    })
    if (signOutError) {
      throw new Error('Account deactivated, but local sign-out failed', {
        cause: signOutError,
      })
    }
    if (parseError) {
      throw new Error(
        'The account was deactivated, but cleanup status is unknown',
        {
          cause: parseError,
        },
      )
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('success' in result) ||
      result.success !== true ||
      !('providerCleanup' in result) ||
      typeof result.providerCleanup !== 'boolean'
    ) {
      throw new Error(
        'The account was deactivated, but cleanup status is unknown',
      )
    }

    return { providerCleanup: result.providerCleanup }
  }
}
