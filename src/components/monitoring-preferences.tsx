'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
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
    <section className="space-y-2 px-1">
      <div className="flex items-center justify-between gap-4">
        <label
          htmlFor="monitoring-preference"
          className="text-sm font-semibold"
        >
          {t('trackingLabel')}
        </label>
        <Switch
          id="monitoring-preference"
          data-testid="monitoring-preference"
          checked={
            allowed &&
            monitoringConfig.enabled &&
            monitoringConfig.policyApproved
          }
          disabled={
            !monitoringConfig.enabled || !monitoringConfig.policyApproved
          }
          onCheckedChange={setTrackingPreference}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('trackingDescription')}
      </p>
      {(!monitoringConfig.enabled || !monitoringConfig.policyApproved) && (
        <p className="text-xs text-muted-foreground">{t('unavailable')}</p>
      )}
    </section>
  )
}
