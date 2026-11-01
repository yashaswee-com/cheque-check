'use client'

import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useReportCheques } from '@/features/reports/hooks/use-report-cheques'
import { useExportJobs } from '@/features/reports/hooks/use-export-jobs'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { reportService } from '@/features/reports/services/report.service'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  File02Icon as FileText,
  FileDownloadIcon as Download,
  FilterIcon as Filter,
  Calendar01Icon as Calendar,
  Building03Icon,
} from '@hugeicons/core-free-icons'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusPill } from '@/components/ui/status-pill'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import {
  PremiumGate,
  usePremiumAction,
} from '@/features/monetization/components/premium-gate'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'
import { toast } from '@/components/ui/toast'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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

export default function ReportsPage() {
  return (
    <PremiumGate feature="reports" testId="reports-premium-gate">
      <ReportsContent />
    </PremiumGate>
  )
}

function ReportsContent() {
  const t = useTranslations('Dashboard')
  const tr = useTranslations('Reports')
  const tc = useTranslations('Common')
  const tCheques = useTranslations('Cheques')
  const tw = useTranslations('PremiumWorkspace')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportLock = useRef(false)

  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const premium = usePremiumAction()
  const jobs = useExportJobs(activeBusiness?.id)

  const {
    cheques,
    isLoading: chequesLoading,
    summary,
    totalCount,
    outstanding,
    error,
    loadExportCheques,
  } = useReportCheques(activeBusiness?.id)

  const isLoading = chequesLoading

  const currency = profile?.currency || '₹'
  const display = useDisplayFormat(profile)

  const handleExport = async (format: 'csv' | 'json' | 'pdf' | 'excel') => {
    if (exportLock.current) return
    exportLock.current = true
    setExporting(true)
    try {
      if (!(await premium.verifyAccess('reports'))) return
      if (format === 'csv' || format === 'json') {
        await jobs.request(format)
        setExportOpen(false)
        return
      }
      const exportCheques = await loadExportCheques()
      const baseName = `cheques_report_${activeBusiness?.name || 'export'}`
      const presentation = {
        preferences: profile,
        language: display.locale,
        title: tr('title'),
        headers: [
          tCheques('chequeNumber'),
          tCheques('party'),
          tCheques('account'),
          tCheques('amount'),
          tCheques('chequeDate'),
          tCheques('type'),
          tCheques('status'),
          tCheques('notes'),
        ],
        sheet: tc('cheques'),
        page: tw('page'),
        unknownParty: tCheques('party'),
        statuses: Object.fromEntries(
          ['Issued', 'Received', 'Cleared', 'Bounced'].map((status) => [
            status,
            tw(`statuses.${status}`),
          ]),
        ),
        types: { Inward: tw('types.Inward'), Outward: tw('types.Outward') },
      }
      if (format === 'pdf') {
        await reportService.exportToPDF(
          exportCheques,
          `${baseName}.pdf`,
          presentation,
        )
      } else {
        await reportService.exportToExcel(
          exportCheques,
          `${baseName}.xlsx`,
          presentation,
        )
      }
      setExportOpen(false)
    } catch (error) {
      logger.error('Report export failed', error)
      toast.add({
        title: tc('error'),
        description: error instanceof Error ? error.message : tc('error'),
        type: 'error',
      })
    } finally {
      exportLock.current = false
      setExporting(false)
    }
  }

  return (
    <div
      className="max-w-2xl space-y-8 pb-20 pt-2"
      data-testid="reports-content"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-sm font-semibold tracking-tight">
            {tr('title')}
          </h1>
          <p className="text-body text-muted-foreground">{tr('subtitle')}</p>
        </div>
        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger
            render={
              <Button
                className="rounded-full gap-2"
                data-testid="reports-export-trigger"
                disabled={isLoading || !!error || totalCount === 0 || exporting}
                loading={exporting}
              />
            }
          >
            <HugeiconsIcon icon={Download} className="h-4 w-4" />
            {tr('export')}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44">
            <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
              {tr('exportFormat')}
            </p>
            <Button
              variant="ghost"
              type="button"
              disabled={exporting}
              data-testid="reports-export-csv"
              className="h-auto w-full justify-start rounded-md border-0 px-2 py-2 text-left text-sm font-normal hover:bg-muted active:scale-100"
              onClick={() => handleExport('csv')}
            >
              {tr('csvFormat')}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={exporting}
              data-testid="reports-export-json"
              className="h-auto w-full justify-start rounded-md border-0 px-2 py-2 text-left text-sm font-normal hover:bg-muted active:scale-100"
              onClick={() => handleExport('json')}
            >
              {tr('jsonFormat')}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={exporting}
              data-testid="reports-export-pdf"
              className="h-auto w-full justify-start rounded-md border-0 px-2 py-2 text-left text-sm font-normal hover:bg-muted active:scale-100"
              onClick={() => handleExport('pdf')}
            >
              {tr('pdfFormat')}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={exporting}
              data-testid="reports-export-excel"
              className="h-auto w-full justify-start rounded-md border-0 px-2 py-2 text-left text-sm font-normal hover:bg-muted active:scale-100"
              onClick={() => handleExport('excel')}
            >
              {tr('excelFormat')}
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <section className="space-y-3" aria-label={tr('exportJobs')}>
        <h2 className="font-semibold">{tr('exportJobs')}</h2>
        <Link href="/reports/jobs" className="text-sm underline">
          {tr('viewAllJobs')}
        </Link>
        <p className="text-sm text-muted-foreground">{tr('exportJobsHelp')}</p>
        {jobs.isLoading && <Skeleton className="h-12 w-full" />}
        {jobs.error && (
          <p role="alert" className="text-destructive">
            {tc('loadDataError')}
          </p>
        )}
        {(jobs.data ?? []).map((job) => {
          const status = job.status
          return (
            <div
              key={job.id}
              data-testid="report-export-job"
              data-format={job.format}
              data-status={status}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {job.format.toUpperCase()} - {tr(`jobStatus.${status}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr('exportProgress', {
                    done: Math.min(job.next_part * 500, job.row_count),
                    total: job.row_count,
                  })}
                </p>
              </div>
              {status === 'ready' && (
                <a
                  className="text-sm font-medium underline"
                  href={`/api/reports/exports/${job.id}/download`}
                >
                  {tr('downloadExport')}
                </a>
              )}
              {(status === 'queued' ||
                status === 'processing' ||
                status === 'ready') && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={exporting}
                  onClick={async () => {
                    try {
                      await jobs.cancel(job.id)
                    } catch (error) {
                      logger.error('Export cancellation failed', error)
                      toast.add({
                        title: tc('error'),
                        description:
                          error instanceof Error ? error.message : tc('error'),
                        type: 'error',
                      })
                    }
                  }}
                >
                  {tr('cancelExport')}
                </Button>
              )}
            </div>
          )
        })}
      </section>

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
            title={t('welcomeTitle')}
            description={t('welcomeDescription')}
            action={{
              label: t('createBusiness'),
              href: '/businesses/create',
            }}
          />
        }
      >
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-primary p-6 text-primary-foreground">
              <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
                {t('totalOutstanding')}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {currency}
                {display.number(outstanding)}
              </p>
            </div>
            <div className="rounded-lg bg-canvas-parchment p-6 dark:bg-surface-tile-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {tc('totalCheques')}
              </p>
              <p className="mt-1 text-2xl font-semibold">{totalCount}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <HugeiconsIcon
                icon={Calendar}
                className="h-3 w-3 text-muted-foreground opacity-80"
              />
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {tr('distribution')}
              </h2>
            </div>
            <ChequeStatsChart summary={summary} currency={currency} />
          </div>

          {/* List Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={FileText}
                  className="h-3 w-3 text-muted-foreground opacity-80"
                />
                <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {tr('recentCheques')}
                </h2>
              </div>
            </div>

            {cheques?.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={tr('noChequesYet')}
                description={tr('noChequesToReport')}
                className="py-10 bg-canvas-parchment/30"
              />
            ) : (
              <div className="divide-y rounded-lg border bg-card overflow-hidden">
                {(cheques || []).slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <TextTruncate
                        text={c.party?.name || ''}
                        maxLength={20}
                        className="font-semibold block"
                      />
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                        {display.date(c.cheque_date)} • #{c.cheque_number}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-bold">
                        {currency}
                        {display.number(c.amount)}
                      </p>
                      <StatusPill
                        status={c.status}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                ))}
                {totalCount > 10 && (
                  <div className="p-3 text-center bg-muted/20">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {tr('showingCheques', { count: totalCount })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DataState>
    </div>
  )
}
