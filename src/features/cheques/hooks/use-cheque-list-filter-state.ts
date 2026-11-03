'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ChequeSortBy, SortOrder } from '@/types/cheque-list'
import {
  CHEQUE_FILTER_PARAMS,
  parseChequeListUrl,
} from '@/validators/cheque-list-filters'

/**
 * URL-backed cheque search, sort and advanced filters shared by /cheques and
 * the entity detail pages so every cheque list filters identically.
 */
export function useChequeListFilterState() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const params = new URLSearchParams(searchParams.toString())
  const url = parseChequeListUrl(params)
  const [invalidDateInputs, setInvalidDateInputs] = useState<
    Record<string, boolean>
  >({})
  const [filterReset, setFilterReset] = useState(0)

  const replaceParams = (next: URLSearchParams) => {
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, {
      scroll: false,
    })
  }
  const changeParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if ((key === 'from' || key === 'to') && next.has('date')) {
      const linked = next.get('date')!
      next.set('from', linked)
      next.set('to', linked)
      next.delete('date')
    }
    if (value) next.set(key, value)
    else next.delete(key)
    replaceParams(next)
  }
  const setValidity = (key: string, valid: boolean) =>
    setInvalidDateInputs((previous) =>
      previous[key] === !valid ? previous : { ...previous, [key]: !valid },
    )
  const resetFilters = () => {
    setInvalidDateInputs({})
    setFilterReset((previous) => previous + 1)
    const next = new URLSearchParams(searchParams.toString())
    CHEQUE_FILTER_PARAMS.forEach((key) => next.delete(key))
    replaceParams(next)
  }

  return {
    params,
    url,
    filters: url.success ? url.filters : {},
    invalidFilters:
      !url.success || Object.values(invalidDateInputs).some(Boolean),
    filterReset,
    changeParam,
    replaceParams,
    setValidity,
    resetFilters,
    controls: {
      search: searchParams.get('q') ?? '',
      setSearch: (value: string) => changeParam('q', value),
      sortBy: (url.success ? url.sort : 'date') as ChequeSortBy,
      setSortBy: (value: ChequeSortBy) => changeParam('sort', value),
      sortOrder: (url.success ? url.order : 'desc') as SortOrder,
      setSortOrder: (value: SortOrder) => changeParam('order', value),
    },
  }
}

export type ChequeListFilterState = ReturnType<typeof useChequeListFilterState>
