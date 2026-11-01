import { describe, expect, it } from 'vitest'
import { parseChequeListUrl } from '@/validators/cheque-list-filters'

describe('URL cheque filters', () => {
  it('round-trips independent ranges, multiple statuses/banks, single party type, decimals and sort', () => {
    const params = new URLSearchParams({
      from: '2026-01-01',
      to: '2026-01-31',
      due_from: '2026-02-01',
      statuses: 'Issued,Received,Cleared',
      party_type: 'unclassified',
      min_amount: '0',
      max_amount: '100.25',
      bank_ids:
        '10000000-0000-4000-8000-000000000001,10000000-0000-4000-8000-000000000002',
      sort: 'amount',
      order: 'asc',
      q: 'Acme',
      source: 'bank',
    })
    expect(parseChequeListUrl(params)).toEqual({
      success: true,
      search: 'Acme',
      sort: 'amount',
      order: 'asc',
      filters: {
        from: '2026-01-01',
        to: '2026-01-31',
        due_from: '2026-02-01',
        due_to: undefined,
        statuses: ['Issued', 'Received', 'Cleared'],
        party_type: 'unclassified',
        min_amount: 0,
        max_amount: 100.25,
        bank_ids: params.get('bank_ids')!.split(','),
      },
    })
  })
  it.each([
    'from=2026-02-30',
    'from=2026-02-02&to=2026-02-01',
    'due_from=2026-02-02&due_to=2026-02-01',
    'min_amount=-1',
    'min_amount=NaN',
    'min_amount=Infinity',
    'min_amount=1.234',
    'min_amount=',
    'min_amount=2&max_amount=1',
    'statuses=Cancelled',
    'statuses=',
    'bank_ids=not-uuid',
    'party_type=other',
    'sort=invalid',
    'order=invalid',
  ])(
    'rejects invalid input without an unfiltered success fallback: %s',
    (query) => {
      expect(parseChequeListUrl(new URLSearchParams(query)).success).toBe(false)
    },
  )
  it('preserves legacy exact-day links and open-ended bounds', () => {
    expect(
      parseChequeListUrl(new URLSearchParams('date=2026-02-01')),
    ).toMatchObject({
      success: true,
      filters: { from: '2026-02-01', to: '2026-02-01' },
    })
    expect(
      parseChequeListUrl(new URLSearchParams('to=2026-02-01&max_amount=0')),
    ).toMatchObject({
      success: true,
      filters: { to: '2026-02-01', max_amount: 0 },
    })
  })
})
