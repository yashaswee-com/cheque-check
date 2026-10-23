'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ChequeWithRelations } from '@/types'
import { ChequeStatsChart } from './cheque-stats-chart'
import {
  chequeDistribution,
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
}: {
  cheques: ChequeWithRelations[] | undefined
  currency: string
}) {
  const t = useTranslations('ChartStats')
  const [metric, setMetric] = useState<DistributionMetric>('count')
  const [direction, setDirection] = useState<DistributionDirection>('All')
  const distribution = chequeDistribution(cheques, metric, direction)
  const formatValue = (value: number) =>
    metric === 'amount'
      ? `${currency}${value.toLocaleString()}`
      : value.toLocaleString()

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          {t('measure')}
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
          {t('direction')}
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
      <div className="relative h-[280px]">
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
      </div>
      {distribution.totalCheques > 0 && !distribution.hasPending && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {distribution.allCleared ? t('allCleared') : t('noPending')}
        </p>
      )}
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
    </div>
  )
}
