import { useSyncExternalStore } from 'react'
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_KEY,
  OPEN_PREFERENCES_EVENT,
} from './contracts'

export function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

export function subscribeConsent(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
  }
}

export function useMarketingConsent() {
  return useSyncExternalStore(subscribeConsent, readConsent, () => null)
}

/** Reopens the marketing cookie banner from any settings entry point. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))
}
