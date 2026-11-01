'use client'
import { useState } from 'react'
import { PwaInstallCard } from '@/components/pwa-install-card'
import { FirstRunTour } from './first-run-tour'
export function PostOnboardingTour() {
  const [resolved, setResolved] = useState(false)
  return (
    <>
      <PwaInstallCard onResolved={setResolved} />
      {resolved && <FirstRunTour />}
    </>
  )
}
