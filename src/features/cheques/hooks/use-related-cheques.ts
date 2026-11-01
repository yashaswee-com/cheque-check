import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChequeStatus } from '@/types'
import type { ChequeSortBy, SortOrder } from '@/types/cheque-list'
import { queryKeys } from '@/lib/query-keys'
import { chequeService } from '../services/cheque.service'
import { useChequeStatusMutation } from './use-cheque-status-mutation'

export function useRelatedCheques(
  field: 'account_id' | 'party_id',
  id: string,
  businessId: string | undefined,
) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'All' | ChequeStatus>('All')
  const [sortBy, setSortBy] = useState<ChequeSortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const {
    data: cheques,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.cheques.list(businessId),
    queryFn: () => chequeService.getAll(businessId!),
    enabled: !!businessId,
  })
  const mutation = useChequeStatusMutation(businessId)

  const relatedCheques = useMemo(
    () => cheques?.filter((cheque) => cheque[field] === id) ?? [],
    [cheques, field, id],
  )
  const filteredCheques = useMemo(() => {
    const result = relatedCheques.filter(
      (cheque) =>
        (cheque.cheque_number.includes(search) ||
          cheque.amount.toString().includes(search)) &&
        (filter === 'All' || cheque.status === filter),
    )
    return result.sort((a, b) => {
      const difference =
        sortBy === 'date'
          ? new Date(a.cheque_date).getTime() -
            new Date(b.cheque_date).getTime()
          : a.amount - b.amount
      return sortOrder === 'desc' ? -difference : difference
    })
  }, [relatedCheques, search, filter, sortBy, sortOrder])

  const outstanding = useMemo(
    () =>
      relatedCheques
        .filter(
          (cheque) =>
            cheque.status !== 'Cleared' && cheque.status !== 'Bounced',
        )
        .reduce((sum, cheque) => sum + cheque.amount, 0),
    [relatedCheques],
  )

  return {
    relatedCheques,
    filteredCheques,
    outstanding,
    isLoading,
    error,
    updateChequeStatus: (id: string, status: ChequeStatus) =>
      mutation.mutate({ id, status }),
    isUpdating: mutation.isPending,
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
  }
}
