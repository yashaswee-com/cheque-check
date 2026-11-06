'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { chequeAuditService } from '@/features/cheques/services/cheque-audit.service'

export function useChequeAuditLog(
  chequeId: string | null | undefined,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.cheques.auditLog(chequeId ?? ''),
    enabled: Boolean(chequeId) && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      chequeAuditService.getByChequeId(chequeId ?? '', Number(pageParam), 20),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
  })
}
