'use client'

import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon as Check } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useShellBottomSlot } from '@/components/shell-bottom-slot'

interface EditSaveBarProps {
  formId: string
  label: string
  isDirty: boolean
  isSaving: boolean
  testId?: string
}

/**
 * Save action docked to the bottom of the app shell on edit pages.
 * Submits `formId` from outside the form and stays disabled until something changes.
 */
export function EditSaveBar({
  formId,
  label,
  isDirty,
  isSaving,
  testId = 'edit-save-button',
}: EditSaveBarProps) {
  const t = useTranslations('SharedUI')
  const slot = useShellBottomSlot()
  const bar = (
    <div
      data-testid="edit-save-bar"
      className={cn(
        'w-full border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        !slot && 'sticky bottom-0 z-30',
      )}
    >
      <div className="mx-auto max-w-2xl">
        <Button
          type="submit"
          form={formId}
          data-testid={testId}
          className="h-12 w-full rounded-full text-base"
          disabled={!isDirty || isSaving}
          loading={isSaving}
          title={isDirty ? undefined : t('noChangesToSave')}
        >
          {label}
          <HugeiconsIcon icon={Check} className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  )
  return slot ? createPortal(bar, slot) : bar
}
