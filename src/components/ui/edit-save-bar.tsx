'use client'

import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon as Check,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useShellBottomSlot } from '@/components/shell-bottom-slot'

interface EditSaveBarProps {
  formId: string
  label: string
  isDirty: boolean
  isSaving: boolean
  testId?: string
  isContinue?: boolean
  disabled?: boolean
  secondaryAction?: ReactNode
}

/** The form owns step validation; the docked action always submits that form. */
export function EditSaveBar({
  formId,
  label,
  isDirty,
  isSaving,
  testId = 'edit-save-button',
  isContinue = false,
  disabled = false,
  secondaryAction,
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
      <div className="mx-auto flex max-w-2xl items-center gap-2">
        <Button
          type="submit"
          form={formId}
          data-testid={testId}
          className="h-12 min-w-0 flex-1 rounded-full text-base"
          disabled={!isDirty || isSaving || disabled}
          loading={isSaving}
          title={isDirty ? undefined : t('noChangesToSave')}
        >
          {label}
          <HugeiconsIcon
            icon={isContinue ? ArrowRight01Icon : Check}
            className="ml-2 h-5 w-5"
          />
        </Button>
        {secondaryAction}
      </div>
    </div>
  )
  return slot ? createPortal(bar, slot) : bar
}
