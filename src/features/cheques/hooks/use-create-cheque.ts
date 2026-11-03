import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { chequeSchema } from '@/validators'
import { chequeService } from '@/features/cheques/services/cheque.service'
import { useRouter } from 'next/navigation'
import { storageService } from '@/services/storage.service'
import { toast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'
import { Party, type ChequeDraft } from '@/types'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { ConflictError, PlanLimitError } from '@/lib/errors'
import { queueCelebration } from '@/lib/celebrate'
import { useEntityCreateMutation } from '@/hooks/use-entity-mutations'
import { useQueryClient } from '@tanstack/react-query'
import {
  chequeDraftService,
  chequeDraftToFormValues,
  draftKeys,
  firstIncompleteChequeStep,
  toChequeDraftFields,
  useDraftController,
} from '@/features/drafts'
import { buildNotifyPartyAction } from '@/features/cheques/lib/notify-party'
import { queryKeys } from '@/lib/query-keys'
import { usePremiumAction } from '@/features/monetization/components/premium-gate'
import { localDay } from '../lib/statistics'

import type { ChequeFormValues } from '@/types'

const optimisticId = () => `temp-${Date.now()}`

export function useCreateCheque(
  businessId: string | undefined,
  initialType: string | null,
  {
    draftId = null,
    onCreated,
    beforePublish,
  }: {
    draftId?: string | null
    onCreated?: (cheque: ChequeEntity) => void | Promise<void>
    beforePublish?: (draftId: string | null) => void | Promise<void>
  } = {},
) {
  const [step, setStep] = useState(1)
  const [isUploading, setIsUploading] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useTranslations('Cheques')
  const tc = useTranslations('Common')
  const { profile } = useProfile()
  const premium = usePremiumAction()

  const form = useForm<ChequeFormValues>({
    resolver: zodResolver(chequeSchema),
    defaultValues: {
      amount: 0,
      cheque_number: '',
      cheque_date: localDay(new Date(), profile?.time_zone),
      party_id: '',
      account_id: '',
      type: initialType === 'Inward' ? 'Inward' : 'Outward',
      notes: '',
      image_url: null,
      deposit_date: localDay(new Date(), profile?.time_zone),
    },
  })

  const { setValue, trigger } = form

  const draft = useDraftController<ChequeFormValues, ChequeDraft>({
    entity: 'cheque',
    businessId,
    form,
    initialDraftId: draftId,
    toFields: (values) => ({
      ...toChequeDraftFields(values),
      // A resumed/duplicated draft already owns its persisted reminder setting.
      ...(!draftId
        ? { remind_before_days: profile?.default_reminder_days ?? null }
        : {}),
    }),
    toFormValues: (draft) =>
      chequeDraftToFormValues(
        draft,
        localDay(new Date(), profile?.time_zone || 'Asia/Kolkata'),
      ),
    onHydrated: (loaded) => setStep(firstIncompleteChequeStep(loaded)),
    draftsHref: '/drafts?type=cheque',
  })

  useEffect(() => {
    if (initialType === 'Inward' || initialType === 'Outward') {
      setValue('type', initialType)
    }
  }, [initialType, setValue])

  const mutation = useEntityCreateMutation<
    ChequeEntity,
    ChequeFormValues,
    ChequeEntity
  >({
    queryKey: queryKeys.cheques.list(businessId),
    mutationFn: (data: ChequeFormValues) => {
      if (!businessId)
        throw new Error('Select a business before creating a cheque')

      return chequeService.create({
        ...data,
        business_id: businessId,
        image_url: data.image_url ?? null,
        notes: data.notes || null,
        remind_before_days: profile?.default_reminder_days ?? null,
        status: ChequeEntity.initialStatusFor(data.type),
      })
    },
    addToList: (current, newCheque) => {
      if (!businessId) return current

      const optimisticCheque = ChequeEntity.fromRow({
        ...newCheque,
        id: optimisticId(),
        business_id: businessId,
        image_url: newCheque.image_url ?? null,
        notes: newCheque.notes || null,
        remind_before_days: profile?.default_reminder_days ?? null,
        status: ChequeEntity.initialStatusFor(newCheque.type),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        party: queryClient
          .getQueryData<Party[]>(queryKeys.parties.list(businessId))
          ?.find((party) => party.id === newCheque.party_id),
      })
      return current ? [optimisticCheque, ...current] : [optimisticCheque]
    },
    onSuccess: async (created) => {
      await onCreated?.(created)
      const actionProps = await buildNotifyPartyAction(
        created,
        profile,
        t('notifyParty'),
        premium.canUse('notify-party'),
        premium.accessRequiredMessage,
      )
      toast.add({
        title: tc('success'),
        description: t('chequeCreated'),
        type: 'success',
        actionProps,
      })
      celebrateCheque(created)
      setIsSuccess(true)
    },
    onError: (error) => {
      draft.failPublish()
      showCreateError(error)
    },
  })

  function celebrateCheque(cheque: ChequeEntity | undefined) {
    queueCelebration({
      target: '/cheques',
      cheque: cheque && businessId ? { id: cheque.id, businessId } : undefined,
    })
  }

  function showCreateError(error: unknown) {
    if (error instanceof PlanLimitError) {
      premium.requireAccess('unlimited-cheques')
      return
    }
    if (error instanceof ConflictError) {
      toast.add({
        title: tc('error'),
        description: t('duplicateChequeError'),
        type: 'error',
      })
      return
    }
    toast.add({
      title: tc('error'),
      description: error instanceof Error ? error.message : tc('error'),
      type: 'error',
    })
  }

  const publishDraft = async (id: string, data: ChequeFormValues) => {
    setIsPublishing(true)
    try {
      const published = await chequeDraftService.publish(
        id,
        data,
        profile?.default_reminder_days ?? null,
      )
      draft.finishPublish()
      await onCreated?.(published)
      queryClient.invalidateQueries({
        queryKey: queryKeys.cheques.list(businessId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.cheques.pages(businessId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.cheques.summaries(businessId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.cheques.analyticsAll(),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.businesses.summaries(),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.premiumWorkspace.all(),
      })
      queryClient.invalidateQueries({
        queryKey: draftKeys.all(),
      })
      const actionProps = await buildNotifyPartyAction(
        published,
        profile,
        t('notifyParty'),
        premium.canUse('notify-party'),
        premium.accessRequiredMessage,
      )
      toast.add({
        title: tc('success'),
        description: t('chequeCreated'),
        type: 'success',
        actionProps,
      })
      celebrateCheque(published)
      setIsSuccess(true)
    } catch (error) {
      draft.failPublish()
      showCreateError(error)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const url = await storageService.uploadChequeImage(file)
      setValue('image_url', url)
      return url
    } catch (error) {
      alert(
        'Upload failed: ' +
          (error instanceof Error ? error.message : String(error)),
      )
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const nextStep = async () => {
    let isValid = false
    if (step === 1) {
      isValid = await trigger(['amount', 'cheque_number'])
    } else if (step === 2) {
      isValid = await trigger(['party_id', 'account_id'])
    }

    if (isValid) setStep((s) => Math.min(s + 1, 3))
  }

  const prevStep = () => setStep((s) => Math.max(s - 1, 1))

  return {
    form,
    step,
    setStep,
    nextStep,
    prevStep,
    isUploading,
    handleImageUpload,
    isSaving: mutation.isPending || isPublishing,
    isSuccess,
    continueAfterSuccess: () => router.push('/cheques'),
    draft,
    onSubmit: form.handleSubmit(async (data) => {
      if (data.type === 'Inward' && !premium.requireAccess('inward-tracking'))
        return
      const publishedDraftId = await draft.beginPublish()
      try {
        await beforePublish?.(publishedDraftId)
      } catch (error) {
        draft.failPublish()
        showCreateError(error)
        return
      }
      if (publishedDraftId) {
        await publishDraft(publishedDraftId, data)
        return
      }
      draft.finishPublish()
      await mutation.mutateAsync(data)
    }),
  }
}
