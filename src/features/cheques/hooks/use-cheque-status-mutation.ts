import type { ChequeStatus } from '@/types'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { useOptimisticMutation } from '@/hooks/use-optimistic-mutation'
import { queryKeys } from '@/lib/query-keys'
import { chequeService } from '../services/cheque.service'
import { logger } from '@/lib/logger'

export function useChequeStatusMutation(
  businessId: string | undefined,
  onSuccess?: (updated: ChequeEntity) => void | Promise<void>,
) {
  return useOptimisticMutation<
    ChequeEntity[],
    { id: string; status: ChequeStatus },
    ChequeEntity
  >({
    queryKey: queryKeys.cheques.list(businessId),
    additionalMutations: [
      {
        queryKey: ({ id }) => queryKeys.cheques.detail(id),
        update: (current: ChequeEntity | undefined, { id, status }) =>
          current?.id === id
            ? ChequeEntity.fromRow({ ...current.toJSON(), status })
            : current,
      },
    ],
    mutationFn: ({ id, status }) => chequeService.updateStatus(id, status),
    update: (current, { id, status }) =>
      current?.map((cheque) =>
        cheque.id === id
          ? ChequeEntity.fromRow({ ...cheque.toJSON(), status })
          : cheque,
      ),
    onSuccess: (updated) => onSuccess?.(updated),
    onError: (error) => {
      logger.error('Cheque status update failed', error)
    },
  })
}
