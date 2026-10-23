import type { SupabaseClient } from '@supabase/supabase-js'

export type DeactivateResult =
  { ok: true; providerCleanup: boolean } | { ok: false; status: 401 | 500 }

// Effectively permanent; reactivation is an operator action that must also lift the ban.
export const DEACTIVATED_BAN_DURATION = '876000h'

interface AdminAuth {
  auth: {
    admin: {
      updateUserById(
        id: string,
        attributes: { ban_duration: string },
      ): Promise<{ error: { message: string } | null }>
    }
  }
}

/**
 * Deactivates the signed-in account. lifecycle_deactivate() runs first so RLS
 * denies the account immediately, then provider sessions are revoked and the
 * Auth user is banned so it cannot sign in again by any method.
 */
export async function deactivateAccount(
  supabase: SupabaseClient,
  admin: AdminAuth,
): Promise<DeactivateResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }

  const { error } = await supabase.rpc('lifecycle_deactivate')
  if (error) return { ok: false, status: 500 }

  let providerCleanup = true
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: DEACTIVATED_BAN_DURATION,
  })
  if (banError) providerCleanup = false

  // Revokes every refresh token and clears this browser's cookies.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: 'global',
  })
  if (signOutError) providerCleanup = false

  return { ok: true, providerCleanup }
}
