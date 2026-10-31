import { useQuery } from '@tanstack/react-query'
import { chequeDraftService } from '@/features/drafts/services/draft.service'
import { queryKeys } from '@/lib/query-keys'
import { chequeSchema } from '@/validators'

export function useChequeNumberConflict(
  businessId: string | undefined,
  accountId: string | undefined,
  chequeNumber: string,
) {
  return useQuery({
    queryKey: queryKeys.cheques.numberConflict(
      businessId,
      accountId,
      chequeNumber,
    ),
    queryFn: () =>
      chequeDraftService.hasNumberConflict(
        businessId!,
        accountId!,
        chequeNumber,
      ),
    enabled:
      !!businessId &&
      !!accountId &&
      chequeSchema.shape.cheque_number.safeParse(chequeNumber).success,
  })
}
