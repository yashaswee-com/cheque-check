'use client'

import { useCreateAccount } from '@/features/accounts/hooks/use-create-account'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Button } from '@/components/ui/button'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { CurrencyPrefixInput } from '@/components/ui/currency-prefix-input'
import { Label } from '@/components/ui/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon as ArrowLeft,
  Tick02Icon as Check,
  CreditCardIcon as CreditCard,
  UserIcon as User,
  HashtagIcon as Hash,
  Invoice01Icon as ReceiptText,
  TextFontIcon as TextIcon,
} from '@hugeicons/core-free-icons'
import {
  ACCOUNT_THEME_COLORS,
  ThemeColorRow,
} from '@/components/ui/theme-color-row'
import { Skeleton } from '@/components/ui/skeleton'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper'
import { useEffect, useState } from 'react'
import { getSafeChequeReturnTo } from '@/lib/cheque-draft'
import { DraftLeaveDialog, DraftSaveFab } from '@/features/drafts'
import { DefaultAccountField } from '@/features/accounts/components/default-account-field'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { tagService } from '@/features/tags/services/tag.service'
import { logger } from '@/lib/logger'
import type { Tag } from '@/types'

const BankSelector = dynamic(
  () => import('@/components/bank-selector').then((mod) => mod.BankSelector),
  {
    loading: () => <Skeleton className="h-14 w-full rounded-2xl" />,
    ssr: false,
  },
)

export default function CreateAccountPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const currency = profile?.currency || '₹'
  const returnTo = getSafeChequeReturnTo(searchParams.get('returnTo'))
  // Read once: autosave later writes a new draftId into the URL for the same form.
  const [initialDraftId] = useState(() => searchParams.get('draftId'))
  const [prefill] = useState(() => ({
    name: searchParams.get('name'),
    number: searchParams.get('number'),
    ifsc: searchParams.get('ifsc'),
    auto: searchParams.get('auto') === 'true',
  }))
  const [tagIds, setTagIds] = useState<string[]>([])
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null)
  const [tagSaveState, setTagSaveState] = useState<
    'idle' | 'pending' | 'error'
  >('idle')
  const saveAccountTags = async (accountId: string) => {
    setTagSaveState('pending')
    try {
      const current = await tagService.getForEntity('account', accountId)
      await tagService.syncForEntity(
        'account',
        accountId,
        current.map((tag: Tag) => tag.id),
        tagIds,
      )
      setTagSaveState('idle')
    } catch (error) {
      logger.error('Created account tags could not be saved', error)
      setTagSaveState('error')
    }
  }

  const {
    form,
    step,
    nextStep,
    prevStep,
    isSaving,
    isSuccess,
    continueAfterSuccess,
    onSubmit,
    draft,
  } = useCreateAccount(activeBusiness?.id, {
    returnTo,
    draftId: initialDraftId,
    onCreated: async (account) => {
      setCreatedAccountId(account.id)
      await saveAccountTags(account.id)
    },
  })

  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form
  const { setUserValue } = draft

  useEffect(() => {
    if (initialDraftId) return
    if (prefill.name) setValue('account_name', prefill.name)
    if (prefill.number) setValue('account_number', prefill.number)
    if (prefill.ifsc) setValue('ifsc_code', prefill.ifsc)
    if (prefill.auto)
      setValue('notes', 'Automatically Generated from Cheque Scan')
  }, [initialDraftId, prefill, setValue])

  if (isSuccess && createdAccountId && tagSaveState !== 'idle') {
    return (
      <div className="max-w-2xl space-y-4">
        <TagSelector
          businessId={activeBusiness?.id}
          value={tagIds}
          onChange={setTagIds}
          saveState={tagSaveState}
          onRetrySave={() => void saveAccountTags(createdAccountId)}
        />
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl">
        <CreationSuccessScreen
          title={t('successTitle')}
          description={t('successDescription')}
          ctaLabel={t('successCta')}
          onContinue={continueAfterSuccess}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3 pb-24">
      {prefill.auto && !initialDraftId && (
        <div className="bg-primary/5 border border-primary/10 rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <p className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <HugeiconsIcon icon={ReceiptText} className="h-4 w-4" />
            Automatically Generated from Cheque Scan
          </p>
        </div>
      )}

      <Stepper
        value={step}
        className="w-full max-w-xl mx-auto space-y-3"
        indicators={{
          completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
        }}
      >
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevStep}
            disabled={step === 1}
            className="rounded-full h-8 w-8 shrink-0 hover:bg-canvas-parchment"
          >
            <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
          </Button>

          <StepperNav className="gap-3 flex-1">
            {[
              {
                title: t('accountInfo'),
                icon: <HugeiconsIcon icon={User} className="size-4" />,
              },
              {
                title: t('bankDetails'),
                icon: <HugeiconsIcon icon={CreditCard} className="size-4" />,
              },
              {
                title: t('moreDetails'),
                icon: <HugeiconsIcon icon={Hash} className="size-4" />,
              },
            ].map((s, index) => (
              <StepperItem
                key={index}
                step={index + 1}
                className="relative flex-1 items-center"
              >
                <StepperTrigger className="flex grow flex-col items-center justify-center gap-2.5">
                  <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-background z-10">
                    {s.icon}
                  </StepperIndicator>
                </StepperTrigger>
                {3 > index + 1 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                )}
              </StepperItem>
            ))}
          </StepperNav>
        </div>
      </Stepper>

      <DraftLeaveDialog {...draft.leaveDialogProps} />

      <form
        id="account-create-form"
        onSubmit={(event) => {
          if (step < 3) {
            event.preventDefault()
            void nextStep()
          } else {
            void onSubmit(event)
          }
        }}
        className="space-y-3"
      >
        {step === 1 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-center">
              <EditableAvatar
                name={watch('account_name') || t('accountName')}
                imageUrl={watch('logo_url')}
                color={watch('color')}
                onUpload={async (url) => setUserValue('logo_url', url)}
                onDelete={async () => setUserValue('logo_url', null)}
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label
                  required
                  htmlFor="account_name"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  {t('accountName')}
                </Label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={User}
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
                  />
                  <Input
                    leftIcon={TextIcon}
                    id="account_name"
                    {...register('account_name')}
                    placeholder={t('accountNamePlaceholder')}
                    className="h-14  bg-canvas-parchment border-none rounded-sm"
                  />
                </div>
                {errors.account_name && (
                  <FieldError>
                    {validationMessage(errors.account_name.message)}
                  </FieldError>
                )}
              </div>

              <ThemeColorRow
                label={tc('themeColor')}
                colors={ACCOUNT_THEME_COLORS}
                value={watch('color')}
                onChange={(color) => setUserValue('color', color)}
                testId="account-theme-color"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                required
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('selectBank')}
              </Label>
              <BankSelector
                value={watch('bank_id')}
                onValueChange={(val) => setUserValue('bank_id', val)}
                className="rounded-sm"
              />
              {errors.bank_id && (
                <FieldError>
                  {validationMessage(errors.bank_id.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="account_number"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('accountNumber')}
              </Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={CreditCard}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
                />
                <Input
                  leftIcon={TextIcon}
                  id="account_number"
                  {...register('account_number')}
                  placeholder={t('accountNumberPlaceholder')}
                  className="h-14  bg-canvas-parchment border-none rounded-sm"
                />
              </div>
              {errors.account_number && (
                <FieldError>
                  {validationMessage(errors.account_number.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="opening_balance"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('openingBalance')}
              </Label>
              <CurrencyPrefixInput
                currency={currency}
                id="opening_balance"
                type="number"
                step="0.01"
                inputMode="decimal"
                {...register('opening_balance', { valueAsNumber: true })}
                placeholder="0.00"
                className="h-14 bg-canvas-parchment border-none rounded-sm"
              />
              {errors.opening_balance && (
                <FieldError>
                  {validationMessage(errors.opening_balance.message)}
                </FieldError>
              )}
            </div>
            <DefaultAccountField
              businessId={activeBusiness?.id}
              accountId={draft.draftId}
              checked={watch('is_default') ?? false}
              onCheckedChange={(checked) => setUserValue('is_default', checked)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                htmlFor="ifsc_code"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('ifscCode')}
              </Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Hash}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
                />
                <Input
                  leftIcon={TextIcon}
                  id="ifsc_code"
                  {...register('ifsc_code')}
                  placeholder={t('ifscPlaceholder')}
                  className="h-14  bg-canvas-parchment border-none uppercase rounded-sm"
                />
              </div>
              {errors.ifsc_code && (
                <FieldError>
                  {validationMessage(errors.ifsc_code.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                {tc('tags')}
              </Label>
              <TagSelector
                businessId={activeBusiness?.id}
                value={tagIds}
                onChange={setTagIds}
                placeholder={tc('addTags')}
                saveState={tagSaveState}
                onRetrySave={
                  createdAccountId
                    ? () => void saveAccountTags(createdAccountId)
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </form>

      <EditSaveBar
        formId="account-create-form"
        label={step < 3 ? tc('continue') : t('addAccount')}
        isContinue={step < 3}
        secondaryAction={
          <DraftSaveFab
            docked
            status={draft.status}
            hasUserChanges={draft.hasUserChanges}
            onSave={() => void draft.saveDraft()}
          />
        }
        disabled={
          step === 1
            ? !watch('account_name')
            : step === 2
              ? !watch('bank_id') || !watch('account_number')
              : false
        }
        isDirty={true}
        isSaving={isSaving || form.formState.isSubmitting}
        testId={
          step < 3 ? `account-step${step}-continue` : 'account-submit-button'
        }
      />
    </div>
  )
}
