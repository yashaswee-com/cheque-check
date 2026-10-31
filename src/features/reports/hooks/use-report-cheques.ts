import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useChequeSummary } from '@/features/cheques/hooks/use-dashboard-cheques'
import { chequeService } from '@/features/cheques/services/cheque.service'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'

export function useReportCheques(businessId: string | undefined) {
  const { profile } = useProfile()
  const includeInward = profile?.received_cheques_enabled !== false
  const summary = useChequeSummary(businessId)
  const request = {
    businessId: businessId ?? '',
    includeInward,
    limit: 10,
    sortBy: 'date' as const,
    sortOrder: 'desc' as const,
  }
  const preview = useQuery({
    queryKey: queryKeys.cheques.page(request),
    queryFn: () => chequeService.getPage(request),
    enabled: !!businessId,
  })
  const totalCount = (summary.data ?? []).reduce(
    (count, row) => count + row.cheque_count,
    0,
  )
  const outstanding = (summary.data ?? []).reduce(
    (amount, row) =>
      row.status === 'Issued' || row.status === 'Received'
        ? amount +
          (row.type === 'Outward' ? row.total_amount : -row.total_amount)
        : amount,
    0,
  )
  const error = preview.error || summary.error
  useEffect(() => {
    if (error) logger.error('Report data could not be loaded', error)
  }, [error])
  return {
    cheques: preview.data?.rows ?? [],
    summary: summary.data ?? [],
    totalCount,
    outstanding,
    isLoading: preview.isLoading || summary.isLoading,
    error,
    async loadExportCheques() {
      if (!businessId)
        throw new Error('Select a business before exporting cheques')
      const rows = await chequeService.getAll(businessId)
      return includeInward ? rows : rows.filter((row) => row.type !== 'Inward')
    },
  }
}
