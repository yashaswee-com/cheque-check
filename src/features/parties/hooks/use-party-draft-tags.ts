import { useDraftEntityTags } from '@/features/tags/hooks/use-draft-tags'

export function usePartyDraftTags(draftId: string | null) {
  return useDraftEntityTags('party', draftId)
}
