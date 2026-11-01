import { useQuery } from '@tanstack/react-query'
import { accountService } from '../services/account.service'
import { useRelatedCheques } from '@/features/cheques/hooks/use-related-cheques'
import { queryKeys } from '@/lib/query-keys'

export type { ChequeSortBy as SortBy, SortOrder } from '@/types/cheque-list'

export function useAccountDetail(id: string, businessId: string | undefined) {
  const {
    data: account,
    isLoading: accountLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () => accountService.getById(id),
  })
  const {
    relatedCheques,
    isLoading: chequesLoading,
    error: chequesError,
    outstanding,
    ...related
  } = useRelatedCheques('account_id', id, businessId)

  return {
    ...related,
    account,
    accountCheques: relatedCheques,
    isLoading: accountLoading || chequesLoading,
    error: error || chequesError,
  }
}
