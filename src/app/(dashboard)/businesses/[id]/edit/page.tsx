'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditBusiness } from '@/features/businesses/hooks/use-edit-business'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParams } from 'next/navigation'
import {
  Mail01Icon as Mail,
  CallIcon as Phone,
  Store01Icon as Store,
  Location01Icon as MapPin,
  Delete02Icon as Trash2,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { FormSection } from '@/components/ui/form-section'
import { Skeleton } from '@/components/ui/skeleton'
import dynamic from 'next/dynamic'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import {
  BUSINESS_THEME_COLORS,
  ThemeColorRow,
} from '@/components/ui/theme-color-row'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'
import { PhoneInput } from '@/components/ui/phone-input'
import { Controller } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { useEntityTagsDraft } from '@/features/tags/hooks/use-entity-tags'

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

export default function EditBusinessPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Businesses')
  const tc = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const leaveRef = useRef<() => void>(() => {})

  const { form, business, isLoading, isSaving, onSubmit, onDelete } =
    useEditBusiness(id, { onSaved: () => leaveRef.current() })

  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors, isDirty: isFormDirty },
  } = form
  const tagsDraft = useEntityTagsDraft('business', id)
  const isDirty = isFormDirty || tagsDraft.isDirty
  const guard = useUnsavedChangesGuard(isDirty)
  useEffect(() => {
    leaveRef.current = guard.leave
  }, [guard.leave])
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        <div className="flex justify-center">
          <Skeleton className="h-24 w-24 rounded-full" />
        </div>
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-14 w-full rounded-sm" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8 pb-6">
      <form
        id="business-edit-form"
        onSubmit={handleSubmit}
        className="space-y-10"
      >
        <FormSection title={t('businessProfile')} icon={Store}>
          <div
            data-testid="business-logo-field"
            className="flex flex-col items-center gap-3 py-2"
          >
            <EditableAvatar
              name={watch('name') || t('businessName')}
              color={watch('color')}
              icon={watch('icon')}
              imageUrl={watch('logo_url')}
              onUpload={async (url) => {
                setValue('logo_url', url, { shouldDirty: true })
              }}
              onDelete={async () => {
                setValue('logo_url', null, { shouldDirty: true })
              }}
              size="xl"
            />
            <p className="text-xs text-muted-foreground">{t('businessLogo')}</p>
          </div>

          <div className="space-y-2" data-testid="business-name-field">
            <Label
              required
              htmlFor="name"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('businessName')}
            </Label>
            <Input
              leftIcon={Store}
              id="name"
              {...register('name')}
              placeholder={t('businessNamePlaceholder')}
              className="h-14 bg-canvas-parchment border-none text-lg font-semibold rounded-sm"
            />
            {errors.name && (
              <FieldError>{validationMessage(errors.name.message)}</FieldError>
            )}
          </div>

          <ThemeColorRow
            label={tc('themeColor')}
            colors={BUSINESS_THEME_COLORS}
            value={watch('color')}
            onChange={(color) =>
              setValue('color', color, { shouldDirty: true })
            }
            testId="business-theme-color-field"
          />
        </FormSection>

        <FormSection title={t('contactInfo')} icon={Phone}>
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('businessEmail')}
            </Label>
            <Input
              leftIcon={Mail}
              id="email"
              type="email"
              {...register('email')}
              placeholder={t('contactEmailPlaceholder')}
              className="h-14 bg-canvas-parchment border-none rounded-sm"
            />
            {errors.email && (
              <FieldError>{validationMessage(errors.email.message)}</FieldError>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="phone"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('businessPhone')}
            </Label>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  id="phone"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('businessPhone')}
                  aria-invalid={!!errors.phone}
                />
              )}
            />
            {errors.phone && (
              <FieldError>{validationMessage(errors.phone.message)}</FieldError>
            )}
          </div>
        </FormSection>

        <FormSection title={t('location')} icon={MapPin}>
          <div className="space-y-2">
            <Label
              htmlFor="address"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('businessAddress')}
            </Label>
            <Input
              leftIcon={MapPin}
              id="address"
              {...register('address')}
              placeholder={t('headquartersPlaceholder')}
              className="h-14 bg-canvas-parchment border-none rounded-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
              {tc('tags')}
            </Label>
            <TagSelector
              businessId={id}
              value={tagsDraft.tagIds}
              onChange={tagsDraft.setTagIds}
              placeholder={tc('addTags')}
              saveState={tagsDraft.saveState}
              onRetrySave={() => void tagsDraft.retry()}
            />
          </div>
        </FormSection>
      </form>

      <EditSaveBar
        formId="business-edit-form"
        label={t('updateBusiness')}
        isDirty={isDirty}
        isSaving={isSaving || isSubmitting}
        testId="business-edit-submit-button"
        secondaryAction={
          <DeleteConfirmationDialog
            title={t('deleteConfirmTitle')}
            description={t('deleteConfirmDesc')}
            confirmName={business?.name || ''}
            onDelete={async () => {
              guard.bypass(onDelete)
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('deleteBusiness')}
                disabled={isSaving || isSubmitting}
                data-testid="business-delete-trigger"
                className="size-12 rounded-full text-muted-foreground hover:text-destructive transition-colors"
              >
                <HugeiconsIcon icon={Trash2} className="h-5 w-5" />
              </Button>
            }
          />
        }
      />
      <UnsavedChangesDialog {...guard.dialogProps} />
    </div>
  )
}
