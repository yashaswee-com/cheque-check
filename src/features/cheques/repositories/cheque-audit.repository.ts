import { type ChequeAuditEvent, type ChequeAuditPage } from '../lib/audit-log'

const PAGE_SIZE = 20

const fallbackEvents: Record<string, ChequeAuditEvent[]> = {
  demo: [
    {
      id: 'evt-demo-1',
      cheque_id: 'demo',
      business_id: 'biz-demo',
      event_type: 'status_changed',
      actor_id: 'user-demo',
      actor_kind: 'user',
      actor_name: 'You',
      created_at: '2026-11-03T11:15:00.000Z',
      changes: [{ field: 'status', before: 'Issued', after: 'Cleared' }],
    },
    {
      id: 'evt-demo-2',
      cheque_id: 'demo',
      business_id: 'biz-demo',
      event_type: 'updated',
      actor_id: 'user-demo',
      actor_kind: 'user',
      actor_name: 'You',
      created_at: '2026-11-02T09:05:00.000Z',
      changes: [
        { field: 'notes', before: 'Awaiting approval', after: 'Approved' },
      ],
    },
    {
      id: 'evt-demo-3',
      cheque_id: 'demo',
      business_id: 'biz-demo',
      event_type: 'created',
      actor_id: 'user-demo',
      actor_kind: 'user',
      actor_name: 'You',
      created_at: '2026-11-01T08:45:00.000Z',
      changes: [{ field: 'record', before: null, after: 'created' }],
    },
  ],
}

export class SupabaseChequeAuditRepository {
  async getByChequeId(
    chequeId: string,
    offset = 0,
    limit = PAGE_SIZE,
  ): Promise<ChequeAuditPage> {
    try {
      const client = (await import('@/lib/supabase/client')).createClient()
      const { data, error } = await client
        .from('cheque_audit_events' as never)
        .select('*')
        .eq('cheque_id', chequeId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      const events = (data ?? []) as ChequeAuditEvent[]
      return {
        events,
        hasMore: events.length === limit,
        nextOffset: offset + events.length,
      }
    } catch {
      const events = fallbackEvents[chequeId] ?? []
      const slice = events.slice(offset, offset + limit)
      return {
        events: slice,
        hasMore: offset + slice.length < events.length,
        nextOffset: offset + slice.length,
      }
    }
  }
}
