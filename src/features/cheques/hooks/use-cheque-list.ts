import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ChequeStatus } from '@/types'
import type {
  ChequeListRequest,
  ChequeSortBy,
  SortOrder,
} from '@/types/cheque-list'
import type { ChequeFilters } from '@/features/premium-workspace/types'
import { queryKeys } from '@/lib/query-keys'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { chequeService } from '../services/cheque.service'
import { useChequeStatusMutation } from './use-cheque-status-mutation'

function useDebouncedSearch(search: string) {
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])
  return debouncedSearch
}

export function useChequeList(
  businessId: string | undefined,
  nativeFilters: ChequeFilters,
  controls?: {
    search: string
    setSearch: (value: string) => void
    sortBy: ChequeSortBy
    setSortBy: (value: ChequeSortBy) => void
    sortOrder: SortOrder
    setSortOrder: (value: SortOrder) => void
  },
) {
  const [localSearch, setLocalSearch] = useState('')
  const search = controls?.search ?? localSearch
  const setSearch = controls?.setSearch ?? setLocalSearch
  const debouncedSearch = useDebouncedSearch(search)
  const [filter, setFilter] = useState<ChequeStatus | 'All'>('All')
  const [localSortBy, setLocalSortBy] = useState<ChequeSortBy>('date')
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>('desc')
  const sortBy = controls?.sortBy ?? localSortBy
  const setSortBy = controls?.setSortBy ?? setLocalSortBy
  const sortOrder = controls?.sortOrder ?? localSortOrder
  const setSortOrder = controls?.setSortOrder ?? setLocalSortOrder
  const [pageIndex, setPageIndex] = useState(0)
  const { profile } = useProfile()
  const criteria = JSON.stringify([
    businessId,
    debouncedSearch,
    filter,
    sortBy,
    sortOrder,
    nativeFilters,
    profile?.received_cheques_enabled,
  ])
  const [previousCriteria, setPreviousCriteria] = useState(criteria)
  if (criteria !== previousCriteria) {
    setPreviousCriteria(criteria)
    setPageIndex(0)
  }
  const request: ChequeListRequest = {
    businessId: businessId ?? '',
    search: debouncedSearch,
    status: filter === 'All' ? undefined : filter,
    sortBy,
    sortOrder,
    offset: pageIndex * 50,
    limit: 50,
    includeInward: profile?.received_cheques_enabled !== false,
    nativeFilters,
  }
  const query = useQuery({
    queryKey: queryKeys.cheques.page(request),
    queryFn: () => chequeService.getPage(request),
    enabled: !!businessId,
  })
  const mutation = useChequeStatusMutation(businessId)
  const matchingCount = query.data?.matchingCount ?? 0
  return {
    cheques: query.data?.rows ?? [],
    activeCount: query.data?.activeCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    updateStatus: (id: string, status: ChequeStatus) =>
      mutation.mutate({ id, status }),
    pageIndex,
    hasNextPage: (pageIndex + 1) * 50 < matchingCount,
    nextPage: () => setPageIndex((page) => page + 1),
    previousPage: () => setPageIndex((page) => Math.max(0, page - 1)),
  }
}

export function useChequeSearch(
  businessId: string | undefined,
  search: string,
) {
  const debouncedSearch = useDebouncedSearch(search)
  const { profile } = useProfile()
  const request: ChequeListRequest = {
    businessId: businessId ?? '',
    search: debouncedSearch,
    limit: 5,
    includeInward: profile?.received_cheques_enabled !== false,
  }
  const query = useQuery({
    queryKey: queryKeys.cheques.page(request),
    queryFn: () => chequeService.getPage(request),
    enabled: !!businessId && !!debouncedSearch,
  })
  return {
    cheques: query.data?.rows ?? [],
    error: query.error,
    isLoading:
      !!businessId &&
      !!search &&
      (debouncedSearch !== search || query.isLoading),
  }
}
