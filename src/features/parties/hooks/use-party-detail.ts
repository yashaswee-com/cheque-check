import { useParty } from './use-party'
import { useRelatedCheques } from '@/features/cheques/hooks/use-related-cheques'

export type { ChequeSortBy as SortBy, SortOrder } from '@/types/cheque-list'

export function usePartyDetail(id: string, businessId: string | undefined) {
  const { data: party, isLoading: partyLoading, error } = useParty(id)
  const {
    relatedCheques,
    isLoading: chequesLoading,
    ...related
  } = useRelatedCheques('party_id', id, businessId)

  return {
    ...related,
    party,
    partyCheques: relatedCheques,
    isLoading: partyLoading || chequesLoading,
    error,
  }
}
