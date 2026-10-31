import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env/client'
import { getSupabaseAdminEnv } from '@/lib/env/server'
import type { Database } from '@/types/database.types'

export function createAdminClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    getSupabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
