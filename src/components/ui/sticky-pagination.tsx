'use client'

import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { useShellBottomSlot } from '@/components/shell-bottom-slot'

/**
 * Icon pagination docked directly above the bottom nav. `page` is zero-based.
 * Renders inline (sticky) when no shell slot is available.
 */
export function StickyPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  disabled = false,
  testId = 'sticky-pagination',
}: {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
  disabled?: boolean
  testId?: string
}) {
  const t = useTranslations('SharedUI')
  const slot = useShellBottomSlot()
  if (totalPages <= 1) return null
  const current = Math.min(page + 1, totalPages)
  const go = (move: () => void) => () => {
    move()
    document
      .querySelector<HTMLElement>('[data-page-scroll]')
      ?.scrollTo?.({ top: 0 })
  }
  const bar = (
    <nav
      aria-label={t('pagination')}
      data-testid={testId}
      className={cn(
        'flex h-12 w-full items-center justify-between border-t border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        !slot && 'sticky bottom-0 z-30',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={t('previousPage')}
        disabled={disabled || page <= 0}
        onClick={go(onPrevious)}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
      </Button>
      <span
        className="text-sm font-normal tabular-nums text-muted-foreground"
        aria-live="polite"
        aria-label={t('pageStatus', { page: current, total: totalPages })}
        data-testid={`${testId}-status`}
      >
        {current} / {totalPages}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={t('nextPage')}
        disabled={disabled || current >= totalPages}
        onClick={go(onNext)}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
      </Button>
    </nav>
  )
  return slot ? createPortal(bar, slot) : bar
}
