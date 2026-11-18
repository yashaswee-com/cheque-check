'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { StickyBanner } from '@/components/ui/sticky-banner'

export function LaunchBanner({
  message,
  closeLabel,
}: {
  message: ReactNode
  closeLabel: string
}) {
  const pathname = usePathname()
  if (pathname !== '/') return null

  return (
    <StickyBanner
      hideOnScroll
      closeLabel={closeLabel}
      className="top-(--environment-indicator-height,0px) z-50 min-h-11 bg-linear-to-b from-[#1a7be0] to-primary py-2 pr-12 pl-12 text-white"
    >
      <p className="text-center text-[13px] leading-snug font-medium text-white/90 sm:text-sm [&_b]:font-bold [&_b]:text-white">
        {message}
      </p>
    </StickyBanner>
  )
}
