import { useQuery } from '@tanstack/react-query'
import { chequeDraftService } from '@/features/drafts/services/draft.service'
import { queryKeys } from '@/lib/query-keys'
import { chequeSchema } from '@/validators'

export function useChequeNumberConflict(
  businessId: string | undefined,
  accountId: string | undefined,
  chequeNumber: string,
  excludeId?: string,
) {
  return useQuery({
    queryKey: queryKeys.cheques.numberConflict(
      businessId,
      accountId,
      chequeNumber,
      excludeId,
    ),
    queryFn: () =>
      chequeDraftService.hasNumberConflict(
        businessId!,
        accountId!,
        chequeNumber,
        excludeId,
      ),
    enabled:
      !!businessId &&
      !!accountId &&
      chequeSchema.shape.cheque_number.safeParse(chequeNumber).success,
  })
}
