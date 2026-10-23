'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  FloppyDiskIcon as SaveIcon,
  Tick02Icon as Check,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { DraftSaveStatus } from '@/features/drafts'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface DraftSaveFabProps {
  status: DraftSaveStatus
  hasUserChanges: boolean
  onSave: () => void
}

// Idle+no-changes = disabled/silver (nothing to save yet); saving = spinner;
// saved = blue and still clickable, so tapping again re-saves in place.
export function DraftSaveFab({
  status,
  hasUserChanges,
  onSave,
}: DraftSaveFabProps) {
  const isSaving = status === 'saving'
  const isSaved = status === 'saved'
  const isUntouched = status === 'idle' && !hasUserChanges
  const disabled = isSaving || isUntouched
  const t = useTranslations('Drafts')

  return (
    <Button
      size="icon"
      loading={isSaving}
      type="button"
      onClick={onSave}
      disabled={disabled}
      aria-label={t('saveDraft')}
      data-testid="draft-save-button"
      className={cn(
        'fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white shadow-lg transition-colors active:scale-95 disabled:active:scale-100 dark:border-zinc-900',
        isSaving && 'bg-zinc-700 text-white',
        !isSaving && isSaved && 'bg-primary text-white',
        !isSaving && !isSaved && hasUserChanges && 'bg-zinc-700 text-white',
        isUntouched && 'bg-muted text-muted-foreground cursor-not-allowed',
      )}
    >
      {isSaved ? (
        <HugeiconsIcon icon={Check} className="h-7 w-7" />
      ) : (
        <HugeiconsIcon icon={SaveIcon} className="h-7 w-7" />
      )}
    </Button>
  )
}
