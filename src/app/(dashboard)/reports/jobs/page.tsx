'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useExportJobs } from '@/features/reports/hooks/use-export-jobs'
import { PremiumGate } from '@/features/monetization/components/premium-gate'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import {
  EXPORT_JOB_STATUSES,
  type ExportJobPageRequest,
} from '@/validators/export-job'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StickyPagination } from '@/components/ui/sticky-pagination'
import { toast } from '@/components/ui/toast'
import { logger } from '@/lib/logger'

export default function JobsPage() {
  return (
    <PremiumGate feature="reports">
      <JobsContent />
    </PremiumGate>
  )
}

function JobsContent() {
  const t = useTranslations('Reports')
  const common = useTranslations('Common')
  const display = useDisplayFormat()
  const { activeBusiness } = useBusiness()
  const [request, setRequest] = useState<ExportJobPageRequest>({
    offset: 0,
    limit: 50,
  })
  const [previousBusiness, setPreviousBusiness] = useState(activeBusiness?.id)
  if (previousBusiness !== activeBusiness?.id) {
    setPreviousBusiness(activeBusiness?.id)
    setRequest((previous) => ({ ...previous, offset: 0 }))
  }
  const jobs = useExportJobs(activeBusiness?.id, request)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const perform = async (operation: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await operation()
    } catch (error) {
      logger.error('Export job action failed', error)
      toast.add({
        title: common('error'),
        description: error instanceof Error ? error.message : common('error'),
        type: 'error',
      })
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <div className="max-w-2xl space-y-6 pb-24">
      <Link href="/reports" className="text-sm underline">
        {t('title')}
      </Link>
      <h1 className="text-2xl font-bold">{t('exportJobs')}</h1>
      <p className="text-sm text-muted-foreground">{t('exportJobsHelp')}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('jobStatusFilter')}
          <select
            className="rounded-md border bg-background p-2"
            value={request.status ?? ''}
            onChange={(event) => {
              const value = event.target.value
              const status = EXPORT_JOB_STATUSES.find(
                (status) => status === value,
              )
              setRequest((previous) => ({ ...previous, offset: 0, status }))
            }}
          >
            <option value="">{common('all')}</option>
            {EXPORT_JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`jobStatus.${status}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('jobFormatFilter')}
          <select
            className="rounded-md border bg-background p-2"
            value={request.format ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setRequest((previous) => ({
                ...previous,
                offset: 0,
                format: value === 'csv' || value === 'json' ? value : undefined,
              }))
            }}
          >
            <option value="">{common('all')}</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <Button
          variant="outline"
          disabled={jobs.isFetching || !activeBusiness}
          onClick={() => void jobs.refetch()}
        >
          {t('refreshJobs')}
        </Button>
      </div>
      {!activeBusiness ? (
        <p>{t('selectBusinessJobs')}</p>
      ) : jobs.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : jobs.error ? (
        <p role="alert">{common('loadDataError')}</p>
      ) : !jobs.data?.length ? (
        <p role="status">{t('noJobsMatch')}</p>
      ) : (
        <ul className="space-y-3">
          {jobs.data.map((job) => (
            <li key={job.id} className="rounded-lg border p-4">
              <p className="font-semibold">
                {job.format.toUpperCase()} - {t(`jobStatus.${job.status}`)}
              </p>
              <p className="text-sm text-muted-foreground">
                {display.date(job.created_at)}
              </p>
              <p className="text-sm">
                {t('exportProgress', {
                  done: Math.min(job.next_part * 500, job.row_count),
                  total: job.row_count,
                })}
              </p>
              <div className="mt-3 flex gap-3">
                {job.status === 'ready' && (
                  <a
                    className="underline"
                    href={`/api/reports/exports/${job.id}/download`}
                  >
                    {t('downloadExport')}
                  </a>
                )}
                {job.status === 'queued' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void perform(() => jobs.cancel(job.id))}
                  >
                    {t('cancelExport')}
                  </Button>
                )}
                {job.status === 'failed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void perform(() => jobs.request(job.format))}
                  >
                    {t('retryExport')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <StickyPagination
        page={Math.floor(request.offset / request.limit)}
        totalPages={Math.max(
          1,
          Math.ceil((jobs.matchingCount ?? 0) / request.limit),
        )}
        disabled={jobs.isFetching}
        onPrevious={() =>
          setRequest((previous) => ({
            ...previous,
            offset: Math.max(0, previous.offset - previous.limit),
          }))
        }
        onNext={() =>
          setRequest((previous) => ({
            ...previous,
            offset: previous.offset + previous.limit,
          }))
        }
        testId="export-jobs-pagination"
      />
    </div>
  )
}
