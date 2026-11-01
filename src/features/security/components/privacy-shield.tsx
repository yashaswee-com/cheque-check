'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
const subscribe = () => () => {}

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
    const key = (event: KeyboardEvent) => {
      if (!enabled || event.key !== 'PrintScreen') return
      event.preventDefault()
      screenshot = true
      refresh()
      clearTimeout(timer)
      timer = setTimeout(() => {
        screenshot = false
        refresh()
      }, 1500)
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
    return () => {
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
          className="fixed inset-0 z-[2147483647] bg-white text-black dark:bg-black dark:text-white"
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
        </div>,
        document.body,
      )
    : null
}
