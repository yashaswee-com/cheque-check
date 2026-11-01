'use client'

import { useCreateParty } from '@/features/parties/hooks/use-create-party'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon as ArrowLeft,
  ArrowRight01Icon as ArrowRight,
  Tick02Icon as Check,
  UserIcon as User,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  Note01Icon as Note,
  Camera01Icon as Camera,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { getSafeChequeReturnTo } from '@/lib/cheque-draft'
import { useEffect, useRef, useState } from 'react'
import { DraftLeaveDialog, DraftSaveFab } from '@/features/drafts'
import { toast } from '@/components/ui/toast'
import { PhoneInput, useDefaultPhoneCountry } from '@/components/ui/phone-input'
import { toE164 } from '@/lib/phone'
import { Controller } from 'react-hook-form'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { storageService } from '@/services/storage.service'
import { validateImageFile } from '@/lib/storage'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'
import { usePremiumAction } from '@/features/monetization/components/premium-gate'
import { PremiumButton } from '@/features/monetization/components/premium-controls'
import { useParties } from '@/features/parties/hooks/use-parties'
import { findPossiblePartyDuplicates } from '@/features/parties/lib/party-duplicates'
import { usePartyDraftTags } from '@/features/parties/hooks/use-party-draft-tags'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper'

export default function CreatePartyPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Parties')
  const tCommon = useTranslations('Common')
  const premium = usePremiumAction()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = getSafeChequeReturnTo(searchParams.get('returnTo'))
  // Read once: autosave later writes a new draftId into the URL for the same form.
  const [initialDraftId] = useState(() => searchParams.get('draftId'))
  const [prefill] = useState(() => ({ name: searchParams.get('name') }))
  const { activeBusiness } = useBusiness()
  const { parties = [] } = useParties(activeBusiness?.id)
  const partyDraftTagsRef = useRef<ReturnType<typeof usePartyDraftTags> | null>(
    null,
  )

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
  } = useCreateParty(activeBusiness?.id, {
    returnTo,
    draftId: initialDraftId,
    onCreated: async (party) => {
      await partyDraftTagsRef.current?.flush(party.id)
    },
  })
  const partyDraftTags = usePartyDraftTags(draft.draftId)
  useEffect(() => {
    partyDraftTagsRef.current = partyDraftTags
  }, [partyDraftTags])
  const { tagIds, setTagIds } = partyDraftTags

  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form
  const { setUserValue } = draft

  useEffect(() => {
    if (initialDraftId) return
    if (prefill.name) setValue('name', prefill.name)
  }, [initialDraftId, prefill, setValue])
  const defaultPhoneCountry = useDefaultPhoneCountry()
  const duplicateNames = findPossiblePartyDuplicates(
    parties,
    watch('name'),
    watch('contact') ?? '',
    defaultPhoneCountry,
  )
  const importContact = async () => {
    if (!premium.requireAccess('contact-import')) return
    const contacts = (
      navigator as Navigator & {
        contacts?: {
          select: (
            properties: string[],
            options: { multiple: boolean },
          ) => Promise<Array<{ name?: string[]; tel?: string[] }>>
        }
      }
    ).contacts

    if (!contacts) {
      toast.add({
        title: tCommon('contactPickerUnavailable'),
        description: t('contactPickerUnavailable'),
        type: 'info',
      })
      return
    }

    try {
      const contactList = await contacts.select(['name', 'tel'], {
        multiple: false,
      })
      const contact = contactList[0]
      const fullName = contact?.name?.[0]?.trim()
      const phone = contact?.tel?.[0]?.trim()
      if (fullName) setValue('name', fullName)
      if (phone)
        setValue('contact', toE164(phone, defaultPhoneCountry) ?? phone)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.add({
        title: tCommon('error'),
        description: t('contactImportFailed'),
        type: 'error',
      })
    }
  }

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await validateImageFile(file, 5 * 1024 * 1024)
    } catch (error) {
      toast.add({
        title: tCommon('error'),
        description: error instanceof Error ? error.message : tCommon('error'),
        type: 'error',
      })
      return
    }
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setIsAvatarUploading(true)
    try {
      const url = await storageService.uploadAvatar(file)
      setUserValue('avatar_url', url)
      setAvatarPreview(null)
    } catch (error) {
      setAvatarPreview(null)
      toast.add({
        title: tCommon('error'),
        description:
          error instanceof Error
            ? error.message
            : tCommon('avatarUploadFailed'),
        type: 'error',
      })
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (step < 3) {
      await nextStep()
      return
    }
    try {
      await partyDraftTags.flush(draft.draftId)
    } catch {
      toast.add({
        title: tCommon('error'),
        description: tCommon('error'),
        type: 'error',
      })
      return
    }
    await onSubmit(e)
  }

  const saveDraftAndFlushTags = async () => {
    await draft.saveDraft()
    const savedDraftId = new URLSearchParams(window.location.search).get(
      'draftId',
    )
    try {
      await partyDraftTags.flush(savedDraftId)
    } catch {
      toast.add({
        title: tCommon('error'),
        description: tCommon('error'),
        type: 'error',
      })
      return false
    }
    return true
  }

  const colors = [
    '#FF3B30',
    '#FF9500',
    '#FFCC00',
    '#34C759',
    '#007AFF',
    '#5856D6',
    '#AF52DE',
  ]

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
    <div className="max-w-2xl space-y-8 pb-20">
      <Stepper
        value={step}
        className="w-full max-w-xl mx-auto space-y-8"
        indicators={{
          completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
        }}
      >
        <div className="flex items-start gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={prevStep}
            disabled={step === 1 || isSaving || isAvatarUploading}
            aria-label={t('previousStep')}
            className="rounded-full h-8 w-8 shrink-0"
          >
            <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
          </Button>
          <StepperNav className="gap-3 flex-1">
            {[
              { title: t('basicDetails'), icon: User },
              { title: t('contactInfo'), icon: Mail },
              { title: t('locationNotes'), icon: Note },
            ].map((item, index) => (
              <StepperItem
                key={item.title}
                step={index + 1}
                className="relative flex-1 items-center"
              >
                <StepperTrigger
                  aria-label={item.title}
                  className="flex grow flex-col items-center justify-center gap-2.5"
                >
                  <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-background z-10">
                    <HugeiconsIcon icon={item.icon} className="size-4" />
                  </StepperIndicator>
                </StepperTrigger>
                {index < 2 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                )}
              </StepperItem>
            ))}
          </StepperNav>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => nextStep()}
            disabled={step === 3 || isSaving || isAvatarUploading}
            aria-label={t('continue')}
            className="rounded-full h-8 w-8 shrink-0"
          >
            <HugeiconsIcon icon={ArrowRight} className="h-4 w-4" />
          </Button>
        </div>
      </Stepper>
      <DraftLeaveDialog
        {...draft.leaveDialogProps}
        onSave={async () => {
          if (await saveDraftAndFlushTags()) await draft.saveDraftAndExit()
        }}
      />
      <DraftSaveFab
        status={draft.status}
        hasUserChanges={draft.hasUserChanges}
        onSave={() => void saveDraftAndFlushTags()}
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                required
                htmlFor="name"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('partyName')}
              </Label>
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                data-testid="party-name-field"
              >
                <Input
                  leftIcon={User}
                  id="name"
                  {...register('name')}
                  placeholder={t('enterFullName')}
                  className="min-w-0 flex-1 h-14 bg-canvas-parchment border-none text-lg font-semibold rounded-sm"
                />
                <PremiumButton
                  feature="contact-import"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={importContact}
                  aria-label={t('importFromContacts')}
                  className="h-14 w-14 shrink-0 rounded-sm text-primary [&_[data-slot=premium-mark]]:absolute [&_[data-slot=premium-mark]]:right-0 [&_[data-slot=premium-mark]]:top-0"
                >
                  <HugeiconsIcon icon={User} className="h-5 w-5" />
                </PremiumButton>
              </div>
              {errors.name && (
                <p className="text-xs text-destructive ml-1">
                  {validationMessage(errors.name.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                required
                htmlFor="contact"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('contactNumber')}
              </Label>
              <Controller
                control={control}
                name="contact"
                render={({ field }) => (
                  <PhoneInput
                    id="contact"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('phoneNumber')}
                    aria-invalid={!!errors.contact}
                  />
                )}
              />
              {errors.contact && (
                <p className="text-xs text-destructive ml-1">
                  {validationMessage(errors.contact.message)}
                </p>
              )}
            </div>

            {duplicateNames.length > 0 && (
              <p
                role="status"
                className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
              >
                {t('possibleDuplicateWarning', {
                  names: duplicateNames.join(', '),
                })}
              </p>
            )}

            <Button
              type="button"
              data-testid="party-step1-continue"
              onClick={() => nextStep()}
              className="w-full rounded-full h-14 text-lg"
            >
              {t('continue')}
              <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <h2 className="font-semibold">{t('optionalDetails')}</h2>
            <div className="flex justify-center">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label={t('addPhoto')}
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-2 ring-white shadow-sm transition-transform active:scale-95"
                >
                  {avatarPreview || watch('avatar_url') ? (
                    <img
                      src={avatarPreview ?? watch('avatar_url') ?? undefined}
                      alt={t('partyAvatar')}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <HugeiconsIcon icon={User} className="h-8 w-8" />
                  )}
                </button>
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white">
                  <HugeiconsIcon icon={Camera} className="h-3.5 w-3.5" />
                </span>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleAvatarChange(e)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {tCommon('email')}
              </Label>
              <Input
                leftIcon={Mail}
                id="email"
                {...register('email')}
                placeholder={t('emailPlaceholder')}
                className="h-12 bg-canvas-parchment border-none rounded-sm"
              />
              {errors.email && (
                <p className="text-xs text-destructive ml-1">
                  {validationMessage(errors.email.message)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="address"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {tCommon('address')}
              </Label>
              <Input
                leftIcon={MapPin}
                id="address"
                {...register('address')}
                placeholder={t('locationDetails')}
                className="h-12 bg-canvas-parchment border-none rounded-sm"
              />
            </div>
            <Button
              type="button"
              data-testid="party-step2-continue"
              onClick={() => nextStep()}
              disabled={isAvatarUploading}
              className="w-full rounded-full h-14 text-lg"
            >
              {t('continue')}
              <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-testid="party-step2-skip"
              onClick={() => nextStep()}
              disabled={isAvatarUploading}
              className="w-full rounded-full"
            >
              {t('skipOptionalDetails')}
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <h2 className="font-semibold">{t('optionalDetails')}</h2>
            <div className="space-y-2">
              <Label
                htmlFor="notes"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {tCommon('notes')}
              </Label>
              <Input
                leftIcon={Note}
                id="notes"
                {...register('notes')}
                placeholder={t('anyAdditionalNotes')}
                className="h-14 bg-canvas-parchment border-none rounded-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                {tCommon('tags')}
              </Label>
              <TagSelector
                businessId={activeBusiness?.id}
                value={tagIds}
                onChange={setTagIds}
                placeholder={tCommon('addTags')}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                {tCommon('themeColor')}
              </Label>
              <div className="flex flex-wrap gap-3 p-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setUserValue('color', color)}
                    aria-label={color}
                    aria-pressed={watch('color') === color}
                    className={cn(
                      'h-10 w-10 rounded-full transition-all active:scale-95 ring-offset-2',
                      watch('color') === color
                        ? 'ring-2 ring-primary scale-110'
                        : 'hover:scale-105',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 p-5 space-y-3 border border-primary/10">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={User}
                  className="h-3 w-3 text-primary opacity-80"
                />
                <h3 className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  {t('reviewInformation')}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full"
                  style={{ backgroundColor: watch('color') || '#34C759' }}
                />
                <div className="min-w-0">
                  <p className="font-semibold">{watch('name')}</p>
                  <p className="text-xs text-muted-foreground">
                    {watch('contact')}
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="party-submit-button"
              className="w-full rounded-full h-14 text-lg"
              disabled={isSaving || isAvatarUploading}
              loading={
                isSaving || isAvatarUploading || form.formState.isSubmitting
              }
            >
              {t('createParty')}
              <HugeiconsIcon icon={Check} className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
