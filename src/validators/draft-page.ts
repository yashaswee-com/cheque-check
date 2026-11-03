import { z } from 'zod'

export const DRAFT_PAGE_SIZE = 50
export const DRAFT_MAX_PAGES = 200
export const DRAFT_SEARCH_MAX = 100
export const draftEntities = ['cheque', 'party', 'account'] as const

const draftRowSchema = z.looseObject({
  id: z.uuid(),
  business_id: z.uuid(),
  updated_at: z.string(),
})

export const draftPageSchema = z.object({
  items: z
    .array(z.object({ entity: z.enum(draftEntities), draft: draftRowSchema }))
    .max(DRAFT_PAGE_SIZE),
  total: z.number().int().min(0),
  page: z.number().int().min(0),
  page_size: z.literal(DRAFT_PAGE_SIZE),
})

export const draftCountsSchema = z.object({
  cheque: z.number().int().min(0),
  party: z.number().int().min(0),
  account: z.number().int().min(0),
})

export const draftPageRequestSchema = z.object({
  businessId: z.uuid(),
  types: z.array(z.enum(draftEntities)).max(draftEntities.length),
  search: z.string().max(DRAFT_SEARCH_MAX),
  ascending: z.boolean(),
  page: z
    .number()
    .int()
    .min(0)
    .max(DRAFT_MAX_PAGES - 1),
})

export type DraftPageRequest = z.infer<typeof draftPageRequestSchema>
export type DraftCounts = z.infer<typeof draftCountsSchema>
