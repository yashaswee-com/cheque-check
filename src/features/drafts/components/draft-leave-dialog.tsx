'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
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
  showSave: boolean
  onSave: () => Promise<void>
  onDiscard: () => Promise<void>
  onCancel: () => void
}

export function DraftLeaveDialog({
  open,
  showSave,
  onSave,
  onDiscard,
  onCancel,
}: DraftLeaveDialogProps) {
  const t = useTranslations('Drafts')
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null)

  const run = async (action: 'save' | 'discard') => {
    setBusy(action)
    try {
      await (action === 'save' ? onSave() : onDiscard())
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('leaveTitle')}</SheetTitle>
          <SheetDescription>{t('leaveDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 pt-4">
          {showSave && (
            <Button
              className="w-full rounded-full"
              onClick={() => run('save')}
              disabled={!!busy}
            >
              {busy === 'save' ? t('saving') : t('saveDraft')}
            </Button>
          )}
          <Button
            variant="destructive"
            className="w-full rounded-full"
            onClick={() => run('discard')}
            disabled={!!busy}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            {t('discard')}
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={onCancel}
            disabled={!!busy}
          >
            {t('keepEditing')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
