'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { authService } from '@/features/auth/services/auth.service'
import { MetaPixelConsent } from '@/components/public-site/meta-pixel-consent'
import {
  CONSENT_KEY,
  CONSENT_CHANGE_EVENT,
  MARKETING_ACTIVITY_EVENT,
  marketingEnabled,
  hasTrackingOptOut,
} from './contracts'
import { syncMarketing, clearMarketingStorage } from './browser'
import { logger } from '@/lib/logger'

export function MarketingProvider() {
  return marketingEnabled() ? <EnabledMarketingProvider /> : null
}

function EnabledMarketingProvider() {
  const pathname = usePathname()
  const t = useTranslations('PublicSite.cookieConsent')
  useEffect(() => {
    const sync = () => {
      try {
        if (hasTrackingOptOut()) {
          void syncMarketing('sync', {
            explicitChoice: true,
            acceptedOverride: false,
          })
          clearMarketingStorage()
        } else {
          const choice = localStorage.getItem(CONSENT_KEY)
          if (
            choice === 'accepted' ||
            choice === 'rejected' ||
            pathname === '/onboarding'
          )
            void syncMarketing()
        }
      } catch (error) {
        logger.error('Marketing preferences unavailable', error)
      }
    }
    sync()
    const auth = authService.onAuthStateChange(() => {
      setTimeout(sync, 0)
    })
    const storage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) sync()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, sync)
    window.addEventListener(MARKETING_ACTIVITY_EVENT, sync)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    // Poll pending browser copies only while visible; this does not extend the inactivity session.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible')
        void syncMarketing('sync', { passive: true })
    }, 15_000)
    let activityAt = 0
    const activity = () => {
      if (Date.now() - activityAt < 60_000) return
      activityAt = Date.now()
      sync()
    }
    window.addEventListener('pointerdown', activity, { passive: true })
    window.addEventListener('keydown', activity)
    return () => {
      auth.data.subscription.unsubscribe()
      clearInterval(interval)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync)
      window.removeEventListener(MARKETING_ACTIVITY_EVENT, sync)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [pathname])
  return (
    <MetaPixelConsent
      title={t('title')}
      description={t('description')}
      acceptLabel={t('accept')}
      rejectLabel={t('reject')}
      manageLabel={t('manage')}
      saveError={t('saveError')}
    />
  )
}
