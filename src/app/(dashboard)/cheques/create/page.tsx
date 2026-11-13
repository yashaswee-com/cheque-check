'use client'

import { useCreateCheque } from '@/features/cheques/hooks/use-create-cheque'
import { useParties } from '@/features/parties/hooks/use-parties'
import { useAccounts } from '@/features/accounts/hooks/use-accounts'
import { Button } from '@/components/ui/button'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { FieldError } from '@/components/ui/field-error'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { DigitSlotsInput } from '@/components/ui/digit-slots-input'
import { Controller } from 'react-hook-form'
import { DateInput } from '@/components/ui/date-input'
import { DueDatePresets } from '@/features/cheques/components/due-date-presets'
import { CurrencyPrefixInput } from '@/components/ui/currency-prefix-input'
import { Label } from '@/components/ui/label'
import { useSearchParams } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon as ArrowLeft,
  Tick02Icon as Check,
  Camera01Icon as Camera,
  Cancel01Icon as X,
  ArrowUpRight01Icon as ArrowUpRight,
  ArrowDownLeft01Icon as ArrowDownLeft,
  Invoice01Icon as ReceiptText,
  UserIcon as User,
  CreditCardIcon as CreditCard,
  BankIcon as Bank,
  Delete02Icon as Trash,
  Calendar03Icon as Calendar,
  Note01Icon as Note,
} from '@hugeicons/core-free-icons'
import { cn, numberToIndianWords } from '@/lib/utils'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { Combobox } from '@/components/ui/combobox'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'
import { useLocale, useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { useState, useEffect, useRef } from 'react'
import { useBanks } from '@/features/accounts/hooks/use-banks'
import { useChequeNumberConflict } from '@/features/cheques/hooks/use-cheque-number-conflict'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Account, Party } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { BankSelector } from '@/components/bank-selector'
import { ScanStore } from '@/lib/scan-store'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import {
  PremiumTab,
  PremiumTabs,
} from '@/features/monetization/components/premium-controls'
import { buildChequeReturnTo } from '@/lib/cheque-draft'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { useDraftTags } from '@/features/tags/hooks/use-draft-tags'
import { useOcrExtraction } from '@/features/cheques/hooks/use-ocr-extraction'
import { DraftLeaveDialog, DraftSaveFab } from '@/features/drafts'
import { logger } from '@/lib/logger'

export default function CreateChequePage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Cheques')
  const locale = useLocale()
  const tCommon = useTranslations('Common')
  const tDrafts = useTranslations('Drafts')
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')
  const imageUrlParam = searchParams.get('imageUrl')
  // Computed once at mount: whether the user arrived here from scanning/OCR,
  // so the photo widget can be shown first instead of buried at the bottom.
  const [cameFromScan] = useState(() => !!imageUrlParam || ScanStore.hasFile())
  // Read once: autosave later writes a new draftId into the URL for the same form.
  const [initialDraftId] = useState(() => searchParams.get('draftId'))
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [createdChequeId, setCreatedChequeId] = useState<string | null>(null)
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id
  const { profile } = useProfile()
  const currency = profile?.currency || '₹'
  const display = useDisplayFormat(profile)
  const { data: banks } = useBanks()

  const {
    form,
    step,
    nextStep,
    prevStep,
    isUploading,
    handleImageUpload,
    isSaving,
    isSuccess,
    continueAfterSuccess,
    onSubmit,
    draft,
  } = useCreateCheque(businessId, typeParam, {
    draftId: initialDraftId,
    beforePublish: (id) => draftTags.flush(id),
    onCreated: async (cheque) => {
      setCreatedChequeId(cheque.id)
      try {
        await draftTags.flush(cheque.id)
      } catch (error) {
        logger.error('Created cheque tags could not be saved', error)
      }
    },
  })
  const draftTags = useDraftTags(draft.draftId)
  const { tagIds, setTagIds } = draftTags

  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form
  const { setUserValue } = draft

  const openCreatePage = (path: string, params: Record<string, string> = {}) =>
    draft.navigateAfterSave(
      (id) =>
        `${path}?${new URLSearchParams({ ...params, returnTo: buildChequeReturnTo(id) })}`,
    )

  const chequeNumber = watch('cheque_number') ?? ''
  const selectedAccountId = watch('account_id')
  const { data: hasNumberConflict } = useChequeNumberConflict(
    businessId,
    selectedAccountId,
    chequeNumber,
  )
  const numberConflictWarning = (
    <p
      className={cn(
        'text-xs text-amber-600 ml-1 min-h-4',
        !hasNumberConflict && 'invisible',
      )}
    >
      {hasNumberConflict ? tDrafts('duplicateNumber') : '\u00A0'}
    </p>
  )

  const { parties } = useParties(businessId)
  const { accounts } = useAccounts(businessId)

  useEffect(() => {
    if (!watch('account_id')) {
      const defaultAccount = accounts?.find((account) => account.is_default)
      if (defaultAccount) setValue('account_id', defaultAccount.id)
    }
  }, [accounts, setValue, watch])

  const {
    isExtracting,
    unmatchedEntities,
    setUnmatchedEntities,
    createOptions,
    setCreateOptions,
    isCreatingInline,
    extractData,
    handleInlineCreate,
  } = useOcrExtraction({
    businessId,
    imageUrlParam,
    parties,
    accounts,
    banks,
    watch,
    setValue,
    handleImageUpload,
    isLoadingDraft: draft.isLoadingDraft,
    aiScanEnabled: profile ? profile.ai_scan_enabled !== false : undefined,
  })

  const partyOptions =
    parties?.map((p: Party) => ({
      label: p.name,
      value: p.id,
      color: (p as any).color,
      icon: (p as any).icon,
      imageUrl: (p as any).avatar_url,
    })) || []

  const accountOptions =
    accounts?.map((b: Account) => ({
      label: `${b.bank?.name || tCommon('bank')} (${b.account_number.slice(-4)})`,
      value: b.id,
      color: b.color,
      icon: b.icon,
      imageUrl: b.logo_url ?? b.bank?.logo_url,
    })) || []

  const selectedParty = parties?.find((p: Party) => p.id === watch('party_id'))
  const selectedAccount = accounts?.find(
    (a: Account) => a.id === watch('account_id'),
  )

  const amountInWords = numberToIndianWords(
    watch('amount') || 0,
    currency,
    locale,
  )

  const photoWidget = (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
        {t('photo')}
      </Label>
      {profile?.ai_scan_enabled === false && (
        <p className="text-xs text-muted-foreground" role="status">
          {t('aiScanDisabledHelp')}
        </p>
      )}
      <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 bg-canvas-parchment/30 min-h-[140px] transition-colors hover:bg-canvas-parchment/50 border-primary/10 relative overflow-hidden">
        {watch('image_url' as any) ? (
          <div className="relative w-full aspect-video rounded-sm overflow-hidden border">
            <SkeletonImage
              src={watch('image_url' as any)}
              alt="Cheque"
              containerClassName="h-full w-full"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => setUserValue('image_url', null)}
              className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black transition-colors z-20"
            >
              <HugeiconsIcon icon={X} className="h-4 w-4" />
            </button>
            {isExtracting && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-10 animate-in fade-in duration-300">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Spinner className="size-7" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-semibold text-primary block">
                    {t('loading')}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                    {t('photoInstruction')}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full flex-col gap-3 border-0 px-0 py-6 hover:bg-transparent active:scale-100"
              aria-label={t('scanUpload')}
              loading={isUploading || isExtracting}
              onClick={() => photoInputRef.current?.click()}
            >
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={Camera} className="h-7 w-7" />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold text-primary block">
                  {t('scanUpload')}
                </span>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                  {t('photoInstruction')}
                </p>
              </div>
            </Button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) {
                  const url = await handleImageUpload(file)
                  if (url) extractData(url)
                }
              }}
              disabled={isUploading || isExtracting}
            />
          </div>
        )}
      </div>
    </div>
  )

  if (isSuccess && draftTags.saveState !== 'idle' && createdChequeId) {
    return (
      <div className="max-w-2xl space-y-4">
        <TagSelector
          businessId={businessId}
          value={tagIds}
          onChange={setTagIds}
          saveState={draftTags.saveState}
          onRetrySave={() => void draftTags.retry(createdChequeId)}
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
      <div className="flex flex-col gap-3">
        <Stepper
          value={step}
          className="w-full max-w-xl mx-auto space-y-3"
          indicators={{
            completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
          }}
        >
          <div className="flex items-start gap-4">
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
                  title: t('scanDetails'),
                  icon: <HugeiconsIcon icon={Camera} className="size-4" />,
                },
                {
                  title: t('entities'),
                  icon: <HugeiconsIcon icon={User} className="size-4" />,
                },
                {
                  title: t('datesReview'),
                  icon: <HugeiconsIcon icon={ReceiptText} className="size-4" />,
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
      </div>

      <DraftLeaveDialog {...draft.leaveDialogProps} />

      <form
        id="cheque-create-form"
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
            {cameFromScan && photoWidget}

            <div className="space-y-2">
              <Label
                required
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('type')}
              </Label>
              <PremiumTabs
                featureByValue={{ Inward: 'inward-tracking' }}
                value={watch('type')}
                onValueChange={(value) => {
                  setUserValue('type', value as 'Outward' | 'Inward')
                }}
              >
                <TabsList className="h-14 w-full rounded-lg bg-canvas-parchment p-1">
                  <TabsTrigger
                    value="Outward"
                    data-testid="cheque-type-outward"
                    className={cn(
                      'h-full flex-1 gap-2 rounded-md text-xs font-semibold uppercase tracking-wider',
                      'data-active:bg-primary data-active:text-white',
                    )}
                  >
                    <HugeiconsIcon icon={ArrowUpRight} className="h-4 w-4" />
                    {t('issued')}
                  </TabsTrigger>
                  <PremiumTab
                    feature="inward-tracking"
                    value="Inward"
                    data-testid="cheque-type-inward"
                    className={cn(
                      'h-full flex-1 gap-2 rounded-md text-xs font-semibold uppercase tracking-wider',
                      'data-active:bg-green-500 data-active:text-white',
                    )}
                  >
                    <HugeiconsIcon icon={ArrowDownLeft} className="h-4 w-4" />
                    {t('received')}
                  </PremiumTab>
                </TabsList>
              </PremiumTabs>
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="amount"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('amount')}
              </Label>
              <CurrencyPrefixInput
                currency={currency}
                id="amount"
                autoFocus={!cameFromScan}
                inputMode="decimal"
                type="number"
                min={0}
                step="any"
                data-testid="cheque-amount-input"
                {...register('amount', { valueAsNumber: true })}
                aria-invalid={!!errors.amount}
                aria-describedby={
                  errors.amount ? 'cheque-amount-error' : undefined
                }
                className="h-12 font-semibold rounded-sm"
              />
              <div className="flex flex-col gap-1 ml-1">
                <p
                  className="text-[10px] text-muted-foreground uppercase tracking-widest"
                  data-testid="cheque-amount-words"
                >
                  {amountInWords}
                </p>
              </div>
              <FieldError id="cheque-amount-error">
                {validationMessage(errors.amount?.message)}
              </FieldError>
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="cheque_number"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('chequeNumber')}
              </Label>
              <Controller
                control={form.control}
                name="cheque_number"
                render={({ field }) => (
                  <DigitSlotsInput
                    ref={field.ref}
                    id="cheque_number"
                    data-testid="cheque-number-input"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.cheque_number}
                  />
                )}
              />
              <FieldError>
                {validationMessage(errors.cheque_number?.message)}
              </FieldError>
              {numberConflictWarning}
            </div>

            {!cameFromScan && photoWidget}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                required
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('party')}
              </Label>
              <Combobox
                options={partyOptions}
                value={watch('party_id')}
                onValueChange={(val) => setUserValue('party_id', val)}
                placeholder={t('partyPlaceholder')}
                createLabel={t('addParty')}
                testId="cheque-party-combobox"
                onCreateClick={(query) =>
                  openCreatePage('/parties/create', { name: query })
                }
                className="h-14 bg-canvas-parchment border-none rounded-sm"
              />
              <FieldError>
                {validationMessage(errors.party_id?.message)}
              </FieldError>
            </div>

            <div className="space-y-2">
              <Label
                required
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('account')}
              </Label>
              <Combobox
                options={accountOptions}
                value={watch('account_id')}
                onValueChange={(val) => setUserValue('account_id', val)}
                placeholder={t('accountPlaceholder')}
                createLabel={t('addAccount')}
                testId="cheque-account-combobox"
                onCreateClick={(query) =>
                  openCreatePage('/accounts/create', {
                    name: unmatchedEntities?.account_name || query,
                    number: unmatchedEntities?.account_number || '',
                    ifsc: unmatchedEntities?.ifsc_code || '',
                    auto: unmatchedEntities?.account_name ? 'true' : 'false',
                  })
                }
                className="h-14 bg-canvas-parchment border-none rounded-sm"
              />
              <FieldError>
                {validationMessage(errors.account_id?.message)}
              </FieldError>
              {numberConflictWarning}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                required
                htmlFor="cheque_date"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('chequeDate')}
              </Label>
              <DateInput
                leftIcon={Calendar}
                id="cheque_date"
                type="date"
                data-testid="cheque-date-input"
                {...register('cheque_date')}
                value={watch('cheque_date') || ''}
                className="h-12 rounded-sm"
              />
              {errors.cheque_date && (
                <FieldError>
                  {validationMessage(errors.cheque_date.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="deposit_date"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('depositDate')}
              </Label>
              <Controller
                control={form.control}
                name="deposit_date"
                render={({ field }) => (
                  <>
                    <DateInput
                      {...field}
                      leftIcon={Calendar}
                      id="deposit_date"
                      type="date"
                      value={field.value || ''}
                      className="h-14 bg-canvas-parchment border-none rounded-sm"
                    />
                    <DueDatePresets
                      value={field.value || ''}
                      onSelect={field.onChange}
                    />
                  </>
                )}
              />
              {errors.deposit_date && (
                <FieldError>
                  {validationMessage(errors.deposit_date.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="notes"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('notes')}
              </Label>
              <Input
                leftIcon={Note}
                id="notes"
                {...register('notes')}
                placeholder={t('notesPlaceholder')}
                className="h-14 bg-canvas-parchment border-none rounded-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                {t('tags')}
              </Label>
              <TagSelector
                businessId={businessId}
                value={tagIds}
                onChange={setTagIds}
                saveState={draftTags.saveState}
                onRetrySave={() => void draftTags.retry()}
                placeholder={t('addTags')}
              />
            </div>

            <div className="rounded-lg bg-primary/5 p-4 space-y-3 border border-primary/10">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={ReceiptText}
                  className="h-3 w-3 text-primary opacity-80"
                />
                <h3 className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  {t('summary')}
                </h3>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-semibold">
                  {t('amount')}
                </span>
                <span className="text-xl font-semibold text-primary">
                  {currency}
                  {display.number(Number(watch('amount') || 0))}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-semibold">
                  {t('number')}
                </span>
                <span className="font-semibold font-mono bg-white px-2 py-0.5 rounded border border-primary/10 text-primary">
                  #{watch('cheque_number')}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-semibold">
                  {t('party')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {selectedParty?.name || '-'}
                  </span>
                  {selectedParty && (
                    <EntityAvatar
                      name={selectedParty.name}
                      color={(selectedParty as any).color}
                      icon={(selectedParty as any).icon}
                      imageUrl={(selectedParty as any).avatar_url}
                      size="sm"
                    />
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-semibold">
                  {t('account')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {selectedAccount
                      ? `${(selectedAccount as any).bank?.name || tCommon('bank')} (${selectedAccount.account_number.slice(-4)})`
                      : '-'}
                  </span>
                  {selectedAccount && (
                    <EntityAvatar
                      name={selectedAccount.bank?.name || tCommon('bank')}
                      color={selectedAccount.color}
                      icon={selectedAccount.icon}
                      imageUrl={
                        selectedAccount.logo_url ??
                        selectedAccount.bank?.logo_url
                      }
                      size="sm"
                    />
                  )}
                </div>
              </div>
            </div>

            {numberConflictWarning}
          </div>
        )}
      </form>

      <EditSaveBar
        formId="cheque-create-form"
        label={step < 3 ? tCommon('continue') : t('saveAction')}
        isContinue={step < 3}
        secondaryAction={
          <DraftSaveFab
            docked
            status={draft.status}
            hasUserChanges={draft.hasUserChanges}
            onSave={() => void draft.saveDraft()}
          />
        }
        disabled={step === 2 && (!watch('party_id') || !watch('account_id'))}
        isDirty={true}
        isSaving={isSaving || form.formState.isSubmitting}
        testId={
          step < 3 ? `cheque-step${step}-continue` : 'cheque-submit-button'
        }
      />

      <Dialog
        open={!!unmatchedEntities}
        onOpenChange={(open) => !open && setUnmatchedEntities(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('newEntitiesFound')}</DialogTitle>
            <DialogDescription>{t('newEntitiesDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {unmatchedEntities?.payee_name && (
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-canvas-parchment/30">
                <Checkbox
                  id="create-party"
                  checked={createOptions.party}
                  onCheckedChange={(checked) =>
                    setCreateOptions((prev) => ({ ...prev, party: !!checked }))
                  }
                  className="mt-1"
                />
                <div className="flex-1 grid gap-1.5 leading-none">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={User}
                      className="h-3 w-3 text-primary"
                    />
                    <label
                      htmlFor="create-party"
                      className="text-sm font-semibold"
                    >
                      {t('createPartyFromScan', {
                        name: unmatchedEntities.payee_name,
                      })}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('payeeExtracted')}
                  </p>
                </div>
              </div>
            )}

            {unmatchedEntities?.account_number && (
              <div className="space-y-4 p-3 rounded-lg border bg-canvas-parchment/30">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="create-account"
                    checked={createOptions.account}
                    onCheckedChange={(checked) =>
                      setCreateOptions((prev) => ({
                        ...prev,
                        account: !!checked,
                      }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1 grid gap-1.5 leading-none">
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={CreditCard}
                        className="h-3 w-3 text-primary"
                      />
                      <label
                        htmlFor="create-account"
                        className="text-sm font-semibold"
                      >
                        {t('createAccountFromScan', {
                          name:
                            unmatchedEntities.account_name ||
                            unmatchedEntities.account_number ||
                            '',
                        })}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('accountExtracted')}
                    </p>
                  </div>
                </div>

                {createOptions.account && (
                  <div className="space-y-2 ml-7">
                    <Label
                      required
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
                    >
                      <HugeiconsIcon icon={Bank} className="h-3 w-3" />
                      {tCommon('selectBank')}
                    </Label>
                    <BankSelector
                      value={unmatchedEntities.bank_id}
                      onValueChange={(val) =>
                        setUnmatchedEntities((prev) =>
                          prev ? { ...prev, bank_id: val } : null,
                        )
                      }
                      className="h-10 text-sm rounded-xl"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-3">
            <Button
              variant="ghost"
              className="flex-1 rounded-full gap-2"
              onClick={() => setUnmatchedEntities(null)}
            >
              <HugeiconsIcon icon={Trash} className="h-4 w-4" />
              {tCommon('skip')}
            </Button>
            <Button
              className="flex-1 rounded-full gap-2"
              onClick={handleInlineCreate}
              loading={isCreatingInline}
              disabled={
                isCreatingInline ||
                (!createOptions.party && !createOptions.account)
              }
            >
              <HugeiconsIcon icon={Check} className="h-4 w-4" />
              {t('createSelected')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
