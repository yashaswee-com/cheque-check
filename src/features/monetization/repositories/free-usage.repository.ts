import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
} from '@/repositories/base.repository'
import { freeUsageSchema } from '@/validators/free-usage'
export async function getFreeUsage() {
  const rows = unwrapSupabaseResult(await createClient().rpc('free_plan_usage'))
  return parseDatabaseValue(rows[0], freeUsageSchema, 'free usage')
}
