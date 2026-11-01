import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bankService } from '@/features/accounts/services/bank.service'
import type { CustomBankInput } from '@/features/accounts/repositories/bank.repository'
import { Bank } from '@/types'
import { queryKeys } from '@/lib/query-keys'

export function useBanks() {
  return useQuery<Bank[]>({
    queryKey: queryKeys.banks.list(),
    queryFn: () => bankService.getAll(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useBankMutations() {
  const client = useQueryClient()
  const refresh = () =>
    client.invalidateQueries({ queryKey: queryKeys.banks.list() })
  const create = useMutation({
    mutationFn: (input: CustomBankInput) => bankService.create(input),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => bankService.delete(id),
    onSuccess: refresh,
  })
  return { create, remove }
}
