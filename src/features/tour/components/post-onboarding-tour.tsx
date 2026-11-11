'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { PwaInstallCard } from '@/components/pwa-install-card'
import { FirstRunTour } from './first-run-tour'
export function PostOnboardingTour() {
  const [resolved, setResolved] = useState(false)
  const pathname = usePathname()
  if (pathname === '/settings' || pathname?.startsWith('/settings/'))
    return null
  return (
    <>
      <PwaInstallCard onResolved={setResolved} />
      {resolved && <FirstRunTour />}
    </>
  )
}
