'use client'

import { useState, useMemo } from 'react'
import { useTransactions } from '@/features/monetization/hooks/use-transactions'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon as Search,
  Money03Icon,
  ReceiptTextIcon,
  CheckmarkCircle02Icon as Success,
  CancelCircleIcon as Failed,
  RefreshIcon as Refunded,
  Clock01Icon as Pending,
  Sorting05Icon as Filter,
  Tick02Icon as Check,
  SortingAZ01Icon as AscIcon,
  SortingZA01Icon as DescIcon,
} from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { useTranslations } from 'next-intl'
import { transactionProductId } from '@/features/monetization/lib/transaction-product'
import { PaymentReferences } from '@/features/monetization/components/payment-references'
import type { Transaction } from '@/features/monetization/repositories/monetization.repository'

export default function TransactionsPage() {
  const t = useTranslations('Transactions')
  const tp = useTranslations('Premium')
  const tf = useTranslations('Features')
  const productNames = useTranslations('ProductNames')
  const { transactions, isLoading, isRefreshing, error, refresh } =
    useTransactions()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<Transaction['type'] | 'all'>(
    'all',
  )
  const [filterStatus, setFilterStatus] = useState<
    Transaction['status'] | 'all'
  >('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')

  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return []

    let result = [...transactions]

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          (transactionProductId(tx)
            ? productNames(transactionProductId(tx)!).toLowerCase().includes(q)
            : false) ||
          tx.razorpay_order_id?.toLowerCase().includes(q) ||
          tx.razorpay_payment_id?.toLowerCase().includes(q),
      )
    }

    // Filter Type
    if (filterType !== 'all') {
      result = result.filter((tx) => tx.type === filterType)
    }

    // Filter Status
    if (filterStatus !== 'all') {
      result = result.filter((tx) => tx.status === filterStatus)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        const dateA = new Date(a.created_at).getTime()
        const dateB = new Date(b.created_at).getTime()
        comparison = dateA - dateB
      } else {
        comparison = a.amount - b.amount
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return result
  }, [
    transactions,
    searchQuery,
    filterType,
    filterStatus,
    sortOrder,
    sortBy,
    productNames,
  ])

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto pb-20 p-4">
        <Skeleton className="h-11 w-full rounded-full" />
        <div className="space-y-4 pt-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const statusConfigs = {
    captured: {
      icon: Success,
      color: 'text-green-500 bg-green-500/10 border-green-500/20',
    },
    authorized: {
      icon: Pending,
      color: 'text-primary bg-primary/10 border-primary/20',
    },
    failed: {
      icon: Failed,
      color: 'text-red-500 bg-red-500/10 border-red-500/20',
    },
    refunded: {
      icon: Refunded,
      color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    },
    created: {
      icon: Pending,
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    },
  } satisfies Record<
    Transaction['status'],
    { icon: typeof Pending; color: string }
  >
  const typeLabels = {
    lifetime: t('lifetimePremium'),
    subscription: t('subscription'),
    top_up: t('topUp'),
  } satisfies Record<Transaction['type'], string>
  const statusLabels = {
    captured: t('captured'),
    authorized: t('authorized'),
    failed: t('failed'),
    refunded: t('refunded'),
    created: t('created'),
  } satisfies Record<Transaction['status'], string>

  if (error)
    return (
      <div role="alert" className="space-y-4 rounded-lg border p-5">
        <p className="text-sm">{tf('activityFailed')}</p>
        <Button
          variant="outline"
          size="pill"
          loading={isRefreshing}
          onClick={() => void refresh()}
        >
          {tp('retry')}
        </Button>
      </div>
    )

  return (
    <div className="max-w-2xl space-y-8 pb-20" data-testid="transactions-page">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search}
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            leftIcon={Search}
            className="rounded-full h-11 bg-canvas-parchment border-none"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={t('sortAndFilter')}
                className="rounded-full h-11 w-11 shrink-0 bg-white dark:bg-zinc-900 border-none shadow-sm"
              >
                <HugeiconsIcon icon={Filter} className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-lg">
                <HugeiconsIcon icon={Filter} className="h-5 w-5 text-primary" />
                {t('sortAndFilter')}
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <FilterPillSection title={t('type')}>
                {(['all', 'lifetime', 'subscription', 'top_up'] as const).map(
                  (opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={filterType === opt}
                      onClick={() => setFilterType(opt)}
                      className={filterPillClassName(filterType === opt)}
                    >
                      <span className="font-bold text-sm">
                        {opt === 'all' ? t('allTypes') : typeLabels[opt]}
                      </span>
                      {filterType === opt && (
                        <HugeiconsIcon
                          icon={Check}
                          className="h-4 w-4 stroke-[3]"
                        />
                      )}
                    </button>
                  ),
                )}
              </FilterPillSection>

              <FilterPillSection title={t('status')}>
                {(
                  [
                    'all',
                    'captured',
                    'authorized',
                    'failed',
                    'refunded',
                    'created',
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={filterStatus === opt}
                    onClick={() => setFilterStatus(opt)}
                    className={filterPillClassName(filterStatus === opt)}
                  >
                    <span className="font-bold text-sm capitalize">
                      {opt === 'all' ? t('allStatuses') : statusLabels[opt]}
                    </span>
                    {filterStatus === opt && (
                      <HugeiconsIcon
                        icon={Check}
                        className="h-4 w-4 stroke-[3]"
                      />
                    )}
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection title={t('sortBy')}>
                {[
                  { label: t('date'), value: 'date' },
                  { label: t('amount'), value: 'amount' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={sortBy === opt.value}
                    onClick={() => setSortBy(opt.value as any)}
                    className={filterPillClassName(sortBy === opt.value)}
                  >
                    <span className="font-bold text-sm">{opt.label}</span>
                    {sortBy === opt.value && (
                      <HugeiconsIcon
                        icon={Check}
                        className="h-4 w-4 stroke-[3]"
                      />
                    )}
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection title={t('order')}>
                {[
                  { label: t('ascending'), value: 'asc', icon: AscIcon },
                  { label: t('descending'), value: 'desc', icon: DescIcon },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={sortOrder === opt.value}
                    onClick={() => setSortOrder(opt.value as any)}
                    className={filterPillClassName(sortOrder === opt.value)}
                  >
                    <HugeiconsIcon icon={opt.icon} className="h-4 w-4" />
                    <span className="font-bold text-sm">{opt.label}</span>
                  </button>
                ))}
              </FilterPillSection>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {filteredAndSortedTransactions.length === 0 ? (
        <EmptyState
          icon={ReceiptTextIcon}
          title={t('noTransactions')}
          description={
            searchQuery || filterType !== 'all' || filterStatus !== 'all'
              ? t('adjustFilters')
              : t('noTransactionsYet')
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredAndSortedTransactions.map((tx) => {
            const statusConfig = statusConfigs[tx.status]
            const StatusIcon = statusConfig.icon
            const productId = transactionProductId(tx)

            return (
              <Card
                key={tx.id}
                className="group p-4 flex flex-col gap-4 border-zinc-200 dark:border-zinc-800 shadow-sm transition-all active:scale-[0.98] bg-card rounded-xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <HugeiconsIcon icon={Money03Icon} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-semibold leading-snug">
                        {productId
                          ? productNames(productId)
                          : (tx.product_id ?? typeLabels[tx.type])}
                      </h4>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                        {format(new Date(tx.created_at), 'PPP at p')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary text-sm">
                      {tx.currency === 'INR'
                        ? '₹'
                        : tx.currency === 'USD'
                          ? '$'
                          : tx.currency}{' '}
                      {(tx.amount / 100).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      <span className="text-xs font-normal">{tx.currency}</span>
                    </p>
                    <Badge
                      variant="outline"
                      className={`mt-1.5 gap-1 text-[10px] font-semibold border ${statusConfig.color}`}
                    >
                      <HugeiconsIcon icon={StatusIcon} className="w-3 h-3" />
                      {statusLabels[tx.status]}
                    </Badge>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {tf(
                    tx.status === 'captured'
                      ? 'paymentCapturedHelp'
                      : tx.status === 'authorized'
                        ? 'paymentAuthorizedHelp'
                        : tx.status === 'created'
                          ? 'paymentCreatedHelp'
                          : tx.status === 'failed'
                            ? 'paymentFailedHelp'
                            : 'paymentRefundedHelp',
                  )}
                </p>
                <PaymentReferences transaction={tx} />
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
