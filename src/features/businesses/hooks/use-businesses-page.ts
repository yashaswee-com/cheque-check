import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chequeService } from '@/features/cheques/services/cheque.service'
import { businessService } from '@/features/businesses/services/business.service'
import { useState, useMemo, useCallback } from 'react'
import { queryKeys } from '@/lib/query-keys'
import { useFormattingPreferences } from '@/features/profile/hooks/use-display-format'
import { localDay } from '@/lib/preference-format'

export function useBusinesses() {
  const preferences = useFormattingPreferences()
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [sortBy, setSortBy] = useState<'name' | 'upcoming'>('name')
  const {
    businesses,
    isLoading: businessesLoading,
    activeBusiness,
    setActiveBusiness,
  } = useBusiness()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => businessService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.businesses.all() })
    },
  })

  const today = localDay(new Date(), preferences?.time_zone || 'Asia/Kolkata')
  const {
    data: summaries,
    isLoading: chequesLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.businesses.summaries(today),
    queryFn: () => chequeService.getBusinessSummaries(today),
    enabled: businesses.length > 0,
  })
  const totals = useMemo(
    () =>
      new Map(summaries?.map((row) => [row.business_id, row.upcoming_total])),
    [summaries],
  )

  const getUpcomingTotal = useCallback(
    (businessId: string) => {
      return totals.get(businessId) ?? 0
    },
    [totals],
  )

  const filteredBusinesses = useMemo(() => {
    const result = businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.email?.toLowerCase().includes(search.toLowerCase()),
    )

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      } else {
        const totalA = getUpcomingTotal(a.id)
        const totalB = getUpcomingTotal(b.id)
        return sortOrder === 'asc' ? totalA - totalB : totalB - totalA
      }
    })

    return result
  }, [businesses, search, sortOrder, sortBy, getUpcomingTotal])

  const deleteBusiness = async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }

  return {
    businesses,
    filteredBusinesses,
    isLoading: businessesLoading || chequesLoading,
    error,
    activeBusiness,
    setActiveBusiness,
    search,
    setSearch,
    sortOrder,
    setSortOrder,
    sortBy,
    setSortBy,
    getUpcomingTotal,
    deleteBusiness,
    isDeleting: deleteMutation.isPending,
  }
}
