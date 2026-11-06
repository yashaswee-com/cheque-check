export type ChequeAuditEventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'tags_changed'
  | 'image_changed'
  | 'deleted'
  | 'restored'

export type ChequeAuditActorKind = 'user' | 'admin' | 'system'

export interface ChequeAuditChange {
  field: string
  before: unknown
  after: unknown
}

export interface ChequeAuditEvent {
  id: string
  cheque_id: string
  business_id: string
  event_type: ChequeAuditEventType
  changes: ChequeAuditChange[]
  actor_id: string | null
  actor_kind: ChequeAuditActorKind
  actor_name?: string | null
  created_at: string
}

export interface ChequeAuditPage {
  events: ChequeAuditEvent[]
  hasMore: boolean
  nextOffset: number
}

const fieldLabels: Record<string, string> = {
  amount: 'Amount',
  cheque_number: 'Cheque number',
  cheque_date: 'Cheque date',
  deposit_date: 'Deposit date',
  party_id: 'Party',
  account_id: 'Account',
  status: 'Status',
  type: 'Type',
  notes: 'Notes',
  image_url: 'Document',
  deleted_at: 'Deleted',
  is_draft: 'Draft state',
  record: 'Record',
}

export const CHEQUE_AUDIT_EVENT_LABELS: Record<ChequeAuditEventType, string> = {
  created: 'Recorded',
  updated: 'Updated',
  status_changed: 'Status changed',
  tags_changed: 'Tags updated',
  image_changed: 'Document updated',
  deleted: 'Deleted',
  restored: 'Restored',
}

export function describeAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number')
    return new Intl.NumberFormat('en-IN').format(value)
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function describeAuditChange(change: ChequeAuditChange): {
  label: string
  before: string
  after: string
} {
  const label = fieldLabels[change.field] ?? change.field
  return {
    label,
    before: describeAuditValue(change.before),
    after: describeAuditValue(change.after),
  }
}

export function getAuditEventTitle(
  event: Pick<ChequeAuditEvent, 'event_type'>,
) {
  return CHEQUE_AUDIT_EVENT_LABELS[event.event_type] ?? 'Updated'
}
