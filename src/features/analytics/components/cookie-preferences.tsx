'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { hasTrackingOptOut, marketingEnabled } from '../contracts'
import { openCookieSettings, useMarketingConsent } from '../consent-store'

/** Preferences entry point for the marketing cookie banner. */
export function CookiePreferences() {
  const t = useTranslations('Settings')
  const consent = useMarketingConsent()
  const enabled = marketingEnabled()
  const status = !enabled
    ? t('cookieUnavailable')
    : consent === 'accepted' && !hasTrackingOptOut()
      ? t('cookieAccepted')
      : consent === 'rejected' || hasTrackingOptOut()
        ? t('cookieRejected')
        : t('cookieUndecided')
  return (
    <section
      className="space-y-2"
      aria-labelledby="cookie-settings-title"
      data-testid="cookie-preferences"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 id="cookie-settings-title" className="text-sm font-normal">
            {t('cookieSettings')}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('cookieSettingsDesc')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={!enabled}
          onClick={openCookieSettings}
          data-testid="cookie-preferences-manage"
        >
          {t('cookieManage')}
        </Button>
      </div>
      <p
        role="status"
        className="text-xs leading-relaxed text-muted-foreground"
      >
        {status}
      </p>
    </section>
  )
}
