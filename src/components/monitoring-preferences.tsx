'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SettingSwitchRow } from '@/components/ui/setting-switch-row'
import { monitoringConfig } from '@/lib/monitoring/config'
import {
  readTrackingPreference,
  setTrackingPreference,
  trackingPreferenceEvent,
  trackingPreferenceKey,
} from '@/lib/monitoring/browser'

export function MonitoringPreferences() {
  const t = useTranslations('Monitoring')
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    const update = () => setAllowed(readTrackingPreference())
    const storage = (event: StorageEvent) => {
      if (event.key === trackingPreferenceKey || event.key === null) update()
    }
    update()
    window.addEventListener(trackingPreferenceEvent, update)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(trackingPreferenceEvent, update)
      window.removeEventListener('storage', storage)
    }
  }, [])
  return (
    <SettingSwitchRow
      id="monitoring-preference"
      data-testid="monitoring-preference"
      label={t('trackingLabel')}
      description={t('trackingDescription')}
      checked={
        allowed && monitoringConfig.enabled && monitoringConfig.policyApproved
      }
      disabled={!monitoringConfig.enabled || !monitoringConfig.policyApproved}
      onCheckedChange={setTrackingPreference}
    >
      {(!monitoringConfig.enabled || !monitoringConfig.policyApproved) && (
        <p className="text-xs text-muted-foreground">{t('unavailable')}</p>
      )}
    </SettingSwitchRow>
  )
}
