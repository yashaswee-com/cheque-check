'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
const subscribe = () => () => {}
const COVER_MS = 1500

/** Win+Shift+S and Cmd+Shift+3/4/5 begin with Meta+Shift; cover before the final key. */
function isCaptureShortcut(event: KeyboardEvent) {
  return (
    event.key === 'PrintScreen' ||
    (event.type === 'keydown' && event.metaKey && event.shiftKey)
  )
}

function isPrintShortcut(event: KeyboardEvent) {
  return (
    event.type === 'keydown' &&
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'p'
  )
}

export function PrivacyShield() {
  const { profile } = useProfile()
  const enabled = profile?.privacy_cover !== false
  const t = useTranslations('Security')
  const cover = useRef<HTMLDivElement>(null)
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  useEffect(() => {
    if (!mounted) return
    let screenshot = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (cover.current)
        cover.current.hidden =
          !enabled ||
          (!screenshot &&
            document.visibilityState !== 'hidden' &&
            document.hasFocus())
    }
    const coverBriefly = () => {
      screenshot = true
      refresh()
      clearTimeout(timer)
      timer = setTimeout(() => {
        screenshot = false
        refresh()
      }, COVER_MS)
    }
    const key = (event: KeyboardEvent) => {
      if (!enabled) return
      if (isPrintShortcut(event)) {
        event.preventDefault()
        return
      }
      if (!isCaptureShortcut(event)) return
      event.preventDefault()
      coverBriefly()
    }
    const beforePrint = () => {
      if (!enabled) return
      screenshot = true
      refresh()
    }
    const afterPrint = () => {
      screenshot = false
      refresh()
    }
    // Mutate visibility synchronously: waiting for a React render can expose a preview frame.
    const blur = () => {
      if (cover.current && enabled) cover.current.hidden = false
    }
    refresh()
    window.addEventListener('blur', blur)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', key, true)
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    document.documentElement.toggleAttribute('data-privacy-cover', enabled)
    return () => {
      document.documentElement.removeAttribute('data-privacy-cover')
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
      clearTimeout(timer)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('keyup', key, true)
    }
  }, [enabled, mounted])
  return mounted
    ? createPortal(
        <div
          ref={cover}
          hidden
          data-testid="privacy-cover"
          data-sentry-mask
          data-clarity-mask="true"
          className="fixed inset-0 z-[2147483647] bg-primary"
        >
          <div
            data-testid="privacy-cover-frame"
            className="app-shell-frame absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-white text-black dark:bg-black dark:text-white"
          >
            <div
              role="status"
              className="flex h-full flex-col items-center justify-center gap-3"
            >
              <img
                src="/android-chrome-192x192.png"
                alt=""
                width={64}
                height={64}
              />
              <p className="font-bold">ChequeCheck</p>
              <p>{t('covered')}</p>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null
}
