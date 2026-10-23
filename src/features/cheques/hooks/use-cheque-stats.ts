import { ChequeWithRelations } from '@/types'
import { useMemo } from 'react'
import {
  activeStatisticsCheques,
  localDay,
} from '@/features/cheques/lib/statistics'

export function useChequeStats(
  cheques: ChequeWithRelations[] | undefined,
  timeZone?: string,
) {
  const todayDate = localDay(new Date(), timeZone)
  return useMemo(() => {
    const active = activeStatisticsCheques(cheques)
    const todayCheques = active.filter((c) => c.cheque_date === todayDate)
    const pending = active.filter(
      (c) => c.status === 'Issued' || c.status === 'Received',
    )
    const payable = pending
      .filter((c) => c.type === 'Outward')
      .reduce((acc, c) => acc + c.amount, 0)
    const receivable = pending
      .filter((c) => c.type === 'Inward')
      .reduce((acc, c) => acc + c.amount, 0)
    const currentBalance = receivable - payable

    const issuedCount = active.filter((c) => c.status === 'Issued').length
    const receivedCount = active.filter((c) => c.status === 'Received').length
    const clearedCount = active.filter((c) => c.status === 'Cleared').length
    const bouncedCount = active.filter((c) => c.status === 'Bounced').length

    const upcomingCount = pending.filter(
      (c) => c.cheque_date > todayDate,
    ).length
    const overdueCount = pending.filter((c) => c.cheque_date < todayDate).length

    return {
      todayCheques,
      outstanding: payable - receivable,
      payable,
      receivable,
      currentBalance,
      issuedCount,
      receivedCount,
      clearedCount,
      bouncedCount,
      upcomingCount,
      overdueCount,
    }
  }, [cheques, todayDate])
}
