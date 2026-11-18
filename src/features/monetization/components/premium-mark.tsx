'use client'

import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Diamond02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { usePremiumAccess } from '../hooks/use-premium-access'

export function PremiumMark({ className }: { className?: string }) {
  const { hasLifetimePurchase } = usePremiumAccess()
  return <PremiumMarkBadge className={className} owned={hasLifetimePurchase} />
}

export function PremiumMarkBadge({
  className,
  owned = false,
}: {
  className?: string
  owned?: boolean
}) {
  const t = useTranslations('Premium')
  return (
    <span
      aria-hidden="true"
      title={t('marker')}
      data-slot="premium-mark"
      data-owned={owned}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full p-0.5',
        owned
          ? 'bg-muted text-muted-foreground'
          : 'premium-crown-shine bg-amber-500/15 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <HugeiconsIcon
        icon={Diamond02Icon}
        data-slot="premium-diamond"
        className="size-2.5"
        aria-hidden="true"
      />
    </span>
  )
}
