import { useQuery } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { queryKeys } from '@/lib/query-keys'
import { localDay, type DistributionDirection } from '../lib/statistics'
import type { ChequeDateRange } from '../lib/date-range'
import { analyticsService } from '../services/analytics.service'

export function useChequeAnalytics(
  businessId: string | undefined,
  range: ChequeDateRange,
  direction: DistributionDirection,
  offset: number,
) {
  const { profile } = useProfile()
  const request = {
    businessId: businessId ?? '',
    ...range,
    today: localDay(new Date(), profile?.time_zone),
    includeInward: profile?.received_cheques_enabled !== false,
    direction,
    offset,
  }
  return useQuery({
    queryKey: queryKeys.cheques.analytics(request),
    queryFn: () => analyticsService.get(request),
    enabled: !!businessId,
  })
}
