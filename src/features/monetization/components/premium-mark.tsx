'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { usePremiumAccess } from '../hooks/use-premium-access'

// Solid fill of the Hugeicons crown outline; the free icon set is stroke-only.
const CROWN_PATH =
  'M14.9152 7.61089L13.8078 5.38179C13.019 3.79393 12.6246 3 12 3C11.3754 3 10.981 3.79393 10.1922 5.38179L9.08483 7.61089C8.58107 8.62494 8.32919 9.13197 7.87976 9.24608C7.8485 9.25401 7.81689 9.26043 7.78503 9.26533C7.32682 9.3357 6.89919 8.96678 6.04393 8.22895C4.0124 6.47635 2.99663 5.60004 2.38034 5.94899C2.34045 5.97157 2.30213 5.99686 2.26565 6.02467C1.70197 6.45439 2.09541 7.74136 2.88229 10.3153L4.04783 14.1279C4.47098 15.5121 4.68255 16.2042 5.21787 16.6021C5.75318 17 6.47261 17 7.91147 17L16.0886 16.9999C17.5274 16.9999 18.2468 16.9999 18.7821 16.602C19.3175 16.2041 19.529 15.512 19.9522 14.1279L21.1177 10.3153C21.9046 7.74137 22.298 6.4544 21.7344 6.02468C21.6979 5.99687 21.6595 5.97158 21.6197 5.94899C21.0034 5.60006 19.9876 6.47636 17.9561 8.22896C17.1008 8.96679 16.6732 9.3357 16.215 9.26533C16.1831 9.26043 16.1515 9.25401 16.1202 9.24607C15.6708 9.13197 15.4189 8.62494 14.9152 7.61089Z'

export function PremiumMark({ className }: { className?: string }) {
  const t = useTranslations('Premium')
  const { hasLifetimePurchase } = usePremiumAccess()
  return (
    <span
      aria-hidden="true"
      title={t('marker')}
      data-slot="premium-mark"
      data-owned={hasLifetimePurchase}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full p-0.5',
        hasLifetimePurchase
          ? 'bg-muted text-muted-foreground'
          : 'premium-crown-shine bg-amber-500/15 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        data-slot="premium-crown"
        className="size-2.5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1"
      >
        <path d={CROWN_PATH} />
        <path
          d="M5 20.25H19"
          fill="none"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
    </span>
  )
}
