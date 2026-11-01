import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
} from '@/repositories/base.repository'
import { chequeAnalyticsSchema } from '@/validators/cheque-analytics'
import type { ChequeDateRange } from '../lib/date-range'
import type { DistributionDirection } from '../lib/statistics'

export interface AnalyticsRequest extends ChequeDateRange {
  businessId: string
  today: string
  includeInward: boolean
  direction: DistributionDirection
  offset: number
}
export const analyticsRepository = {
  async get(request: AnalyticsRequest) {
    return parseDatabaseValue(
      unwrapSupabaseResult(
        await createClient().rpc('cheque_analytics', {
          requested_business: request.businessId,
          requested_today: request.today,
          requested_include_inward: request.includeInward,
          requested_from: request.from,
          requested_to: request.to,
          requested_direction: request.direction,
          requested_offset: request.offset,
          requested_limit: 50,
        }),
      ),
      chequeAnalyticsSchema,
      'cheque analytics',
    )
  },
}
