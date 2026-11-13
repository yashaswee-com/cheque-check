'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditAccount } from '@/features/accounts/hooks/use-edit-account'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParams } from 'next/navigation'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  UserIcon as User,
  CreditCardIcon as CreditCard,
  HashtagIcon as Hash,
  Delete02Icon as Trash2,
} from '@hugeicons/core-free-icons'
import { CurrencyPrefixInput } from '@/components/ui/currency-prefix-input'
import { FormSection } from '@/components/ui/form-section'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfile } from '@/features/profile/hooks/use-profile'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { TagSelector } from '@/features/tags/components/tag-selector'
import { useEntityTagsDraft } from '@/features/tags/hooks/use-entity-tags'
import { DefaultAccountField } from '@/features/accounts/components/default-account-field'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import {
  ACCOUNT_THEME_COLORS,
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

const BankSelector = dynamic(
  () => import('@/components/bank-selector').then((mod) => mod.BankSelector),
  {
    loading: () => <Skeleton className="h-14 w-full rounded-2xl" />,
    ssr: false,
  },
)

export default function EditAccountPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const currency = profile?.currency || '₹'
  const leaveRef = useRef<() => void>(() => {})

  const { form, account, isLoading, isSaving, onSubmit, onDelete } =
    useEditAccount(id, activeBusiness?.id, {
      onSaved: () => leaveRef.current(),
    })

  const {
    register,
    watch,
    setValue,
    formState: { errors, isDirty: isFormDirty },
  } = form
  const tagsDraft = useEntityTagsDraft('account', id)
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
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-14 w-full rounded-sm" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8 pb-6">
      <form
        id="account-edit-form"
        onSubmit={handleSubmit}
        className="space-y-10"
      >
        <FormSection title={t('accountInfo')} icon={User}>
          <div className="flex justify-center">
            <EditableAvatar
              name={watch('account_name') || t('accountName')}
              imageUrl={watch('logo_url')}
              color={watch('color')}
              onUpload={async (url) =>
                setValue('logo_url', url, { shouldDirty: true })
              }
              onDelete={async () =>
                setValue('logo_url', null, { shouldDirty: true })
              }
            />
          </div>
          <div className="space-y-2">
            <Label
              required
              htmlFor="account_name"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('accountName')}
            </Label>
            <Input
              leftIcon={User}
              id="account_name"
              {...register('account_name')}
              placeholder={t('accountNamePlaceholder')}
              className="h-14 bg-canvas-parchment border-none rounded-sm"
            />
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
            onChange={(color) =>
              setValue('color', color, { shouldDirty: true })
            }
            testId="account-theme-color"
          />
        </FormSection>

        <FormSection title={t('bankDetails')} icon={CreditCard}>
          <div className="space-y-2">
            <Label
              required
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('selectBank')}
            </Label>
            <BankSelector
              value={watch('bank_id')}
              onValueChange={(val) =>
                setValue('bank_id', val, { shouldDirty: true })
              }
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
            <Input
              leftIcon={CreditCard}
              id="account_number"
              {...register('account_number')}
              placeholder={t('accountNumberPlaceholder')}
              className="h-14 bg-canvas-parchment border-none rounded-sm"
            />
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
            businessId={account?.business_id ?? activeBusiness?.id}
            accountId={id}
            checked={watch('is_default')}
            onCheckedChange={(checked) =>
              setValue('is_default', checked, { shouldDirty: true })
            }
          />
        </FormSection>

        <FormSection title={t('moreDetails')} icon={Hash}>
          <div className="space-y-2">
            <Label
              htmlFor="ifsc_code"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
            >
              {t('ifscCode')}
            </Label>
            <Input
              leftIcon={Hash}
              id="ifsc_code"
              {...register('ifsc_code')}
              placeholder={t('ifscPlaceholder')}
              className="h-14 bg-canvas-parchment border-none uppercase rounded-sm"
            />
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
        formId="account-edit-form"
        label={t('updateAccount')}
        isDirty={isDirty}
        isSaving={isSaving || isSubmitting}
        testId="account-edit-submit-button"
        secondaryAction={
          <DeleteConfirmationDialog
            title={t('deleteConfirmTitle')}
            description={t('deleteConfirmDesc')}
            confirmName={account?.account_name || 'Account'}
            onDelete={async () => {
              guard.bypass(onDelete)
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('deleteAccount')}
                disabled={isSaving || isSubmitting}
                data-testid="account-delete-trigger"
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
