'use client'

import { Suspense } from 'react'
import { DraftsBrowser } from '@/features/drafts'

export default function DraftsPage() {
  return (
    <Suspense>
      <DraftsBrowser />
    </Suspense>
  )
}
