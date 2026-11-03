'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { StickyPagination } from '@/components/ui/sticky-pagination'
import { ChequeCard } from '@/components/cheque-card'
import { DataState } from '@/components/ui/data-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'
import type { ChequeFilters } from '@/features/premium-workspace/types'
import { useChequeList } from '../hooks/use-cheque-list'
import { useChequeListFilterState } from '../hooks/use-cheque-list-filter-state'
import { ChequeListFilterControls } from './cheque-list-filter-controls'

/**
 * Server-paged cheque list for an entity detail page, using the same URL
 * filters, sheet and pagination as /cheques.
 */
export function ScopedChequeList({
  businessId,
  scope = {},
  totalCount,
  emptyState,
}: {
  businessId: string | undefined
  scope?: Pick<ChequeFilters, 'party_id' | 'account_id'>
  /** Cheques in scope before filtering; distinguishes "empty" from "no matches". */
  totalCount: number
  emptyState: ReactNode
}) {
  const t = useTranslations('Cheques')
  const state = useChequeListFilterState()
  const list = useChequeList(
    state.invalidFilters ? undefined : businessId,
    { ...state.filters, ...scope },
    state.controls,
  )
  const tagMap = useEntityTagMap(
    businessId,
    'cheque',
    list.cheques.map((row) => row.id),
  )
  const clearFilters = () => {
    list.setFilter('All')
    state.resetFilters()
  }

  return (
    <div className="space-y-4" data-testid="scoped-cheque-list">
      <ChequeListFilterControls
        state={state}
        list={list}
        businessId={businessId}
        onClear={clearFilters}
      />
      {state.invalidFilters ? (
        <p role="alert">{t('invalidFilters')}</p>
      ) : (
        <>
          <DataState
            isLoading={list.isLoading}
            isError={!!list.error}
            data={list.cheques}
            allData={totalCount ? [totalCount] : []}
            onClearFilters={clearFilters}
            noResultsTitle={t('noChequesMatch')}
            loadingComponent={
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            }
            emptyState={emptyState}
          >
            <div className="space-y-4">
              {list.cheques.map((cheque) => (
                <ChequeCard
                  key={cheque.id}
                  cheque={cheque}
                  onStatusUpdate={list.updateStatus}
                  tags={tagMap[cheque.id]}
                />
              ))}
            </div>
          </DataState>
          {!list.isLoading && !list.error && (
            <StickyPagination
              page={list.pageIndex}
              totalPages={list.totalPages}
              onPrevious={list.previousPage}
              onNext={list.nextPage}
              testId="scoped-cheques-pagination"
            />
          )}
        </>
      )}
    </div>
  )
}
