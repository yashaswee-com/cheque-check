import type { AnalyticsMetric } from '@/validators/cheque-analytics'
import type { ChequeType } from '@/types'

export function analyticsTotals(
  rows: readonly AnalyticsMetric[],
  type: ChequeType,
) {
  const eligible = rows.filter((row) => row.type === type)
  const sum = (
    field:
      | 'cheque_count'
      | 'total_amount'
      | 'today_count'
      | 'today_amount'
      | 'overdue_count'
      | 'overdue_amount',
    statuses?: string[],
  ) =>
    eligible
      .filter((row) => !statuses || statuses.includes(row.status))
      .reduce((total, row) => total + row[field], 0)
  return [
    {
      key: 'pending',
      count: sum('cheque_count', ['Issued', 'Received']),
      amount: sum('total_amount', ['Issued', 'Received']),
    },
    {
      key: 'cleared',
      count: sum('cheque_count', ['Cleared']),
      amount: sum('total_amount', ['Cleared']),
    },
    {
      key: 'overdue',
      count: sum('overdue_count'),
      amount: sum('overdue_amount'),
    },
    { key: 'dueToday', count: sum('today_count'), amount: sum('today_amount') },
  ] as const
}
