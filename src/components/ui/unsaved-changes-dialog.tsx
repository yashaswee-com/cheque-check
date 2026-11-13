'use client'

import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon as DeleteIcon,
  PencilEdit02Icon as EditIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export interface UnsavedChangesDialogProps {
  open: boolean
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesDialog({
  open,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const t = useTranslations('SharedUI')
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onCancel()}>
      <SheetContent data-testid="unsaved-changes-dialog">
        <SheetHeader>
          <SheetTitle>{t('unsavedTitle')}</SheetTitle>
          <SheetDescription>{t('unsavedDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 pt-4">
          <Button
            variant="destructive"
            className="w-full justify-center gap-2 rounded-full"
            onClick={onDiscard}
          >
            <HugeiconsIcon icon={DeleteIcon} className="size-4" />
            {t('discardChanges')}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-center gap-2 rounded-full"
            onClick={onCancel}
          >
            <HugeiconsIcon icon={EditIcon} className="size-4" />
            {t('keepEditing')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
