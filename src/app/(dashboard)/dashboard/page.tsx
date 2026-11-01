'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  File02Icon as FileText,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon as Calendar,
  Chart01Icon as Stats,
  Camera01Icon as Camera,
  Building03Icon,
  Calendar01Icon,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import {
  useDashboardCheques,
  useChequeSummary,
} from '@/features/cheques/hooks/use-dashboard-cheques'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'
import { ChequeCard } from '@/components/cheque-card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Skeleton } from '@/components/ui/skeleton'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { DraftsSummaryCard } from '@/features/drafts'
import { cn } from '@/lib/utils'
import type { DateRange } from 'react-day-picker'
import { StatsDateFilter } from '@/features/cheques/components/stats-date-filter'
import {
  resolveDateRange,
  type DateRangePreset,
} from '@/features/cheques/lib/date-range'

const ChequeStatsChart = dynamic(
  () =>
    import('@/features/cheques/components/cheque-distribution').then(
      (mod) => mod.ChequeDistribution,
    ),
  {
    loading: () => <Skeleton className="h-full w-full rounded-lg" />,
    ssr: false,
  },
)

export default function HomePage() {
  const tDashboard = useTranslations('Dashboard')
  const tCheques = useTranslations('Cheques')
  const tCommon = useTranslations('Common')
  const tReports = useTranslations('Reports')
  const tStats = useTranslations('ChartStats')
  const tShared = useTranslations('SharedUI')
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionsOverflow, setActionsOverflow] = useState({
    left: false,
    right: false,
  })
  const updateActionsOverflow = useCallback(
    (element: HTMLDivElement) =>
      setActionsOverflow({
        left: element.scrollLeft > 1,
        right:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      }),
    [],
  )

  const {
    todayCheques,
    todayCount,
    payable,
    receivable,
    currentBalance,
    upcomingCount,
    overdueCount,
    isLoading,
    error,
    updateStatus,
    hasMoreToday,
  } = useDashboardCheques(activeBusiness?.id)
  useEffect(() => {
    const element = actionsRef.current
    if (!element) return
    const observer = new ResizeObserver(() => updateActionsOverflow(element))
    observer.observe(element)
    return () => observer.disconnect()
  }, [isLoading, activeBusiness?.id, error, updateActionsOverflow])
  const tagMap = useEntityTagMap(
    activeBusiness?.id,
    'cheque',
    todayCheques.map((row) => row.id),
  )

  const handleScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Store file for the next page to pick up
    import('@/lib/scan-store').then(({ ScanStore }) => {
      ScanStore.setFile(file)
      router.push('/cheques/create?action=scan')
    })
  }

  const [statsPreset, setStatsPreset] = useState<DateRangePreset>('all')
  const [customRange, setCustomRange] = useState<DateRange>()
  const statsSummary = useChequeSummary(
    activeBusiness?.id,
    resolveDateRange(statsPreset, new Date(), customRange),
  )

  const currency = profile?.currency || '₹'
  const formatAmount = (value: number) =>
    `${value < 0 ? '-' : ''}${currency}${Math.abs(value).toLocaleString()}`

  return (
    <div className="max-w-2xl space-y-8 pb-20 pt-2">
      <DataState
        isLoading={isLoading}
        isError={!!error}
        data={activeBusiness ? [activeBusiness] : []}
        allData={activeBusiness ? [activeBusiness] : []}
        loadingComponent={
          <>
            <Skeleton className="h-40 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          </>
        }
        emptyState={
          <EmptyState
            icon={Building03Icon}
            title={tDashboard('welcomeTitle')}
            description={tDashboard('welcomeDescription')}
            action={{
              label: tDashboard('createBusiness'),
              href: '/businesses/create',
            }}
          />
        }
      >
        <>
          {/* Balance Card */}
          <div className="rounded-lg bg-primary p-5 text-primary-foreground relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
                {tStats('pendingNet')}
              </p>
              <p
                className={cn(
                  'mt-1.5 text-3xl font-semibold',
                  currentBalance > 0 && 'text-emerald-200',
                  currentBalance < 0 && 'text-rose-200',
                )}
                data-testid="dashboard-current-balance"
              >
                {formatAmount(currentBalance)}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {tStats('pendingNetHelp')}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-white/10 p-2">
                  <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
                    {tDashboard('receivable')}
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-emerald-200">
                    {formatAmount(receivable)}
                  </p>
                </div>
                <div className="rounded-md bg-white/10 p-2">
                  <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
                    {tDashboard('payable')}
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-rose-200">
                    {formatAmount(payable)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-3"
            data-testid="dashboard-status-cards"
          >
            {[
              {
                label: tDashboard('today'),
                count: todayCount,
                color: 'bg-primary/5',
              },
              {
                label: tDashboard('upcoming'),
                count: upcomingCount,
                color: 'bg-green-500/5',
              },
              {
                label: tDashboard('overdue'),
                count: overdueCount,
                color: 'bg-red-500/5',
              },
            ].map((status) => (
              <div
                key={status.label}
                className={`rounded-lg border ${status.color} p-4 text-center`}
              >
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {status.label}
                </p>
                <p className="mt-2 text-2xl font-semibold">{status.count}</p>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="relative">
            {actionsOverflow.left && (
              <button
                type="button"
                aria-label={tShared('previousPage')}
                onClick={() =>
                  actionsRef.current?.scrollBy({
                    left: -180,
                    behavior: 'smooth',
                  })
                }
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background p-1 shadow-sm"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </button>
            )}
            {actionsOverflow.right && (
              <button
                type="button"
                aria-label={tShared('nextPage')}
                onClick={() =>
                  actionsRef.current?.scrollBy({
                    left: 180,
                    behavior: 'smooth',
                  })
                }
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background p-1 shadow-sm"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </button>
            )}
            <div
              ref={actionsRef}
              onScroll={(event) => updateActionsOverflow(event.currentTarget)}
              className="flex max-w-full gap-3 overflow-x-auto overscroll-x-contain snap-x snap-proximity px-1 py-2"
              data-testid="dashboard-quick-actions"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleScan}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-36 shrink-0 snap-start rounded-lg transition-transform focus-visible:outline-2 focus-visible:outline-primary active:scale-95"
              >
                <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg bg-canvas-parchment p-4 border border-primary/5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Camera} className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {tDashboard('scanCheque')}
                  </span>
                </div>
              </button>
              <Link
                href="/businesses"
                className="w-36 shrink-0 snap-start rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg bg-canvas-parchment p-4 transition-transform active:scale-95 border border-primary/5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Building03Icon} className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {tCommon('businesses')}
                  </span>
                </div>
              </Link>
              <Link
                href="/reports"
                className="w-36 shrink-0 snap-start rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg bg-canvas-parchment p-4 transition-transform active:scale-95 border border-primary/5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <HugeiconsIcon icon={FileText} className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {tReports('title')}
                  </span>
                </div>
              </Link>
            </div>
          </div>

          <DraftsSummaryCard />

          {/* Today's Cheques */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <HugeiconsIcon
                icon={Calendar}
                className="h-3 w-3 text-muted-foreground opacity-80"
              />
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {tDashboard('todaysCheques')}
              </h2>
            </div>
            {todayCheques.length === 0 ? (
              <EmptyState
                icon={Calendar01Icon}
                title={tDashboard('noChequesTodayTitle')}
                description={tDashboard('noChequesTodayDescription')}
                className="py-10 bg-canvas-parchment/30"
              />
            ) : (
              <div className="space-y-4">
                {todayCheques.map((cheque) => (
                  <ChequeCard
                    key={cheque.id}
                    cheque={cheque}
                    onStatusUpdate={(id, status) => updateStatus(id, status)}
                    tags={tagMap[cheque.id]}
                  />
                ))}
              </div>
            )}
            {hasMoreToday && (
              <Link href="/cheques">{tShared('viewAllCheques')}</Link>
            )}
          </div>

          {/* Statistics Pie Chart */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 px-1">
              <HugeiconsIcon
                icon={Stats}
                className="h-3 w-3 text-muted-foreground opacity-80"
              />
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {tDashboard('statistics')}
              </h2>
            </div>
            <StatsDateFilter
              preset={statsPreset}
              onPresetChange={setStatsPreset}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            <ChequeStatsChart
              summary={statsSummary.data}
              currency={currency}
              isLoading={statsSummary.isFetching}
              error={
                statsSummary.isError ? tCommon('loadDataError') : undefined
              }
            />
          </div>
        </>
      </DataState>
    </div>
  )
}
