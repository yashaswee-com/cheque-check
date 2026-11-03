import { partySchema } from '@/validators'
import {
  PartyService,
  partyService,
} from '@/features/parties/services/party.service'
import { useRouter } from 'next/navigation'
import type { Party, PartyFormData } from '@/types'
import {
  useEntityEditor,
  type EditEntityOptions,
} from '@/hooks/use-entity-editor'
import { useEntityMutations } from '@/hooks/use-entity-mutations'
import { queryKeys } from '@/lib/query-keys'

export function useEditParty(
  id: string,
  businessId: string | undefined,
  options: EditEntityOptions = {},
) {
  const router = useRouter()

  const {
    entity: party,
    isLoading,
    error,
    form,
  } = useEntityEditor<Party, PartyFormData>({
    queryKey: queryKeys.parties.detail(id),
    fetchFn: () => partyService.getById(id),
    schema: partySchema,
    defaultValues: {
      name: '',
      contact: '',
      email: '',
      address: '',
      notes: '',
      color: '#007AFF',
      avatar_url: null,
      party_type: null,
    },
    toFormValues: (party) => ({
      name: party.name,
      contact: party.contact,
      email: party.email || '',
      address: party.address || '',
      notes: party.notes || '',
      color: party.color,
      avatar_url: party.avatar_url || null,
      party_type: party.party_type ?? null,
    }),
  })

  const { updateMutation, deleteMutation } = useEntityMutations<
    Party,
    Parameters<PartyService['update']>[1],
    Party
  >({
    listQueryKey: queryKeys.parties.list(businessId),
    detailQueryKey: queryKeys.parties.detail(id),
    update: {
      mutationFn: (data) => partyService.update(id, data),
      updateList: (current, newParty) =>
        current?.map((party) =>
          party.id === id ? { ...party, ...newParty } : party,
        ),
    },
    remove: {
      mutationFn: () => partyService.delete(id),
      updateList: (current) => current?.filter((party) => party.id !== id),
    },
  })

  return {
    form,
    party,
    isLoading,
    error,
    isSaving: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    onSubmit: form.handleSubmit(async (data) => {
      await updateMutation.mutateAsync(data)
      if (options.onSaved) options.onSaved()
      else router.back()
    }),
    onDelete: () => {
      deleteMutation.mutate()
      router.push('/parties')
    },
  }
}
