import { describe, expect, it } from 'vitest'
import { buildChequePublication } from './publication'

describe('cheque publication input', () => {
  it.each(['Inward', 'Outward'] as const)(
    'normalizes %s publication without mutating form values',
    (type) => {
      const values = {
        cheque_number: '123456',
        amount: 100,
        cheque_date: '2026-11-15',
        deposit_date: '2026-11-16',
        party_id: 'p1',
        account_id: 'a1',
        type,
        notes: '',
        image_url: undefined,
      }
      expect(buildChequePublication(values, null)).toEqual({
        ...values,
        notes: null,
        image_url: null,
        remind_before_days: null,
        status: type === 'Inward' ? 'Received' : 'Issued',
      })
      expect(values.notes).toBe('')
      expect(values.image_url).toBeUndefined()
      expect(
        buildChequePublication(
          { ...values, notes: 'Keep', image_url: '/image' },
          7,
        ),
      ).toMatchObject({
        notes: 'Keep',
        image_url: '/image',
        remind_before_days: 7,
      })
    },
  )
})
