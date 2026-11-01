'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  clearInstallPrompt,
  getInstallPrompt,
  INSTALL_DISMISSED_KEY,
  INSTALL_EVENT,
  isInstalled,
  isIOS,
} from '@/lib/pwa-install'

export function PwaInstallCard() {
  const t = useTranslations('PWA')
  const [visible, setVisible] = useState(false)
  const [ios, setIOS] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const refresh = () => {
      let dismissedUntil = 0
      try {
        dismissedUntil = Number(localStorage.getItem(INSTALL_DISMISSED_KEY))
      } catch (error) {
        console.error('Cannot read install preference', error)
      }
      setIOS(isIOS())
      setVisible(
        !isInstalled() &&
          Date.now() >= dismissedUntil &&
          (isIOS() || getInstallPrompt() !== null),
      )
    }
    refresh()
    window.addEventListener(INSTALL_EVENT, refresh)
    window.addEventListener('appinstalled', refresh)
    return () => {
      window.removeEventListener(INSTALL_EVENT, refresh)
      window.removeEventListener('appinstalled', refresh)
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(
        INSTALL_DISMISSED_KEY,
        String(Date.now() + 7 * 86400000),
      )
      setVisible(false)
    } catch (error) {
      console.error('Cannot save install preference', error)
      setError(true)
    }
  }
  const install = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) return
    setBusy(true)
    setError(false)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'dismissed') dismiss()
      else setVisible(false)
    } catch (error) {
      console.error('App installation failed', error)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return (
    <aside
      className="mx-4 mt-4 rounded-xl border p-4 space-y-2"
      aria-label={t('title')}
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-sm">{ios ? t('iosInstructions') : t('description')}</p>
      {error && <p role="alert">{t('error')}</p>}
      <div className="flex gap-2">
        {!ios && (
          <Button onClick={install} disabled={busy}>
            {t('install')}
          </Button>
        )}
        <Button variant="outline" onClick={dismiss} disabled={busy}>
          {t('later')}
        </Button>
      </div>
    </aside>
  )
}
