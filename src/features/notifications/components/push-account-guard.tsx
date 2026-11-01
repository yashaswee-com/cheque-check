'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { pushService } from '../services/push.service'
import { logger } from '@/lib/logger'
import { useTranslations } from 'next-intl'

export function PushAccountGuard() {
  const { profile, isLoading } = useProfile()
  const t = useTranslations('Push')
  const [error, setError] = useState(false)
  useEffect(() => {
    if (isLoading) return
    let live = true
    void pushService
      .reconcile(profile?.user_id ?? null)
      .then(() => {
        if (live) setError(false)
      })
      .catch((error) => {
        logger.error('Push account cleanup failed', error)
        if (live) setError(true)
      })
    return () => {
      live = false
    }
  }, [isLoading, profile?.user_id])
  return error ? (
    <p role="alert" className="p-4">
      {t('cleanupError')}
    </p>
  ) : null
}
