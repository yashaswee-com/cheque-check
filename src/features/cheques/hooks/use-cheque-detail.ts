import { useQuery } from '@tanstack/react-query'
import { chequeService } from '@/features/cheques/services/cheque.service'
import { ChequeStatus } from '@/types'
import { useChequeStatusMutation } from './use-cheque-status-mutation'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { buildNotifyPartyAction } from '@/features/cheques/lib/notify-party'
import { toast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'
import { queryKeys } from '@/lib/query-keys'
import { usePremiumAccess } from '@/features/monetization/hooks/use-premium-access'

export function useChequeDetail(id: string) {
  const { profile } = useProfile()
  const premium = usePremiumAccess()
  const t = useTranslations('Cheques')
  const tc = useTranslations('Common')
  const tp = useTranslations('Premium')

  const {
    data: cheque,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.cheques.detail(id),
    queryFn: () => chequeService.getById(id),
  })

  const mutation = useChequeStatusMutation(
    cheque?.business_id,
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
        description: t('statusUpdated', {
          status: tc(updated.status.toLowerCase()),
        }),
        type: 'success',
        actionProps,
      })
    },
  )

  const updateStatus = (status: ChequeStatus) => {
    mutation.mutate({ id, status })
  }

  return {
    cheque,
    isLoading,
    error,
    updateStatus,
    isUpdating: mutation.isPending,
  }
}
