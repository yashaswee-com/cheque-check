'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Chart01Icon, ArrowUpDownIcon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChequeWithRelations } from '@/types'
import type { ChequeSummaryRow } from '@/types/cheque-list'
import { ChequeStatsChart } from './cheque-stats-chart'
import {
  chequeDistribution,
  DISTRIBUTION_STATUSES,
  type DistributionDirection,
  type DistributionMetric,
} from '../lib/statistics'

const COLORS = {
  Issued: '#0066cc',
  Received: '#2997ff',
  Cleared: '#34C759',
  Bounced: '#FF3B30',
} as const

export function ChequeDistribution({
  cheques,
  currency,
  summary,
  isLoading = false,
  error,
}: {
  cheques?: ChequeWithRelations[]
  summary?: ChequeSummaryRow[]
  currency: string
  isLoading?: boolean
  error?: string
}) {
  const t = useTranslations('ChartStats')
  const tc = useTranslations('Common')
  const [metric, setMetric] = useState<DistributionMetric>('count')
  const [direction, setDirection] = useState<DistributionDirection>('All')
  const distribution = summary
    ? summaryDistribution(summary, metric, direction)
    : chequeDistribution(cheques, metric, direction)
  const formatValue = (value: number) =>
    metric === 'amount'
      ? `${currency}${value.toLocaleString()}`
      : value.toLocaleString()

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Chart01Icon} className="size-3.5" />
            {t('measure')}
          </span>
          <select
            value={metric}
            onChange={(event) => {
              if (
                event.target.value === 'count' ||
                event.target.value === 'amount'
              )
                setMetric(event.target.value)
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="count">{t('count')}</option>
            <option value="amount">{t('amount')}</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={ArrowUpDownIcon} className="size-3.5" />
            {t('direction')}
          </span>
          <select
            value={direction}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'All' || value === 'Outward' || value === 'Inward')
                setDirection(value)
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="All">{t('all')}</option>
            <option value="Outward">{t('outward')}</option>
            <option value="Inward">{t('inward')}</option>
          </select>
        </label>
      </div>
      <div className="relative h-[280px]" aria-busy={isLoading}>
        {isLoading ? (
          <div role="status" className="h-full">
            <span className="sr-only">{tc('loading')}</span>
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <ChequeStatsChart
            chartData={distribution.slices
              .filter((slice) => slice.value > 0)
              .map((slice) => ({
                name: t(slice.status),
                value: slice.value,
                color: COLORS[slice.status],
              }))}
            totalCheques={distribution.totalCheques}
            totalLabel={formatValue(distribution.total)}
            formatValue={formatValue}
          />
        )}
      </div>
      {!isLoading &&
        !error &&
        distribution.totalCheques > 0 &&
        !distribution.hasPending && (
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            {distribution.allCleared ? t('allCleared') : t('noPending')}
          </p>
        )}
      {!isLoading && !error && (
        <ul className="sr-only" aria-label={t('distribution')}>
          {distribution.slices.map((slice) => (
            <li key={slice.status}>
              {t(slice.status)}: {formatValue(slice.value)} (
              {distribution.total > 0
                ? ((slice.value / distribution.total) * 100).toFixed(1)
                : '0'}
              %)
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function summaryDistribution(
  rows: ChequeSummaryRow[],
  metric: DistributionMetric,
  direction: DistributionDirection,
) {
  const eligible = rows.filter(
    (row) => direction === 'All' || row.type === direction,
  )
  const slices = DISTRIBUTION_STATUSES.map((status) => ({
    status,
    count: eligible
      .filter((row) => row.status === status)
      .reduce((sum, row) => sum + row.cheque_count, 0),
    value: eligible
      .filter((row) => row.status === status)
      .reduce(
        (sum, row) =>
          sum + (metric === 'count' ? row.cheque_count : row.total_amount),
        0,
      ),
  }))
  const totalCheques = slices.reduce((sum, slice) => sum + slice.count, 0)
  return {
    slices,
    totalCheques,
    total: slices.reduce((sum, slice) => sum + slice.value, 0),
    hasPending: slices.some(
      (slice) =>
        (slice.status === 'Issued' || slice.status === 'Received') &&
        slice.count > 0,
    ),
    allCleared:
      totalCheques > 0 &&
      slices.find((slice) => slice.status === 'Cleared')?.count ===
        totalCheques,
  }
}
