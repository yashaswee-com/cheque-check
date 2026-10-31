import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { partyService } from '../services/party.service'

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.parties.detail(id),
    queryFn: () => partyService.getById(id!),
    enabled: !!id,
  })
}
