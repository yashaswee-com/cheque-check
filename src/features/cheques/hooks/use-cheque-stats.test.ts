import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ChequeWithRelations } from '@/types'
import { useChequeStats } from './use-cheque-stats'

const cheque = (
  type: 'Outward' | 'Inward',
  amount: number,
  status: ChequeWithRelations['status'],
) =>
  ({
    type,
    amount,
    status,
    cheque_date: '2026-01-01',
  }) as ChequeWithRelations

describe('useChequeStats', () => {
  it('includes only pending cheques in payable and receivable', () => {
    const { result } = renderHook(() =>
      useChequeStats([
        cheque('Outward', 1000, 'Issued'),
        cheque('Outward', 500, 'Bounced'),
        cheque('Outward', 9999, 'Cleared'),
        cheque('Inward', 2000, 'Received'),
        cheque('Inward', 7777, 'Cleared'),
      ]),
    )

    expect(result.current.payable).toBe(1000)
    expect(result.current.receivable).toBe(2000)
    expect(result.current.currentBalance).toBe(1000)
    expect(result.current.issuedCount).toBe(1)
    expect(result.current.receivedCount).toBe(1)
  })

  it('returns zeros without cheques', () => {
    const { result } = renderHook(() => useChequeStats(undefined))
    expect(result.current.currentBalance).toBe(0)
  })

  it('does not count bounced cheques as upcoming or overdue', () => {
    const { result } = renderHook(() =>
      useChequeStats([
        cheque('Outward', 500, 'Bounced'),
        { ...cheque('Inward', 200, 'Cleared'), cheque_date: '2999-01-01' },
      ]),
    )
    expect(result.current.payable).toBe(0)
    expect(result.current.overdueCount).toBe(0)
    expect(result.current.upcomingCount).toBe(0)
  })
})
