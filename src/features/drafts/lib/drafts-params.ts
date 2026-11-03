import {
  DRAFT_MAX_PAGES,
  DRAFT_SEARCH_MAX,
  draftEntities,
} from '@/validators/draft-page'
import type { DraftEntity } from './draft-fields'

export interface DraftsParams {
  type: DraftEntity | null
  search: string
  ascending: boolean
  /** Zero-based page index. */
  page: number
}

export const DRAFTS_PATH = '/drafts'

/** Unknown or malformed values fall back to defaults so shared links never error. */
export function parseDraftsParams(params: {
  get(name: string): string | null
}): DraftsParams {
  const type = params.get('type')
  const page = Number(params.get('page'))
  return {
    type: draftEntities.includes(type as DraftEntity)
      ? (type as DraftEntity)
      : null,
    search: (params.get('q') ?? '').slice(0, DRAFT_SEARCH_MAX),
    ascending: params.get('sort') === 'oldest',
    page:
      Number.isInteger(page) && page >= 1 && page <= DRAFT_MAX_PAGES
        ? page - 1
        : 0,
  }
}

export function draftsHref(next: Partial<DraftsParams> = {}) {
  const query = new URLSearchParams()
  if (next.type) query.set('type', next.type)
  if (next.search?.trim()) query.set('q', next.search.trim())
  if (next.ascending) query.set('sort', 'oldest')
  if (next.page) query.set('page', String(next.page + 1))
  return query.size ? `${DRAFTS_PATH}?${query}` : DRAFTS_PATH
}
