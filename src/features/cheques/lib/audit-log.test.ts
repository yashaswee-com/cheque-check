import { describe, expect, it } from 'vitest'
import { describeAuditChange, getAuditEventTitle } from './audit-log'

describe('cheque audit log utilities', () => {
  it('formats field changes into readable labels', () => {
    expect(
      describeAuditChange({
        field: 'status',
        before: 'Issued',
        after: 'Cleared',
      }),
    ).toEqual({
      label: 'Status',
      before: 'Issued',
      after: 'Cleared',
    })

    expect(
      describeAuditChange({
        field: 'amount',
        before: 1200,
        after: 1500,
      }),
    ).toEqual({
      label: 'Amount',
      before: '1,200',
      after: '1,500',
    })
  })

  it('maps event types to human-friendly titles', () => {
    expect(getAuditEventTitle({ event_type: 'status_changed' })).toBe(
      'Status changed',
    )
    expect(getAuditEventTitle({ event_type: 'created' })).toBe('Recorded')
  })
})
