import { useQuery } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { queryKeys } from '@/lib/query-keys'
import { chequeService } from '../services/cheque.service'
import { localDay } from '../lib/statistics'
import type { ChequeDateRange } from '../lib/date-range'
import { useChequeStatusMutation } from './use-cheque-status-mutation'

export function useChequeSummary(
  businessId: string | undefined,
  range: ChequeDateRange = {},
) {
  const { profile } = useProfile()
  const today = localDay(new Date(), profile?.time_zone)
  const includeInward = profile?.received_cheques_enabled !== false
  return useQuery({
    queryKey: queryKeys.cheques.summary(
      businessId,
      today,
      includeInward,
      range,
    ),
    queryFn: () =>
      chequeService.getSummary(businessId!, today, includeInward, range),
    enabled: !!businessId,
  })
}

export function useDashboardCheques(businessId: string | undefined) {
  const { profile } = useProfile()
  const today = localDay(new Date(), profile?.time_zone)
  const summary = useChequeSummary(businessId)
  const request = {
    businessId: businessId ?? '',
    limit: 50,
    includeInward: profile?.received_cheques_enabled !== false,
    nativeFilters: { from: today, to: today },
  }
  const todayQuery = useQuery({
    queryKey: queryKeys.cheques.page(request),
    queryFn: () => chequeService.getPage(request),
    enabled: !!businessId,
  })
  const mutation = useChequeStatusMutation(businessId)
  let payable = 0
  let receivable = 0
  let todayCount = 0
  let upcomingCount = 0
  let overdueCount = 0
  for (const row of summary.data ?? []) {
    if (row.status === 'Issued' || row.status === 'Received') {
      if (row.type === 'Outward') payable += row.total_amount
      else receivable += row.total_amount
    }
    todayCount += row.today_count
    upcomingCount += row.upcoming_count
    overdueCount += row.overdue_count
  }
  return {
    todayCheques: todayQuery.data?.rows ?? [],
    todayCount,
    payable,
    receivable,
    currentBalance: receivable - payable,
    upcomingCount,
    overdueCount,
    isLoading: summary.isLoading || todayQuery.isLoading,
    error: summary.error || todayQuery.error,
    hasMoreToday: (todayQuery.data?.matchingCount ?? 0) > 50,
    updateStatus: (id: string, status: import('@/types').ChequeStatus) =>
      mutation.mutate({ id, status }),
  }
}
