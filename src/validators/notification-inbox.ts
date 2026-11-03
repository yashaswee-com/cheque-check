import { z } from 'zod'

export const INBOX_PAGE_SIZE = 50
export const INBOX_MAX_PAGES = 200
export const inboxKinds = [
  'cheque_reminder',
  'export_ready',
  'export_failed',
] as const
export type InboxKind = (typeof inboxKinds)[number]
export const inboxIdSchema = z.string().regex(/^\d{1,19}$/)
export const inboxItemSchema = z.object({
  id: inboxIdSchema,
  kind: z.enum(inboxKinds),
  business_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  read_at: z.iso.datetime({ offset: true }).nullable(),
})
export const inboxPageSchema = z.object({
  items: z.array(inboxItemSchema).max(50),
  next_cursor: inboxIdSchema.nullable(),
  snapshot: inboxIdSchema,
})
export const inboxListSchema = z.object({
  items: z.array(inboxItemSchema).max(INBOX_PAGE_SIZE),
  total: z.number().int().min(0),
  page: z.number().int().min(0),
  page_size: z.literal(INBOX_PAGE_SIZE),
  snapshot: inboxIdSchema,
})
export type InboxItem = z.infer<typeof inboxItemSchema>
export type InboxList = z.infer<typeof inboxListSchema>
/** Search terms resolved to the event kinds and businesses they name; a row matches either list. */
export interface InboxMatch {
  kinds: InboxKind[]
  businessIds: string[]
}
export interface InboxRequest {
  businessId?: string
  unread?: boolean
  ascending?: boolean
  page?: number
  snapshot?: string
  match?: InboxMatch
}
export const inboxRequestSchema = z.object({
  businessId: z.uuid().optional(),
  unread: z.boolean().optional(),
  ascending: z.boolean().optional(),
  page: z
    .number()
    .int()
    .min(0)
    .max(INBOX_MAX_PAGES - 1)
    .optional(),
  snapshot: inboxIdSchema.optional(),
  match: z
    .object({
      kinds: z.array(z.enum(inboxKinds)).max(inboxKinds.length),
      businessIds: z.array(z.uuid()).max(100),
    })
    .optional(),
})
