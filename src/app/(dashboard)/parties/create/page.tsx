'use client'

import { useCreateParty } from '@/hooks/use-create-party'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/hooks/use-business'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon as Check,
  UserIcon as User,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  Note01Icon as Note,
  Camera01Icon as Camera,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { getSafeChequeReturnTo } from '@/lib/cheque-draft'
import { useEffect, useRef, useState } from 'react'
import { DraftLeaveDialog, DraftSaveFab, DraftToolbar } from '@/features/drafts'
import { toast } from '@/components/ui/toast'
import { PhoneInput, useDefaultPhoneCountry } from '@/components/ui/phone-input'
import { toE164 } from '@/lib/phone'
import { Controller } from 'react-hook-form'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { storageService } from '@/services/storage.service'
import { validateImageFile } from '@/lib/storage'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'
import { usePremiumAction } from '@/features/monetization/components/premium-gate'
import { useParties } from '@/features/parties/hooks/use-parties'
import { findPossiblePartyDuplicates } from '@/features/parties/lib/party-duplicates'
import { usePartyDraftTags } from '@/features/parties/hooks/use-party-draft-tags'

export default function CreatePartyPage() {
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

  const { form, isSaving, isSuccess, continueAfterSuccess, onSubmit, draft } =
    useCreateParty(activeBusiness?.id, {
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
      <DraftToolbar status={draft.status} />
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
        <div className="space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('partyName')}
            </Label>
            <div className="relative">
              <HugeiconsIcon
                icon={User}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
              />
              <Input
                leftIcon={User}
                id="name"
                {...register('name')}
                placeholder={t('enterFullName')}
                className="h-14 bg-canvas-parchment border-none text-lg font-semibold rounded-sm pr-12"
              />
              <button
                type="button"
                onClick={importContact}
                aria-label={t('importFromContacts')}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
              >
                <HugeiconsIcon icon={User} className="h-5 w-5" />
              </button>
            </div>
            {errors.name && (
              <p className="text-xs text-destructive ml-1">
                {errors.name.message as string}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('contactImportHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <Label
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
                {errors.contact.message as string}
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

          <details className="rounded-lg border p-4">
            <summary className="min-h-11 cursor-pointer content-center font-medium">
              {t('optionalDetails')}
            </summary>
            <div className="mt-4 space-y-5">
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
            </div>
          </details>

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
            loading={isSaving || isAvatarUploading}
            loadingText={tCommon('saving')}
          >
            {t('createParty')}
            <HugeiconsIcon icon={Check} className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  )
}
