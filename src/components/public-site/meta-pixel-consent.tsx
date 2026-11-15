'use client'

import { useEffect, useState } from 'react'
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
}

export function MetaPixelConsent(props: Props) {
  const consent = useMarketingConsent()
  const [editing, setEditing] = useState(false)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    const open = () => setEditing(true)
    window.addEventListener(OPEN_PREFERENCES_EVENT, open)
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, open)
  }, [])

  async function choose(choice: 'accepted' | 'rejected') {
    setStorageError(false)
    setEditing(true)
    try {
      const actual = hasTrackingOptOut() ? 'rejected' : choice
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
  return (
    <>
      {((consent !== 'accepted' && consent !== 'rejected') || editing) && (
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
              {storageError && (
                <p role="alert" className="text-sm text-destructive">
                  {props.saveError}
                </p>
              )}
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
                onClick={() => void choose('rejected')}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {props.rejectLabel}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
