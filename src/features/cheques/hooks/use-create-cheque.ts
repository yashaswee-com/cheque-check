import { useState, useEffect, useRef } from 'react'
import {
  reportMarketingBlock,
  notifyMarketingActivity,
} from '@/features/analytics/browser'
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
import {
  buildChequePublication,
  type ChequePublicationOutcome,
} from '../lib/publication'

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
  const uploadingRef = useRef(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useTranslations('Cheques')
  const tc = useTranslations('Common')
  const td = useTranslations('Drafts')
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
        ...buildChequePublication(data, profile?.default_reminder_days ?? null),
        business_id: businessId,
      })
    },
    addToList: (current, newCheque) => {
      if (!businessId) return current

      const optimisticCheque = ChequeEntity.fromRow({
        ...buildChequePublication(
          newCheque,
          profile?.default_reminder_days ?? null,
        ),
        id: optimisticId(),
        business_id: businessId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        party: queryClient
          .getQueryData<Party[]>(queryKeys.parties.list(businessId))
          ?.find((party) => party.id === newCheque.party_id),
      })
      return current ? [optimisticCheque, ...current] : [optimisticCheque]
    },
    onSuccess: (created) =>
      finishPublication({ cheque: created, source: 'direct' }),
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

  async function finishPublication({
    cheque,
    source,
  }: ChequePublicationOutcome) {
    notifyMarketingActivity()
    if (source === 'draft') draft.finishPublish()
    await onCreated?.(cheque)
    if (source === 'draft') {
      for (const queryKey of [
        queryKeys.cheques.list(businessId),
        queryKeys.cheques.pages(businessId),
        queryKeys.cheques.summaries(businessId),
        queryKeys.cheques.analyticsAll(),
        queryKeys.businesses.summaries(),
        queryKeys.premiumWorkspace.all(),
        draftKeys.all(),
      ])
        queryClient.invalidateQueries({ queryKey })
    }
    const actionProps = await buildNotifyPartyAction(
      cheque,
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
    celebrateCheque(cheque)
    setIsSuccess(true)
  }

  function showCreateError(error: unknown) {
    if (error instanceof PlanLimitError) {
      reportMarketingBlock('cheques')
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
      await finishPublication({ cheque: published, source: 'draft' })
    } catch (error) {
      draft.failPublish()
      showCreateError(error)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    if (uploadingRef.current) return null
    if (!businessId || draft.isLoadingDraft) {
      toast.add({
        title: tc('error'),
        description: td('saveFailed'),
        type: 'error',
      })
      return null
    }
    uploadingRef.current = true
    setIsUploading(true)
    try {
      const url = await storageService.uploadChequeImage(file)
      const previousUrl = form.getValues('image_url')
      draft.setUserValue('image_url', url)
      try {
        const draftId = await draft.saveNow()
        if (!draftId) throw new Error('Cheque draft was not saved')
      } catch {
        setValue('image_url', previousUrl)
        toast.add({
          title: tc('error'),
          description: td('saveFailed'),
          type: 'error',
        })
        return null
      }
      return url
    } catch (error) {
      toast.add({
        title: tc('error'),
        description: t('photoUploadFailed'),
        type: 'error',
      })
      return null
    } finally {
      uploadingRef.current = false
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

    if (isValid) setStep((s) => (s === step ? Math.min(s + 1, 3) : s))
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
    isSaving: mutation.isPending || isPublishing || isUploading,
    isSuccess,
    continueAfterSuccess: () => router.push('/cheques'),
    draft,
    onSubmit: form.handleSubmit(async (data) => {
      if (isUploading) return
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
