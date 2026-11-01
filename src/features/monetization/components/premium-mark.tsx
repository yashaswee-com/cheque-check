'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export function PremiumMark({ className }: { className?: string }) {
  const t = useTranslations('Premium')
  return (
    <span
      aria-hidden="true"
      title={t('marker')}
      data-slot="premium-mark"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 p-1 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <HugeiconsIcon icon={StarIcon} className="size-3" />
    </span>
  )
}
