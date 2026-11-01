'use client'

import { useChequeList } from '@/features/cheques/hooks/use-cheque-list'
import { Button } from '@/components/ui/button'
import { ChequeCard } from '@/components/cheque-card'
import { ChequeFilterBar } from '@/features/cheques/components/cheque-filter-bar'
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
import { useRouter, useSearchParams } from 'next/navigation'
import { chequeDateFilterSchema } from '@/validators'
import { parseISO } from 'date-fns'

function ChequesContent() {
  const t = useTranslations('Cheques')
  const tc = useTranslations('SharedUI')
  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedDate = searchParams.get('date')
  const parsedDate = chequeDateFilterSchema.safeParse(requestedDate)
  const date = parsedDate.success ? parsedDate.data : null
  const invalidDate = requestedDate !== null && !parsedDate.success
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id
  const [nativeFilters, setNativeFilters] = useState<ChequeFilters>({})
  const filters = date
    ? { ...nativeFilters, from: date, to: date }
    : nativeFilters

  const {
    cheques,
    activeCount,
    isLoading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    updateStatus,
    pageIndex,
    hasNextPage,
    nextPage,
    previousPage,
  } = useChequeList(invalidDate ? undefined : businessId, filters)
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
      router.replace(`/cheques${params.size ? `?${params}` : ''}`, {
        scroll: false,
      })
    }
  }
  const clearFilters = () => {
    clearDateFilter()
    setSearch('')
    setFilter('All')
    setSortBy('date')
    setSortOrder('desc')
    setNativeFilters({})
  }
  const visibleCheques = cheques

  return (
    <div className="max-w-2xl space-y-8 pb-24">
      <ChequeFilterBar
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
      />
      {requestedDate !== null && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-primary/5 px-4 py-3">
          <p
            role={invalidDate ? 'alert' : undefined}
            className="text-sm font-medium"
          >
            {date
              ? t('chequesOnDate', {
                  date: parseISO(date).toLocaleDateString(),
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

      {!invalidDate && (
        <div className="space-y-4">
          <DataState
            isLoading={isLoading}
            isError={!!error}
            data={visibleCheques}
            allData={activeCount ? [activeCount] : []}
            onClearFilters={clearFilters}
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
          {!isLoading && !error && activeCount > 0 && (
            <div className="flex justify-between gap-4">
              <Button
                variant="outline"
                disabled={pageIndex === 0}
                onClick={previousPage}
              >
                {tc('previousPage')}
              </Button>
              <Button
                variant="outline"
                disabled={!hasNextPage}
                onClick={nextPage}
              >
                {tc('nextPage')}
              </Button>
            </div>
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
