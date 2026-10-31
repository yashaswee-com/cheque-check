import { chequeService } from '@/features/cheques/services/cheque.service'
import { ChequeStatus } from '@/types'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useOptimisticMutation } from '@/hooks/use-optimistic-mutation'
import { buildNotifyPartyAction } from '@/features/cheques/lib/notify-party'
import { toast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'
import { queryKeys } from '@/lib/query-keys'
import { usePremiumAccess } from '@/features/monetization/hooks/use-premium-access'
import { useChequeStatusMutation } from './use-cheque-status-mutation'

export function useChequeActions() {
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const premium = usePremiumAccess()
  const t = useTranslations('Cheques')
  const tc = useTranslations('Common')
  const tp = useTranslations('Premium')

  const updateStatusMutation = useChequeStatusMutation(
    activeBusiness?.id,
    async (updated) => {
      const actionProps = await buildNotifyPartyAction(
        updated,
        profile,
        t('notifyParty'),
        premium.canUse('notify-party'),
        tp('states.free'),
      )
      toast.add({
        title: tc('success'),
        description: t('statusUpdated', { status: updated.status }),
        type: 'success',
        actionProps,
      })
    },
  )

  const deleteMutation = useOptimisticMutation<ChequeEntity[], string, void>({
    queryKey: queryKeys.cheques.list(activeBusiness?.id),
    mutationFn: (id: string) => chequeService.delete(id),
    update: (current, id) => {
      if (!current) return current
      return current.filter((cheque) => cheque.id !== id)
    },
  })

  const updateStatus = (id: string, status: ChequeStatus) => {
    updateStatusMutation.mutate({ id, status })
  }

  const deleteCheque = (id: string) => {
    deleteMutation.mutate(id)
  }

  return {
    updateStatus,
    deleteCheque,
    isUpdating: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
