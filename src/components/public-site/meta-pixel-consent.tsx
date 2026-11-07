'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

const META_PIXEL_ID = '1782530103005623'
const CONSENT_KEY = 'cheque-check:meta-marketing-consent:v1'
const CONSENT_CHANGE_EVENT = 'cheque-check:meta-consent-change'
const OPEN_PREFERENCES_EVENT = 'cheque-check:open-meta-consent'
const TRACKABLE_PUBLIC_ROUTES = new Set([
  '/',
  '/features',
  '/pricing',
  '/privacy',
  '/contact',
  '/legal-notice',
  '/cheque-bounce',
])

type Consent = 'accepted' | 'rejected'
type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: MetaPixelFunction
  loaded?: boolean
  version?: string
  initialized?: boolean
}

declare global {
  interface Window {
    fbq?: MetaPixelFunction
    _fbq?: MetaPixelFunction
  }
}

type Props = {
  title: string
  description: string
  acceptLabel: string
  rejectLabel: string
  manageLabel: string
  saveError: string
}

export function isTrackablePublicRoute(pathname: string) {
  return TRACKABLE_PUBLIC_ROUTES.has(pathname)
}

function readConsent(): Consent | null {
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY)
    return saved === 'accepted' || saved === 'rejected' ? saved : null
  } catch {
    return null
  }
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
  }
}

function hasTrackingOptOut() {
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true || navigator.doNotTrack === '1'
  )
}

function initializeMetaPixel() {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    } as MetaPixelFunction
    fbq.queue = []
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = window._fbq = fbq

    const script = document.createElement('script')
    script.id = 'meta-pixel-script'
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }

  const fbq = window.fbq
  if (!fbq.initialized) {
    fbq('set', 'autoConfig', false, META_PIXEL_ID)
    fbq('init', META_PIXEL_ID)
    fbq.initialized = true
  }
  fbq('consent', 'grant')
  return fbq
}

function revokeMetaPixelConsent() {
  window.fbq?.('consent', 'revoke')
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
  }
}

export function MetaPixelConsent({
  title,
  description,
  acceptLabel,
  rejectLabel,
  manageLabel,
  saveError,
}: Props) {
  const pathname = usePathname()
  const savedConsent = useSyncExternalStore(
    subscribeToConsent,
    readConsent,
    () => null,
  )
  const [sessionConsent, setSessionConsent] = useState<Consent | null>(null)
  const [editing, setEditing] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const lastTrackedRoute = useRef<string | null>(null)
  const consent = sessionConsent ?? savedConsent

  useEffect(() => {
    const openPreferences = () => setEditing(true)
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPreferences)
    return () =>
      window.removeEventListener(OPEN_PREFERENCES_EVENT, openPreferences)
  }, [])

  useEffect(() => {
    if (consent !== 'accepted') {
      if (consent === 'rejected') revokeMetaPixelConsent()
      lastTrackedRoute.current = null
      return
    }
    if (
      !pathname ||
      !isTrackablePublicRoute(pathname) ||
      window.location.search ||
      window.location.hash ||
      hasTrackingOptOut()
    ) {
      return
    }

    const fbq = initializeMetaPixel()
    if (lastTrackedRoute.current !== pathname) {
      fbq('track', 'PageView')
      lastTrackedRoute.current = pathname
    }
  }, [consent, pathname])

  function chooseConsent(choice: Consent) {
    setStorageError(false)
    try {
      window.localStorage.setItem(CONSENT_KEY, choice)
      setSessionConsent(null)
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
      setEditing(false)
    } catch {
      setStorageError(true)
      if (choice === 'rejected') {
        setSessionConsent('rejected')
        setEditing(false)
      }
    }
  }

  function openPreferences() {
    setEditing(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreferences}
        className="min-h-11 rounded-full px-2 text-xs font-medium underline underline-offset-4 hover:text-foreground"
      >
        {manageLabel}
      </button>
      {(consent === null || editing) && (
        <section
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-120 border-t bg-card p-4 shadow-2xl sm:p-5"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
              {storageError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => chooseConsent('accepted')}
                className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                {acceptLabel}
              </button>
              <button
                type="button"
                onClick={() => chooseConsent('rejected')}
                className="min-h-11 rounded-full border px-4 text-sm font-semibold"
              >
                {rejectLabel}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
