import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { AccountDraft, ChequeDraft, PartyDraft } from '@/types'
import type { DraftEntity } from '../lib/draft-fields'
import { queryKeys } from '@/lib/query-keys'
import {
  accountDraftService,
  chequeDraftService,
  partyDraftService,
} from '../services/draft.service'
import {
  draftPageRepository,
  type DraftPage,
} from '../repositories/draft-page.repository'
import type { DraftPageRequest } from '@/validators/draft-page'

type DraftByEntity = {
  cheque: ChequeDraft
  party: PartyDraft
  account: AccountDraft
}

export const draftServices = {
  cheque: chequeDraftService,
  party: partyDraftService,
  account: accountDraftService,
} as const

export const draftKeys = queryKeys.drafts

export function useDrafts<E extends DraftEntity>(
  entity: E,
  businessId: string | undefined,
) {
  return useQuery({
    queryKey: draftKeys.list(entity, businessId),
    queryFn: () =>
      draftServices[entity].list(businessId!) as Promise<DraftByEntity[E][]>,
    enabled: !!businessId,
  })
}

export function useDraftsPage(
  businessId: string | undefined,
  request: Omit<DraftPageRequest, 'businessId'>,
) {
  return useQuery({
    queryKey: draftKeys.page(businessId, request),
    queryFn: () =>
      draftPageRepository.list({ ...request, businessId: businessId! }),
    enabled: !!businessId,
    placeholderData: keepPreviousData,
  })
}

export function useDraftCounts(businessId: string | undefined) {
  return useQuery({
    queryKey: draftKeys.counts(businessId),
    queryFn: () => draftPageRepository.counts(businessId!),
    enabled: !!businessId,
  })
}

export function useDraft<E extends DraftEntity>(
  entity: E,
  id: string | null | undefined,
) {
  return useQuery({
    queryKey: draftKeys.detail(entity, id),
    queryFn: () =>
      draftServices[entity].getById(id!) as Promise<DraftByEntity[E]>,
    enabled: !!id,
    staleTime: 0,
  })
}

export function useDeleteDraft(
  entity: DraftEntity,
  businessId: string | undefined,
) {
  const queryClient = useQueryClient()
  const listKey = draftKeys.list(entity, businessId)
  const pagesKey = ['drafts', 'page', businessId] as const

  return useMutation({
    mutationFn: (id: string) => draftServices[entity].delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      await queryClient.cancelQueries({ queryKey: pagesKey })
      const previous = queryClient.getQueryData<{ id: string }[]>(listKey)
      const previousPages = queryClient.getQueriesData<DraftPage>({
        queryKey: pagesKey,
      })
      queryClient.setQueryData<{ id: string }[]>(listKey, (current) =>
        current?.filter((draft) => draft.id !== id),
      )
      queryClient.setQueriesData<DraftPage>({ queryKey: pagesKey }, (page) => {
        if (!page?.items.some((item) => item.draft.id === id)) return page
        return {
          ...page,
          items: page.items.filter((item) => item.draft.id !== id),
          total: Math.max(0, page.total - 1),
        }
      })
      return { previous, previousPages }
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(listKey, context?.previous)
      for (const [key, page] of context?.previousPages ?? [])
        queryClient.setQueryData(key, page)
    },
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      queryClient.removeQueries({ queryKey: draftKeys.detail(entity, id) })
    },
  })
}
