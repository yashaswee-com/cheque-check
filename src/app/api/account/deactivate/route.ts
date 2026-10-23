import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { publicEnv } from '@/lib/env/client'
import { getSupabaseAdminEnv } from '@/lib/env/server'
import { logger } from '@/lib/logger'
import { withMonitoringRequest } from '@/lib/monitoring/server'
import { createClient } from '@/lib/supabase/server'
import { deactivateAccount } from '@/features/auth/server/deactivate-account'

async function deactivate() {
  try {
    const supabase = await createClient()
    const admin = createSupabaseAdmin(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      getSupabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const result = await deactivateAccount(supabase, admin)
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.status === 401 ? 'Unauthorized' : 'Unable to deactivate',
        },
        { status: result.status },
      )
    }
    if (!result.providerCleanup) {
      logger.error('Account deactivated but provider cleanup was incomplete')
    }
    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    logger.error('Failed to deactivate account', error)
    return NextResponse.json({ error: 'Unable to deactivate' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'account.deactivate', deactivate)
}
