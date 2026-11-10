'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditParty } from '@/features/parties/hooks/use-edit-party'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParams } from 'next/navigation'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  UserIcon as User,
  Location01Icon as MapPin,
  Delete02Icon as Trash2,
  Mail01Icon as Mail,
  Note01Icon as Note,
} from '@hugeicons/core-free-icons'
import { FormSection } from '@/components/ui/form-section'
import { Skeleton } from '@/components/ui/skeleton'
import dynamic from 'next/dynamic'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { PhoneInput, useDefaultPhoneCountry } from '@/components/ui/phone-input'
import { Controller } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { useEntityTagsDraft } from '@/features/tags/hooks/use-entity-tags'
import { PartyTypePicker } from '@/features/parties/components/party-type-picker'
import { useParties } from '@/features/parties/hooks/use-parties'
import { findPossiblePartyDuplicates } from '@/features/parties/lib/party-duplicates'
import {
  PARTY_THEME_COLORS,
  ThemeColorRow,
} from '@/components/ui/theme-color-row'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'

const DeleteConfirmationDialog = dynamic(
  () =>
    import('@/components/ui/delete-dialog').then(
      (mod) => mod.DeleteConfirmationDialog,
    ),
  {
    loading: () => <Skeleton className="h-14 w-full rounded-full" />,
    ssr: false,
  },
)

export default function EditPartyPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Parties')
  const tCommon = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { activeBusiness } = useBusiness()
  const { parties = [] } = useParties(activeBusiness?.id)
  const defaultPhoneCountry = useDefaultPhoneCountry()
  const leaveRef = useRef<() => void>(() => {})

  const { form, party, isLoading, isSaving, onSubmit, onDelete } = useEditParty(
    id,
    activeBusiness?.id,
    { onSaved: () => leaveRef.current() },
  )

  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors, isDirty: isFormDirty },
  } = form
  const tagsDraft = useEntityTagsDraft('party', id)
  const isDirty = isFormDirty || tagsDraft.isDirty
  const guard = useUnsavedChangesGuard(isDirty)
  useEffect(() => {
    leaveRef.current = guard.leave
  }, [guard.leave])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const duplicateNames = findPossiblePartyDuplicates(
    parties.filter((other) => other.id !== id),
    watch('name'),
    watch('contact') ?? '',
    defaultPhoneCountry,
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isDirty || isSubmitting || isSaving) return
    setIsSubmitting(true)
    try {
      if (await form.trigger()) {
        if (!(await tagsDraft.commit())) return
      }
      await onSubmit(event)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-8 pb-20">
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <div className="flex justify-center">
          <Skeleton className="h-24 w-24 rounded-full" />
        </div>
        <Skeleton className="h-14 w-full rounded-sm" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8 pb-6">
      <form id="party-edit-form" onSubmit={handleSubmit} className="space-y-10">
        <FormSection title={t('basicDetails')} icon={User}>
          <div className="space-y-2">
            <Label
              required
              htmlFor="name"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('partyName')}
            </Label>
            <Input
              leftIcon={User}
              id="name"
              {...register('name')}
              placeholder={t('enterFullName')}
              className="h-14 bg-canvas-parchment border-none text-lg font-semibold rounded-sm"
            />
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
              data-testid="party-duplicate-warning"
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
            >
              {t('possibleDuplicateWarning', {
                names: duplicateNames.join(', '),
              })}
            </p>
          )}

          <PartyTypePicker
            value={watch('party_type')}
            onChange={(value) =>
              setValue('party_type', value, { shouldDirty: true })
            }
          />
        </FormSection>

        <FormSection title={t('contactInfo')} icon={Mail}>
          <div className="flex justify-center">
            <EditableAvatar
              name={watch('name')}
              color={watch('color')}
              imageUrl={watch('avatar_url')}
              onUpload={async (url) => {
                setValue('avatar_url', url, { shouldDirty: true })
              }}
              onDelete={async () => {
                setValue('avatar_url', null, { shouldDirty: true })
              }}
              size="xl"
            />
          </div>

          <ThemeColorRow
            label={tCommon('themeColor')}
            colors={PARTY_THEME_COLORS}
            value={watch('color')}
            onChange={(color) =>
              setValue('color', color, { shouldDirty: true })
            }
            testId="party-theme-color"
          />

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
              className="h-14 bg-canvas-parchment border-none rounded-sm"
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
              className="h-14 bg-canvas-parchment border-none rounded-sm"
            />
          </div>
        </FormSection>

        <FormSection title={t('locationNotes')} icon={Note}>
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
              value={tagsDraft.tagIds}
              onChange={tagsDraft.setTagIds}
              placeholder={tCommon('addTags')}
              saveState={tagsDraft.saveState}
              onRetrySave={() => void tagsDraft.retry()}
            />
          </div>
        </FormSection>
      </form>

      <DeleteConfirmationDialog
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc')}
        confirmName={party?.name || ''}
        onDelete={async () => {
          guard.bypass(onDelete)
        }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            data-testid="party-delete-trigger"
            className="w-full rounded-full h-14 text-muted-foreground hover:text-destructive transition-colors"
          >
            <HugeiconsIcon icon={Trash2} className="mr-2 h-5 w-5" />{' '}
            {t('deleteParty')}
          </Button>
        }
      />

      <EditSaveBar
        formId="party-edit-form"
        label={t('updateParty')}
        isDirty={isDirty}
        isSaving={isSaving || isSubmitting}
        testId="party-edit-submit-button"
      />
      <UnsavedChangesDialog {...guard.dialogProps} />
    </div>
  )
}
