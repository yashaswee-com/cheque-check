import type { ChequeStatus, ChequeType, ChequeWithRelations } from '@/types'

export const DISTRIBUTION_STATUSES = [
  'Issued',
  'Received',
  'Cleared',
  'Bounced',
] as const satisfies readonly ChequeStatus[]

export type DistributionMetric = 'count' | 'amount'
export type DistributionDirection = 'All' | ChequeType

export function clearanceRate(
  clearedCount: number,
  totalCount: number,
): number | null {
  return totalCount > 0 ? (clearedCount / totalCount) * 100 : null
}

type StatisticsCheque = Pick<
  ChequeWithRelations,
  'status' | 'type' | 'amount' | 'cheque_date' | 'is_draft'
> & { deleted_at?: string | null }

export { localDay } from '@/lib/preference-format'

export function activeStatisticsCheques<T extends StatisticsCheque>(
  cheques: readonly T[] | undefined,
): T[] {
  return (cheques ?? []).filter(
    (cheque) => !cheque.is_draft && !cheque.deleted_at,
  )
}

export function chequeDistribution(
  cheques: readonly StatisticsCheque[] | undefined,
  metric: DistributionMetric = 'count',
  direction: DistributionDirection = 'All',
) {
  const eligible = activeStatisticsCheques(cheques).filter(
    (cheque) => direction === 'All' || cheque.type === direction,
  )
  const slices = DISTRIBUTION_STATUSES.map((status) => ({
    status,
    count: eligible.filter((cheque) => cheque.status === status).length,
    value: eligible
      .filter((cheque) => cheque.status === status)
      .reduce(
        (sum, cheque) => sum + (metric === 'count' ? 1 : cheque.amount),
        0,
      ),
  }))
  return {
    slices,
    total: slices.reduce((sum, slice) => sum + slice.value, 0),
    totalCheques: eligible.length,
    allCleared:
      eligible.length > 0 &&
      eligible.every((cheque) => cheque.status === 'Cleared'),
    hasPending: eligible.some(
      (cheque) => cheque.status === 'Issued' || cheque.status === 'Received',
    ),
  }
}
