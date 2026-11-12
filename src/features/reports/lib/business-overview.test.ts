import { describe, expect, it } from 'vitest'
import type { ChequeWithRelations } from '@/types'
import { buildBusinessOverview } from './business-overview'

function reportCheque(
  overrides: Partial<ChequeWithRelations> = {},
): ChequeWithRelations {
  return {
    id: 'c1',
    business_id: 'b1',
    party_id: 'p1',
    account_id: 'a1',
    cheque_number: '000001',
    amount: 125.5,
    cheque_date: '2026-11-12',
    deposit_date: null,
    type: 'Outward',
    status: 'Issued',
    notes: 'Private internal note',
    image_url: null,
    remind_before_days: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const now = new Date('2026-11-12T12:00:00Z')
const build = (rows: ChequeWithRelations[]) =>
  buildBusinessOverview(rows, now, 'Asia/Kolkata')

describe('business overview metrics', () => {
  it('keeps bounced, cleared and pending exposure separate in each direction', () => {
    const model = build([
      reportCheque({ amount: 0.1, type: 'Inward', status: 'Received' }),
      reportCheque({ amount: 0.2, type: 'Inward', status: 'Received' }),
      reportCheque({ amount: 90 }),
      reportCheque({ amount: 10, type: 'Inward', status: 'Cleared' }),
      reportCheque({ amount: 20, status: 'Cleared' }),
      reportCheque({ amount: 30, type: 'Inward', status: 'Bounced' }),
      reportCheque({ amount: 40, status: 'Bounced' }),
    ])
    expect(model.all).toEqual({ count: 7, inward: 4030, outward: 15000 })
    expect(model.pending).toEqual({ count: 3, inward: 30, outward: 9000 })
    expect(model.cleared).toEqual({ count: 2, inward: 1000, outward: 2000 })
    expect(model.bounced).toEqual({ count: 2, inward: 3000, outward: 4000 })
  })

  it('uses timezone-local today and exact inclusive windows without double counting today', () => {
    const model = buildBusinessOverview(
      [
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-19',
        '2026-11-20',
        '2026-12-12',
        '2026-12-13',
      ].map((cheque_date) => reportCheque({ cheque_date, amount: 1 })),
      new Date('2026-11-11T20:00:00Z'),
      'Asia/Kolkata',
    )
    expect(model.today).toBe('2026-11-12')
    expect(model.overdue.count).toBe(1)
    expect(model.dueToday.count).toBe(1)
    expect(model.upcoming7.count).toBe(2)
    expect(model.upcoming30.count).toBe(4)
    expect(model.pending.count).toBe(7)
    const west = buildBusinessOverview(
      [reportCheque()],
      new Date('2026-11-12T01:00:00Z'),
      'America/Los_Angeles',
    )
    expect(west.today).toBe('2026-11-11')
    expect(west.upcoming7.count).toBe(1)
  })

  it('excludes cleared and bounced cheques from every pending window', () => {
    const model = build([
      reportCheque({ status: 'Bounced', cheque_date: '2026-11-01' }),
      reportCheque({ status: 'Cleared', cheque_date: '2026-11-13' }),
    ])
    for (const key of [
      'overdue',
      'dueToday',
      'upcoming7',
      'upcoming30',
      'pending',
    ] as const)
      expect(model[key].count).toBe(0)
  })

  it('groups parties by identity, not name; banks by safe name; and preserves source order', () => {
    const rows = [
      reportCheque({
        id: 'late',
        cheque_date: '2026-12-01',
        party: { name: 'Same' },
      }),
      reportCheque({
        id: 'early',
        cheque_date: '2026-01-01',
        party_id: 'p2',
        party: { name: 'Same' },
      }),
      reportCheque({
        id: 'cleared',
        status: 'Cleared',
        account: { account_name: 'SECRET', bank: { name: 'Bank A' } },
      }),
    ]
    const model = build(rows)
    expect(model.parties).toHaveLength(2)
    expect(model.parties.every((party) => party.name === 'Same')).toBe(true)
    expect(model.banks).toHaveLength(2)
    expect(model.banks.reduce((n, bank) => n + bank.count, 0)).toBe(3)
    expect(model.rows.map((row) => row.id)).toEqual([
      'early',
      'cleared',
      'late',
    ])
    expect(rows.map((row) => row.id)).toEqual(['late', 'early', 'cleared'])
    expect(model.firstDate).toBe('2026-01-01')
    expect(model.lastDate).toBe('2026-12-01')
  })

  it('compares completed calendar months and fills missing monthly buckets with zero', () => {
    const model = build([
      reportCheque({ cheque_date: '2026-01-01', amount: 1 }),
      reportCheque({ cheque_date: '2026-09-10', amount: 10 }),
      reportCheque({
        cheque_date: '2026-10-10',
        amount: 15,
        status: 'Bounced',
      }),
      reportCheque({ cheque_date: '2026-11-10', amount: 999 }),
      reportCheque({ cheque_date: '2026-12-10', amount: 9999 }),
    ])
    expect(model.months.map((month) => month.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(model.months[0].count).toBe(0)
    expect(model.lastMonth.outward).toBe(1500)
    expect(model.previousMonth.outward).toBe(1000)
    expect(model.outwardChange).toBe(50)
    expect(model.inwardChange).toBeNull()
    expect(model.all.outward).toBe(1102400)
  })

  it('does not imply a reliable comparison from insufficient history or a zero base', () => {
    expect(
      build([
        reportCheque({ cheque_date: '2026-09-15' }),
        reportCheque({ cheque_date: '2026-10-01' }),
      ]).outwardChange,
    ).toBeNull()
    expect(
      build([reportCheque({ cheque_date: '2026-01-01' })]).outwardChange,
    ).toBeNull()
    expect(
      build([reportCheque({ cheque_date: '2026-09-01', amount: 10 })])
        .outwardChange,
    ).toBe(-100)
  })

  it('handles year and leap-day boundaries', () => {
    const leap = buildBusinessOverview(
      [reportCheque({ cheque_date: '2028-03-01' })],
      new Date('2028-02-29T12:00:00Z'),
      'UTC',
    )
    expect(leap.upcoming7.count).toBe(1)
    const january = buildBusinessOverview(
      [reportCheque({ cheque_date: '2025-11-01' })],
      new Date('2026-01-01T12:00:00Z'),
      'UTC',
    )
    expect(january.previousMonth.month).toBe('2025-11')
    expect(january.lastMonth.month).toBe('2025-12')
  })

  it('rejects invalid input explicitly rather than producing a misleading PDF', () => {
    expect(() => build([])).toThrow('No cheques')
    for (const overrides of [
      { amount: NaN },
      { amount: Infinity },
      { amount: -1 },
      { amount: Number.MAX_SAFE_INTEGER },
      { cheque_date: '2026-02-30' },
    ])
      expect(() => build([reportCheque(overrides)])).toThrow('invalid cheque')
    expect(() =>
      build([
        reportCheque({ amount: 60_000_000_000_000 }),
        reportCheque({ amount: 60_000_000_000_000 }),
      ]),
    ).toThrow('precision')
  })
})
