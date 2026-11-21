'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_KEY,
  OPEN_PREFERENCES_EVENT,
  hasTrackingOptOut,
  setSessionMarketingOptOut,
} from '@/features/analytics/contracts'
import {
  clearMarketingStorage,
  syncMarketing,
} from '@/features/analytics/browser'
import { useMarketingConsent } from '@/features/analytics/consent-store'
import { logger } from '@/lib/logger'
import {
  MarketingConsentSettings,
  type MarketingConsentSettingsProps,
} from './marketing-consent-settings'

export type MetaPixelConsentProps = {
  title: string
  description: string
  acceptLabel: string
  rejectLabel: string
  saveError: string
  settingsLabel: string
  settingsDescription: string
  essentialTitle: string
  essentialDescription: string
  alwaysActive: string
  marketingTitle: string
  marketingDescription: string
  showDetails: string
  hideDetails: string
  marketingDetails: string
  aboutLabel: string
  aboutTitle: string
  aboutDescription: string
  privacyLink: string
  rejectOptional: string
  savePreferences: string
}

export function MetaPixelConsent(props: MetaPixelConsentProps) {
  const consent = useMarketingConsent()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [marketingChoice, setMarketingChoice] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'about'>('settings')
  const [showMarketingDetails, setShowMarketingDetails] = useState(false)

  const openSettings = useCallback(() => {
    setMarketingChoice(consent === 'accepted' && !hasTrackingOptOut())
    setActiveTab('settings')
    setShowMarketingDetails(false)
    setStorageError(false)
    setEditing(true)
  }, [consent])

  useEffect(() => {
    window.addEventListener(OPEN_PREFERENCES_EVENT, openSettings)
    return () =>
      window.removeEventListener(OPEN_PREFERENCES_EVENT, openSettings)
  }, [openSettings])

  async function choose(choice: 'accepted' | 'rejected') {
    setStorageError(false)
    setSaving(true)
    const actual = hasTrackingOptOut() ? 'rejected' : choice
    setMarketingChoice(actual === 'accepted')
    try {
      if (actual === 'rejected') {
        setSessionMarketingOptOut(true)
        window.fbq?.('consent', 'revoke')
        let storageFailed = false
        try {
          localStorage.setItem(CONSENT_KEY, actual)
          clearMarketingStorage()
        } catch (error) {
          logger.error(
            'Marketing withdrawal could not be persisted locally',
            error,
          )
          storageFailed = true
        }
        const synchronized = await syncMarketing('sync', {
          explicitChoice: true,
          acceptedOverride: false,
        })
        if (storageFailed || !synchronized)
          throw new Error('Marketing withdrawal synchronization failed')
      } else {
        localStorage.setItem(CONSENT_KEY, actual)
        setSessionMarketingOptOut(false)
        if (!(await syncMarketing('sync', { explicitChoice: true })))
          throw new Error('Marketing consent synchronization failed')
      }
      // Old public-page-only consent does not authorize the expanded funnel.
      localStorage.removeItem('cheque-check:meta-marketing-consent:v1')
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
      setEditing(false)
    } catch (error) {
      logger.error('Marketing consent could not be saved', error)
      setStorageError(true)
    } finally {
      setSaving(false)
    }
  }

  const hasSavedChoice = consent === 'accepted' || consent === 'rejected'

  return (
    <>
      {(!hasSavedChoice || storageError) && !editing && (
        <section
          aria-label={props.title}
          data-marketing-consent-prompt
          aria-busy={saving || undefined}
          className="fixed inset-x-0 bottom-0 z-[120] border-t bg-card p-4 shadow-2xl sm:p-5"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <h2 className="font-semibold">{props.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {props.description}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void choose('accepted')}
                className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                {props.acceptLabel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={openSettings}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {props.settingsLabel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void choose('rejected')}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {props.rejectLabel}
              </button>
            </div>
          </div>
          {storageError && (
            <p
              role="alert"
              className="mx-auto mt-3 max-w-3xl text-sm text-destructive"
            >
              {props.saveError}
            </p>
          )}
        </section>
      )}
      {editing && (
        <MarketingConsentSettings
          {...({
            ...props,
            open: true,
            saving,
            activeTab,
            marketingChoice,
            showMarketingDetails,
            storageError,
            onOpenChange: (open) => {
              if (open) openSettings()
              else setEditing(false)
            },
            onActiveTabChange: setActiveTab,
            onMarketingChoiceChange: setMarketingChoice,
            onShowMarketingDetailsChange: setShowMarketingDetails,
            onChoose: (choice) => void choose(choice),
          } satisfies MarketingConsentSettingsProps)}
        />
      )}
    </>
  )
}
