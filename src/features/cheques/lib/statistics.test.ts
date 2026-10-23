import { describe, expect, it } from 'vitest'
import type { ChequeStatus, ChequeType } from '@/types'
import { chequeDistribution, localDay } from './statistics'

const row = (
  status: ChequeStatus,
  amount: number,
  type: ChequeType = 'Outward',
) => ({
  status,
  amount,
  type,
  cheque_date: '2026-10-21',
})

describe('chequeDistribution', () => {
  const cheques = [
    row('Issued', 100),
    row('Received', 200, 'Inward'),
    row('Cleared', 300),
    row('Bounced', 400),
  ]

  it('partitions count and amount exactly once', () => {
    expect(
      chequeDistribution(cheques).slices.map((slice) => slice.value),
    ).toEqual([1, 1, 1, 1])
    expect(chequeDistribution(cheques).total).toBe(4)
    const amounts = chequeDistribution(cheques, 'amount')
    expect(amounts.slices.map((slice) => slice.value)).toEqual([
      100, 200, 300, 400,
    ])
    expect(amounts.total).toBe(1000)
  })

  it('applies direction and excludes drafts and deleted data', () => {
    const data = [
      ...cheques,
      { ...row('Issued', 50), is_draft: true },
      { ...row('Cleared', 70), deleted_at: '2026-10-21' },
    ]
    expect(chequeDistribution(data).totalCheques).toBe(4)
    expect(chequeDistribution(data, 'amount', 'Inward').total).toBe(200)
    expect(chequeDistribution(data, 'count', 'Outward').totalCheques).toBe(3)
  })

  it('distinguishes all cleared, bounced-only and empty sets', () => {
    const cleared = chequeDistribution([
      row('Cleared', 100),
      row('Cleared', 200),
    ])
    expect(cleared.allCleared).toBe(true)
    expect(
      cleared.slices.find((slice) => slice.status === 'Cleared')?.value,
    ).toBe(cleared.total)
    expect(chequeDistribution([row('Bounced', 100)]).allCleared).toBe(false)
    expect(chequeDistribution([row('Bounced', 100)]).hasPending).toBe(false)
    expect(chequeDistribution([]).allCleared).toBe(false)
    expect(chequeDistribution(undefined).total).toBe(0)
    expect(chequeDistribution([row('Issued', 0)], 'amount').total).toBe(0)
  })
})

describe('localDay', () => {
  it('uses the profile time zone at midnight boundaries', () => {
    const now = new Date('2026-10-20T20:00:00Z')
    expect(localDay(now, 'Asia/Kolkata')).toBe('2026-10-21')
    expect(localDay(now, 'America/New_York')).toBe('2026-10-20')
  })
})
