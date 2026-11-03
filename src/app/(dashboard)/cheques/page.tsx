'use client'

import { useChequeList } from '@/features/cheques/hooks/use-cheque-list'
import { Button } from '@/components/ui/button'
import { StickyPagination } from '@/components/ui/sticky-pagination'
import { ChequeCard } from '@/components/cheque-card'
import { ChequeListFilterControls } from '@/features/cheques/components/cheque-list-filter-controls'
import { useChequeListFilterState } from '@/features/cheques/hooks/use-cheque-list-filter-state'
import { HugeiconsIcon } from '@hugeicons/react'
import { Invoice01Icon as ReceiptText } from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { Skeleton } from '@/components/ui/skeleton'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'
import { DraftsLink } from '@/features/drafts'

import { ChequeWithRelations } from '@/types'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'
import type { ChequeFilters } from '@/features/premium-workspace/types'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { chequeDateFilterSchema } from '@/validators'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'

function ChequesContent() {
  const display = useDisplayFormat()
  const t = useTranslations('Cheques')
  const searchParams = useSearchParams()
  const filterState = useChequeListFilterState()
  const requestedDate = searchParams.get('date')
  const parsedDate = chequeDateFilterSchema.safeParse(requestedDate)
  const date = parsedDate.success ? parsedDate.data : null
  const invalidDate = requestedDate !== null && !parsedDate.success
  const invalidFilters = filterState.invalidFilters
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id
  const [nativeFilters, setNativeFilters] = useState<ChequeFilters>({})
  const filters = { ...nativeFilters, ...filterState.filters }

  const list = useChequeList(
    invalidFilters ? undefined : businessId,
    filters,
    filterState.controls,
  )
  const {
    cheques,
    activeCount,
    isLoading,
    error,
    setSearch,
    setFilter,
    updateStatus,
    pageIndex,
    totalPages,
    nextPage,
    previousPage,
  } = list
  const tagMap = useEntityTagMap(
    businessId,
    'cheque',
    cheques.map((row) => row.id),
  )

  const clearDateFilter = () => {
    const remaining = { ...nativeFilters }
    delete remaining.from
    delete remaining.to
    setNativeFilters(remaining)
    if (requestedDate !== null) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('date')
      filterState.replaceParams(params)
    }
  }
  const clearFilters = () => {
    setSearch('')
    setFilter('All')
    setNativeFilters({})
    filterState.resetFilters()
  }
  const visibleCheques = cheques

  return (
    <div className="max-w-2xl space-y-8 pb-24">
      <ChequeListFilterControls
        state={filterState}
        list={list}
        businessId={businessId}
        onClear={clearFilters}
        hasAdvancedFilters={Object.keys(filters).length > 0}
      />
      {invalidFilters && !invalidDate && (
        <p role="alert">{t('invalidFilters')}</p>
      )}
      {requestedDate !== null && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-primary/5 px-4 py-3">
          <p
            role={invalidDate ? 'alert' : undefined}
            className="text-sm font-medium"
          >
            {date
              ? t('chequesOnDate', {
                  date: display.date(date),
                })
              : t('invalidDateFilter')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearDateFilter}
          >
            {t('clearDateFilter')}
          </Button>
        </div>
      )}

      <DraftsLink entity="cheque" />
      <NativeTools
        destination="cheques"
        businessId={businessId}
        onFiltersChange={setNativeFilters}
      />

      {!invalidFilters && (
        <div className="space-y-4">
          <DataState
            isLoading={isLoading}
            isError={!!error}
            data={visibleCheques}
            allData={activeCount ? [activeCount] : []}
            onClearFilters={clearFilters}
            noResultsTitle={t('noChequesMatch')}
            loadingComponent={
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            }
            emptyState={
              <EmptyState
                icon={ReceiptText}
                data-testid="cheques-empty-state"
                title={t('noChequesTitle')}
                description={t('noChequesDesc')}
                action={{
                  label: t('recordFirst'),
                  href: '/cheques/create',
                }}
              />
            }
          >
            {visibleCheques.map((cheque: ChequeWithRelations) => (
              <ChequeCard
                key={cheque.id}
                cheque={cheque}
                onStatusUpdate={updateStatus}
                tags={tagMap[cheque.id]}
              />
            ))}
          </DataState>
          {!isLoading && !error && (
            <StickyPagination
              page={pageIndex}
              totalPages={totalPages}
              onPrevious={previousPage}
              onNext={nextPage}
              testId="cheques-pagination"
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function ChequesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full rounded-lg" />}>
      <ChequesContent />
    </Suspense>
  )
}
