import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import {
  referralCodeSchema,
  referralSummarySchema,
} from '@/validators/referral'
import { ValidationError } from '@/lib/errors'
export const referralRepository = {
  async summary() {
    return parseDatabaseValue(
      unwrapSupabaseResult(await createClient().rpc('referral_summary')),
      referralSummarySchema,
      'referrals',
    )
  },
  async apply(code: string) {
    const parsed = referralCodeSchema.safeParse(code)
    if (!parsed.success) throw new ValidationError('Invalid referral code')
    unwrapSupabaseVoid(
      await createClient().rpc('apply_referral_code', {
        requested_code: parsed.data,
      }),
    )
  },
}
