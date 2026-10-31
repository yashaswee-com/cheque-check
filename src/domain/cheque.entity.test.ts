import { describe, expect, it } from 'vitest'
import { Cheque } from './cheque.entity'

describe('Cheque entity', () => {
  it('exposes every persisted field and relation and serializes without sharing the row object', () => {
    const row = {
      id: '1',
      business_id: 'b1',
      party_id: 'p1',
      account_id: 'a1',
      cheque_number: '123456',
      amount: 100,
      cheque_date: '2026-10-31',
      deposit_date: '2026-11-01',
      remind_before_days: 3,
      status: 'Received' as const,
      type: 'Inward' as const,
      notes: 'Note',
      image_url: '/private-image',
      created_at: '2026-10-01',
      updated_at: '2026-10-02',
      is_draft: true,
      party: { name: 'Acme', contact: '+919876543210' },
      account: { account_name: 'Main', bank: { name: 'Bank' } },
    }
    const entity = Cheque.fromRow(row)
    expect({
      id: entity.id,
      business_id: entity.business_id,
      party_id: entity.party_id,
      account_id: entity.account_id,
      cheque_number: entity.cheque_number,
      amount: entity.amount,
      cheque_date: entity.cheque_date,
      deposit_date: entity.deposit_date,
      remind_before_days: entity.remind_before_days,
      status: entity.status,
      type: entity.type,
      notes: entity.notes,
      image_url: entity.image_url,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      is_draft: entity.is_draft,
      party: entity.party,
      account: entity.account,
    }).toEqual(row)
    const json = entity.toJSON()
    expect(json).toEqual(row)
    expect(json).not.toBe(row)
    json.notes = 'Modified'
    expect(entity.notes).toBe('Note')
    expect(Cheque.fromRow({ ...row, is_draft: undefined }).is_draft).toBe(false)
    expect(entity.isOverdue('2026-11-02')).toBe(true)
    expect(Cheque.fromRow({ ...row, status: 'Cleared' }).isOverdue()).toBe(
      false,
    )
  })
  it('derives initial statuses by cheque type', () => {
    expect(Cheque.initialStatusFor('Outward')).toBe('Issued')
    expect(Cheque.initialStatusFor('Inward')).toBe('Received')
  })

  it('allows status corrections and blocks no-op or wrong-type transitions', () => {
    const cheque = Cheque.fromRow({
      id: '1',
      business_id: 'b1',
      party_id: 'p1',
      account_id: 'a1',
      cheque_number: '100',
      amount: 100,
      cheque_date: '2025-01-01',
      deposit_date: null,
      remind_before_days: null,
      status: 'Issued',
      type: 'Outward',
      notes: null,
      image_url: null,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    })

    expect(cheque.canTransition('Cleared')).toBe(true)
    expect(cheque.canTransition('Bounced')).toBe(true)
    expect(cheque.canTransition('Issued')).toBe(false)
    expect(cheque.canTransition('Received')).toBe(false)

    const cleared = Cheque.fromRow({
      ...cheque.toJSON(),
      status: 'Cleared',
    })

    expect(cleared.canTransition('Bounced')).toBe(true)
    expect(cleared.canTransition('Issued')).toBe(true)
    expect(cleared.canTransition('Cleared')).toBe(false)
  })

  it('flags overdue cheques when expired and still active', () => {
    const overdue = Cheque.fromRow({
      id: '1',
      business_id: 'b1',
      party_id: 'p1',
      account_id: 'a1',
      cheque_number: '100',
      amount: 100,
      cheque_date: '2024-01-01',
      deposit_date: null,
      remind_before_days: null,
      status: 'Issued',
      type: 'Outward',
      notes: null,
      image_url: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })

    expect(overdue.isOverdue(new Date('2024-01-05T00:00:00.000Z'))).toBe(true)
    expect(overdue.isOverdue(new Date('2023-12-31T00:00:00.000Z'))).toBe(false)
    expect(overdue.displayStatus('2024-01-01')).toBe('Today')
    expect(overdue.displayStatus('2024-01-05')).toBe('Overdue')
    expect(overdue.displayStatus('2023-12-31')).toBe('Upcoming')
    expect(
      Cheque.fromRow({
        ...overdue.toJSON(),
        status: 'Cleared',
      }).displayStatus(),
    ).toBe('Cleared')
    expect(
      Cheque.fromRow({
        ...overdue.toJSON(),
        status: 'Bounced',
      }).displayStatus(),
    ).toBe('Bounced')
  })
})
