import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getPrintLayout } from '@/features/premium-workspace/services/workspace.service'

export function usePrintLayout(accountId: string) {
  return useQuery({
    queryKey: queryKeys.premiumWorkspace.printLayout(accountId),
    queryFn: () => getPrintLayout(accountId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
}
