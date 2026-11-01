import { z } from 'zod'

export const inboxIdSchema = z.string().regex(/^\d{1,19}$/)
export const inboxItemSchema = z.object({
  id: inboxIdSchema,
  kind: z.enum(['cheque_reminder', 'export_ready', 'export_failed']),
  business_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  read_at: z.iso.datetime({ offset: true }).nullable(),
})
export const inboxPageSchema = z.object({
  items: z.array(inboxItemSchema).max(50),
  next_cursor: inboxIdSchema.nullable(),
  snapshot: inboxIdSchema,
})
export type InboxItem = z.infer<typeof inboxItemSchema>
export interface InboxRequest {
  businessId?: string
  unread?: boolean
  before?: string
  snapshot?: string
}
export const inboxRequestSchema = z.object({
  businessId: z.uuid().optional(),
  unread: z.boolean().optional(),
  before: inboxIdSchema.optional(),
  snapshot: inboxIdSchema.optional(),
})
