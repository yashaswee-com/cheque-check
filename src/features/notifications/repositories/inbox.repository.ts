import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
} from '@/repositories/base.repository'
import {
  inboxIdSchema,
  inboxListSchema,
  inboxRequestSchema,
  type InboxRequest,
} from '@/validators/notification-inbox'
import { ValidationError, DatabaseError } from '@/lib/errors'

export const inboxRepository = {
  async list(request: InboxRequest) {
    const parsed = inboxRequestSchema.safeParse(request)
    if (!parsed.success)
      throw new ValidationError('Invalid notification filters')
    return parseDatabaseValue(
      unwrapSupabaseResult(
        await createClient().rpc('list_notification_inbox_page', {
          requested_business: request.businessId,
          requested_unread: request.unread,
          requested_ascending: request.ascending,
          requested_page: request.page ?? 0,
          requested_snapshot: request.snapshot,
          requested_match_kinds: request.match?.kinds,
          requested_match_businesses: request.match?.businessIds,
        }),
      ),
      inboxListSchema,
      'notification inbox',
    )
  },
  async count(businessId?: string) {
    if (businessId && !inboxRequestSchema.safeParse({ businessId }).success)
      throw new ValidationError('Invalid business')
    const count = unwrapSupabaseResult(
      await createClient().rpc('count_unread_notifications', {
        requested_business: businessId,
      }),
    )
    if (!Number.isSafeInteger(count) || count < 0)
      throw new DatabaseError('Invalid unread count')
    return count
  },
  async markRead(id: string) {
    if (!inboxIdSchema.safeParse(id).success)
      throw new ValidationError('Invalid notification')
    return unwrapSupabaseResult(
      await createClient().rpc('mark_notifications_read', { requested_id: id }),
    )
  },
  async markAll(snapshot: string, businessId?: string) {
    if (!inboxRequestSchema.safeParse({ snapshot, businessId }).success)
      throw new ValidationError('Invalid notification snapshot')
    return unwrapSupabaseResult(
      await createClient().rpc('mark_notifications_read', {
        requested_snapshot: snapshot,
        requested_business: businessId,
      }),
    )
  },
}
