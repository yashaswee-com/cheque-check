'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingSwitchRow } from '@/components/ui/setting-switch-row'
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

type Props = {
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

export function MetaPixelConsent(props: Props) {
  const consent = useMarketingConsent()
  const [editing, setEditing] = useState(false)
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
    const actual = hasTrackingOptOut() ? 'rejected' : choice
    setMarketingChoice(actual === 'accepted')
    setEditing(true)
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
    }
  }

  const hasSavedChoice = consent === 'accepted' || consent === 'rejected'

  return (
    <>
      {!hasSavedChoice && !editing && (
        <section
          aria-label={props.title}
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
                onClick={() => void choose('accepted')}
                className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                {props.acceptLabel}
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {props.settingsLabel}
              </button>
              <button
                type="button"
                onClick={() => void choose('rejected')}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {props.rejectLabel}
              </button>
            </div>
          </div>
        </section>
      )}
      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (open) openSettings()
          else setEditing(false)
        }}
      >
        <DialogContent
          scrollable
          className="gap-0 p-0 sm:max-w-3xl"
          data-testid="cookie-settings-dialog"
        >
          <DialogHeader className="space-y-2 p-5 pr-14 pb-4 sm:p-7 sm:pr-14 sm:pb-5">
            <DialogTitle>{props.settingsLabel}</DialogTitle>
            <DialogDescription>{props.settingsDescription}</DialogDescription>
          </DialogHeader>
          <nav
            aria-label={props.settingsLabel}
            className="flex gap-6 border-y px-5 sm:px-7"
          >
            <button
              type="button"
              aria-pressed={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              className="border-b-2 border-transparent py-3 text-sm font-medium aria-pressed:border-primary"
            >
              {props.settingsLabel}
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'about'}
              onClick={() => setActiveTab('about')}
              className="border-b-2 border-transparent py-3 text-sm font-medium aria-pressed:border-primary"
            >
              {props.aboutLabel}
            </button>
          </nav>
          {activeTab === 'settings' ? (
            <div
              role="region"
              aria-label={props.settingsLabel}
              className="space-y-4 p-5 sm:p-7"
            >
              <section className="space-y-2 rounded-2xl border p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-medium">
                    {props.essentialTitle}
                  </h3>
                  <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {props.alwaysActive}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {props.essentialDescription}
                </p>
              </section>
              <section className="space-y-3 rounded-2xl border p-4 sm:p-5">
                <SettingSwitchRow
                  id="cookie-marketing"
                  label={props.marketingTitle}
                  description={props.marketingDescription}
                  checked={marketingChoice}
                  onCheckedChange={setMarketingChoice}
                />
                <button
                  type="button"
                  aria-expanded={showMarketingDetails}
                  onClick={() =>
                    setShowMarketingDetails((expanded) => !expanded)
                  }
                  className="text-sm underline underline-offset-4"
                >
                  {showMarketingDetails ? props.hideDetails : props.showDetails}
                </button>
                {showMarketingDetails && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {props.marketingDetails}
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div
              role="region"
              aria-label={props.aboutLabel}
              className="space-y-3 p-5 sm:p-7"
            >
              <h3 className="text-base font-medium">{props.aboutTitle}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {props.aboutDescription}
              </p>
              <Link
                href="/privacy"
                className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
              >
                {props.privacyLink}
              </Link>
            </div>
          )}
          {storageError && (
            <p
              role="alert"
              className="px-5 pb-3 text-sm text-destructive sm:px-7"
            >
              {props.saveError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-4 sm:flex-row sm:justify-end sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => choose('rejected')}
            >
              {props.rejectOptional}
            </Button>
            <Button
              type="button"
              onClick={() => choose(marketingChoice ? 'accepted' : 'rejected')}
            >
              {props.savePreferences}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
