'use client'

import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Button } from './button'

export function OptionPagination({
  page,
  pageCount,
  previousPage,
  nextPage,
}: {
  page: number
  pageCount: number
  previousPage: () => void
  nextPage: () => void
}) {
  const t = useTranslations('SharedUI')
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between border-t p-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('previousPage')}
        disabled={page === 0}
        onClick={previousPage}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      </Button>
      <span
        className="text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {page + 1} / {pageCount}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('nextPage')}
        disabled={page + 1 >= pageCount}
        onClick={nextPage}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </Button>
    </div>
  )
}
