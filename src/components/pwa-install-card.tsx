'use client'

import { useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  clearInstallPrompt,
  getInstallPrompt,
  INSTALL_DISMISSED_KEY,
  INSTALL_EVENT,
  isInstalled,
  isIOS,
} from '@/lib/pwa-install'

export function PwaInstallCard({
  onResolved,
}: { onResolved?: (resolved: boolean) => void } = {}) {
  const t = useTranslations('PWA')
  const [visible, setVisible] = useState(false)
  const [ios, setIOS] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [installing, setInstalling] = useState(false)
  const awaitingInstall = useRef(false)
  const confirmedInstall = useRef(false)

  useEffect(() => {
    const refresh = () => {
      let dismissed = false
      try {
        dismissed = sessionStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'
      } catch (error) {
        console.error('Cannot read install preference', error)
      }
      setIOS(isIOS())
      const visible =
        !confirmedInstall.current &&
        !isInstalled() &&
        !dismissed &&
        (awaitingInstall.current || isIOS() || getInstallPrompt() !== null)
      setVisible(visible)
      onResolved?.(
        confirmedInstall.current || (!visible && !awaitingInstall.current),
      )
    }
    refresh()
    window.addEventListener(INSTALL_EVENT, refresh)
    const installed = () => {
      awaitingInstall.current = false
      confirmedInstall.current = true
      setInstalling(false)
      refresh()
    }
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener(INSTALL_EVENT, refresh)
      window.removeEventListener('appinstalled', installed)
    }
  }, [onResolved])

  const dismiss = () => {
    try {
      sessionStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
      setVisible(false)
      awaitingInstall.current = false
      setInstalling(false)
      onResolved?.(true)
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
      awaitingInstall.current = outcome === 'accepted'
      setInstalling(awaitingInstall.current && !confirmedInstall.current)
      clearInstallPrompt()
      if (outcome === 'dismissed') dismiss()
    } catch (error) {
      console.error('App installation failed', error)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent
        scrollable
        className="max-h-[min(90dvh,calc(100dvh-2rem))]"
      >
        <DialogTitle className="pr-8">{t('title')}</DialogTitle>
        <DialogDescription>
          {ios ? t('iosInstructions') : t('description')}
        </DialogDescription>
        {installing && <p role="status">{t('waiting')}</p>}
        {error && <p role="alert">{t('error')}</p>}
        <div className="flex flex-wrap gap-2">
          {!ios && (
            <Button onClick={install} disabled={busy || installing}>
              {t('install')}
            </Button>
          )}
          <Button variant="outline" onClick={dismiss} disabled={busy}>
            {t('later')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
