'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChequeDateRange } from '../lib/date-range'
import type {
  DistributionDirection,
  DistributionMetric,
} from '../lib/statistics'
import { analyticsTotals } from '../lib/analytics'
import { useChequeAnalytics } from '../hooks/use-cheque-analytics'

export function ChequeAnalytics({
  businessId,
  range,
  showBankAnalysis = false,
}: {
  businessId: string | undefined
  range: ChequeDateRange
  showBankAnalysis?: boolean
}) {
  const t = useTranslations('Analytics')
  const stats = useTranslations('ChartStats')
  const common = useTranslations('Common')
  const shared = useTranslations('SharedUI')
  const { profile } = useProfile()
  const display = useDisplayFormat(profile)
  const includeInward = profile?.received_cheques_enabled !== false
  const [direction, setDirection] = useState<DistributionDirection>('All')
  const effectiveDirection =
    !includeInward && direction === 'Inward' ? 'All' : direction
  const [metric, setMetric] = useState<DistributionMetric>('amount')
  const [offset, setOffset] = useState(0)
  const criteria = JSON.stringify([
    businessId,
    range,
    effectiveDirection,
    includeInward,
  ])
  const [previousCriteria, setPreviousCriteria] = useState(criteria)
  if (previousCriteria !== criteria) {
    setPreviousCriteria(criteria)
    setOffset(0)
  }
  const query = useChequeAnalytics(
    businessId,
    range,
    effectiveDirection,
    offset,
  )
  const types = (includeInward ? ['Outward', 'Inward'] : ['Outward']).filter(
    (type) => effectiveDirection === 'All' || effectiveDirection === type,
  )
  const bankHref = (id: string | null) => {
    const params = new URLSearchParams({ bank_ids: id ?? 'unknown' })
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    if (effectiveDirection !== 'All') params.set('type', effectiveDirection)
    return `/cheques?${params}`
  }
  return (
    <section className="space-y-5 rounded-lg border bg-card p-4">
      <h2 className="font-bold">{t('title')}</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {stats('measure')}
          <select
            className="rounded-md border bg-background p-2"
            value={metric}
            onChange={(event) => {
              if (
                event.target.value === 'amount' ||
                event.target.value === 'count'
              )
                setMetric(event.target.value)
            }}
          >
            <option value="count">{stats('count')}</option>
            <option value="amount">{stats('amount')}</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {stats('direction')}
          <select
            className="rounded-md border bg-background p-2"
            value={effectiveDirection}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'All' || value === 'Outward' || value === 'Inward')
                setDirection(value)
            }}
          >
            <option value="All">{stats('all')}</option>
            <option value="Outward">{stats('outward')}</option>
            {includeInward && <option value="Inward">{stats('inward')}</option>}
          </select>
        </label>
      </div>
      {query.isFetching ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <p role="alert">{t('loadError')}</p>
      ) : (
        query.data && (
          <>
            <p className="text-sm text-muted-foreground">
              {t(`grouping.${query.data.granularity}`)}
            </p>
            <div className="h-64 min-w-0" aria-label={t('title')}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={query.data.series} accessibilityLayer>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day) => display.date(String(day))}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(day) => display.date(String(day))}
                    formatter={(value) =>
                      metric === 'amount'
                        ? display.currency(Number(value))
                        : display.number(Number(value))
                    }
                  />
                  <Legend />
                  {types.includes('Outward') && (
                    <Line
                      type="linear"
                      dataKey={`outward_${metric}`}
                      name={stats('outward')}
                      stroke="#0066cc"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {types.includes('Inward') && (
                    <Line
                      type="linear"
                      dataKey={`inward_${metric}`}
                      name={stats('inward')}
                      stroke="#34C759"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>{t('title')}</caption>
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  {types.map((type) => (
                    <th key={type}>
                      {stats(type === 'Outward' ? 'outward' : 'inward')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.series.map((point) => (
                  <tr key={point.day}>
                    <th>{display.date(point.day)}</th>
                    {types.map((type) => (
                      <td key={type}>
                        {metric === 'amount'
                          ? display.currency(
                              type === 'Outward'
                                ? point.outward_amount
                                : point.inward_amount,
                            )
                          : display.number(
                              type === 'Outward'
                                ? point.outward_count
                                : point.inward_count,
                            )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!query.data.summary.length && (
              <p role="status">{t('noCheques')}</p>
            )}
            {showBankAnalysis && (
              <>
                <h3 className="font-semibold">{t('summary')}</h3>
                {types.map((type) => (
                  <div key={type}>
                    <h4 className="text-sm font-semibold">
                      {stats(type === 'Outward' ? 'outward' : 'inward')}
                    </h4>
                    <dl className="grid grid-cols-2 gap-3">
                      {analyticsTotals(
                        query.data!.summary,
                        type === 'Outward' ? 'Outward' : 'Inward',
                      ).map((total) => (
                        <div
                          key={total.key}
                          className="rounded-md bg-muted/30 p-3"
                        >
                          <dt className="text-sm">{t(total.key)}</dt>
                          <dd className="font-bold">
                            {display.currency(total.amount)}
                          </dd>
                          <dd className="text-xs">
                            {t('count', { count: total.count })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <h3 className="font-semibold">{t('byBank')}</h3>
                <ul className="space-y-3">
                  {query.data.banks.map((bank) => (
                    <li
                      key={bank.id ?? 'unknown'}
                      className="rounded-md border p-3"
                    >
                      <Link
                        className="font-semibold underline"
                        href={bankHref(bank.id)}
                      >
                        {bank.id === null ? t('unknownBank') : bank.name}
                      </Link>
                      {types.map((type) => (
                        <div key={type} className="mt-2">
                          <p className="text-xs font-semibold">
                            {stats(type === 'Outward' ? 'outward' : 'inward')}
                          </p>
                          <dl className="grid grid-cols-2 gap-2">
                            {analyticsTotals(
                              bank.metrics,
                              type === 'Outward' ? 'Outward' : 'Inward',
                            ).map((total) => (
                              <div key={total.key}>
                                <dt className="text-xs">{t(total.key)}</dt>
                                <dd className="text-sm">
                                  {display.currency(total.amount)} /{' '}
                                  {display.number(total.count)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() =>
                      setOffset((previous) => Math.max(0, previous - 50))
                    }
                  >
                    {shared('previousPage')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={offset + 50 >= query.data.matching_banks}
                    onClick={() => setOffset((previous) => previous + 50)}
                  >
                    {shared('nextPage')}
                  </Button>
                </div>
              </>
            )}
          </>
        )
      )}
      {!businessId && <p>{common('noRecordsFound')}</p>}
    </section>
  )
}
