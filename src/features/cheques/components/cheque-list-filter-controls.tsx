'use client'

import { ChequeFilterBar } from './cheque-filter-bar'
import { AdvancedChequeFilters } from './advanced-cheque-filters'
import type { ChequeListFilterState } from '../hooks/use-cheque-list-filter-state'
import type { useChequeList } from '../hooks/use-cheque-list'

type ChequeList = ReturnType<typeof useChequeList>

/** Search, sort, status and advanced filters shared by every cheque list. */
export function ChequeListFilterControls({
  state,
  list,
  businessId,
  onClear,
  hasAdvancedFilters = Object.keys(state.filters).length > 0,
}: {
  state: ChequeListFilterState
  list: Pick<
    ChequeList,
    | 'search'
    | 'setSearch'
    | 'filter'
    | 'setFilter'
    | 'sortBy'
    | 'setSortBy'
    | 'sortOrder'
    | 'setSortOrder'
  >
  businessId?: string
  onClear: () => void
  hasAdvancedFilters?: boolean
}) {
  return (
    <ChequeFilterBar
      search={list.search}
      setSearch={list.setSearch}
      filter={list.filter}
      setFilter={list.setFilter}
      sortBy={list.sortBy}
      setSortBy={list.setSortBy}
      sortOrder={list.sortOrder}
      setSortOrder={list.setSortOrder}
      hasAdvancedFilters={hasAdvancedFilters}
      advancedFilters={
        <AdvancedChequeFilters
          key={state.filterReset}
          businessId={businessId}
          params={state.params}
          onChange={state.changeParam}
          onClear={onClear}
          onValidityChange={state.setValidity}
        />
      }
    />
  )
}
