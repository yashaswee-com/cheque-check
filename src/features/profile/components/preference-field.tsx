'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'

interface PreferenceFieldProps {
  id: string
  label: string
  options: { value: string; label: string }[]
  value: string | null | undefined
  onSave: (value: string) => Promise<unknown>
}

/**
 * A required profile preference. It cannot be cleared, unknown stored values
 * are shown as unselected with a message, and only listed options are saved.
 */
export function PreferenceField({
  id,
  label,
  options,
  value,
  onSave,
}: PreferenceFieldProps) {
  const t = useTranslations('Settings')
  const tOnboarding = useTranslations('Onboarding')
  const [saveFailed, setSaveFailed] = React.useState(false)
  const supported = options.some((option) => option.value === value)
  const message = saveFailed
    ? t('preferenceSaveError')
    : !value
      ? tOnboarding('fieldRequired')
      : !supported
        ? t('preferenceUnsupported')
        : null
  const messageId = `${id}-message`

  const select = async (next: string) => {
    if (next === value || !options.some((option) => option.value === next))
      return
    setSaveFailed(false)
    try {
      await onSave(next)
    } catch {
      setSaveFailed(true)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label
        htmlFor={id}
        required
        className="ml-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </Label>
      <Combobox
        id={id}
        testId={id}
        options={options}
        value={supported ? (value ?? '') : ''}
        allowDeselect={false}
        showSelectedAvatar={false}
        onValueChange={(next) => void select(next)}
        className="h-14 rounded-sm border-none bg-canvas-parchment text-lg font-normal **:font-normal dark:bg-surface-tile-1"
      />
      {message && (
        <div data-testid={`${id}-message`}>
          <FieldError id={messageId}>{message}</FieldError>
        </div>
      )}
    </div>
  )
}
