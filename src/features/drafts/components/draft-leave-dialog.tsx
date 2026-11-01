'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface DraftLeaveDialogProps {
  open: boolean
  onSave: () => Promise<void>
  onDiscard: () => Promise<void>
  onCancel: () => void
}

export function DraftLeaveDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
}: DraftLeaveDialogProps) {
  const t = useTranslations('Drafts')
  const [pendingAction, setPendingAction] = useState<'save' | 'discard' | null>(
    null,
  )
  const isPending = pendingAction !== null

  const run = async (action: 'save' | 'discard') => {
    setPendingAction(action)
    try {
      await (action === 'save' ? onSave() : onDiscard())
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && !isPending && onCancel()}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('leaveTitle')}</SheetTitle>
          <SheetDescription>{t('leaveDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 pt-4">
          <Button
            className="w-full rounded-full"
            onClick={() => run('save')}
            loading={pendingAction === 'save'}
            disabled={isPending}
          >
            {t('saveDraft')}
          </Button>
          <Button
            variant="destructive"
            className="w-full rounded-full"
            onClick={() => run('discard')}
            loading={pendingAction === 'discard'}
            disabled={isPending}
          >
            {t('discard')}
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={onCancel}
            disabled={isPending}
          >
            {t('keepEditing')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
