'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { usePathname } from 'next/navigation'
import { authService } from '@/features/auth/services/auth.service'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useEntitlements } from '@/features/monetization/hooks/use-entitlements'
import { resolvePremiumState } from '@/features/monetization/lib/premium-access'
import { FEATURE_IDS } from '@/features/monetization/constants'
import { monitoringConfig } from '@/lib/monitoring/config'
import {
  setMonitoringUser,
  syncMonitoringPage,
  trackingPreferenceEvent,
  trackingPreferenceKey,
} from '@/lib/monitoring/browser'

export function MonitoringProvider() {
  return monitoringConfig.enabled ? <EnabledMonitoringProvider /> : null
}

function EnabledMonitoringProvider() {
  const pathname = usePathname()
  const { profile } = useProfile()
  const { activeBusiness } = useBusiness()
  const entitlements = useEntitlements()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    let authRevision = 0
    const applyUser = (next: User | null) => {
      if (!active) return
      setMonitoringUser(
        next
          ? {
              id: next.id,
              email: next.email,
              name:
                typeof next.user_metadata?.name === 'string'
                  ? next.user_metadata.name
                  : undefined,
            }
          : null,
      )
      setUser(next)
    }
    const {
      data: { subscription },
    } = authService.onAuthStateChange((_event, session) => {
      authRevision += 1
      applyUser(session?.user ?? null)
    })
    const initialRevision = authRevision
    void authService
      .getUser()
      .then((next) => {
        if (authRevision === initialRevision) applyUser(next)
      })
      .catch(() => {
        if (authRevision === initialRevision) applyUser(null)
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const ownProfile = profile?.user_id === user?.id ? profile : null
    const ownBusiness =
      activeBusiness?.user_id === user?.id ? activeBusiness : null
    const entitlement = entitlements.data?.find(
      (entry) =>
        entry.user_id === user?.id &&
        entry.feature_id === FEATURE_IDS.LIFETIME_PREMIUM,
    )
    const state = entitlement
      ? resolvePremiumState(entitlement, Date.now())
      : 'unknown'
    if (user)
      setMonitoringUser({
        id: user.id,
        email: ownProfile?.email ?? user.email,
        name:
          ownProfile?.name ??
          (typeof user.user_metadata?.name === 'string'
            ? user.user_metadata.name
            : undefined),
      })
    const sync = () =>
      syncMonitoringPage(pathname, {
        business_id: ownBusiness?.id,
        language: ownProfile?.language,
        timezone: ownProfile?.time_zone,
        currency: ownProfile?.currency,
        entitlement: state,
        tier:
          state === 'active' || state === 'trialing' ? 'premium' : 'unknown',
      })
    sync()
    const storage = (event: StorageEvent) => {
      if (event.key === trackingPreferenceKey || event.key === null) sync()
    }
    window.addEventListener(trackingPreferenceEvent, sync)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(trackingPreferenceEvent, sync)
      window.removeEventListener('storage', storage)
    }
  }, [
    pathname,
    user,
    profile,
    activeBusiness,
    entitlements.data,
    entitlements.dataUpdatedAt,
  ])

  return null
}
