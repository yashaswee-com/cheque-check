'use client'

import { useTranslations } from 'next-intl'
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
            className="w-full rounded-full"
            onClick={onDiscard}
          >
            {t('discardChanges')}
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={onCancel}
          >
            {t('keepEditing')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
