'use client'
import { useSyncExternalStore } from 'react'
const query = '(prefers-reduced-motion: reduce)'
function subscribe(callback: () => void) {
  const media =
    typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
  media?.addEventListener?.('change', callback)
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduce-motion'],
  })
  return () => {
    media?.removeEventListener?.('change', callback)
    observer.disconnect()
  }
}
export function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.hasAttribute('data-reduce-motion') ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia(query).matches,
    () => true,
  )
}
