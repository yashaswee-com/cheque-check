import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
} from '@/repositories/base.repository'
import { ValidationError } from '@/lib/errors'
import {
  draftCountsSchema,
  draftPageRequestSchema,
  draftPageSchema,
  type DraftPageRequest,
} from '@/validators/draft-page'
import type { AccountDraft, ChequeDraft, PartyDraft } from '@/types'

export type DraftPageItem =
  | { entity: 'cheque'; draft: ChequeDraft }
  | { entity: 'party'; draft: PartyDraft }
  | { entity: 'account'; draft: AccountDraft }

export interface DraftPage {
  items: DraftPageItem[]
  total: number
  page: number
  page_size: number
}

export const draftPageRepository = {
  async list(request: DraftPageRequest): Promise<DraftPage> {
    if (!draftPageRequestSchema.safeParse(request).success)
      throw new ValidationError('Invalid draft filters')
    return parseDatabaseValue(
      unwrapSupabaseResult(
        await createClient().rpc('list_drafts_page', {
          requested_business: request.businessId,
          requested_types: request.types.length ? request.types : undefined,
          requested_search: request.search.trim() || undefined,
          requested_ascending: request.ascending,
          requested_page: request.page,
        }),
      ),
      draftPageSchema,
      'drafts page',
    ) as DraftPage
  },
  async counts(businessId: string) {
    if (!draftPageRequestSchema.shape.businessId.safeParse(businessId).success)
      throw new ValidationError('Invalid business')
    return parseDatabaseValue(
      unwrapSupabaseResult(
        await createClient().rpc('draft_counts', {
          requested_business: businessId,
        }),
      ),
      draftCountsSchema,
      'draft counts',
    )
  },
}
