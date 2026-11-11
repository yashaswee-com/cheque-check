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
  confirmInstall,
  getManualInstallInstructions,
  getInstallPrompt,
  INSTALL_DISMISSED_KEY,
  INSTALL_EVENT,
  isInstalled,
  isIOS,
} from '@/lib/pwa-install'

export function PwaInstallCard({
  onResolved,
  variant = 'modal',
}: {
  onResolved?: (resolved: boolean) => void
  variant?: 'modal' | 'inline'
} = {}) {
  const t = useTranslations('PWA')
  const [visible, setVisible] = useState(false)
  const [ios, setIOS] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [promptAvailable, setPromptAvailable] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [instructions, setInstructions] = useState<
    ReturnType<typeof getManualInstallInstructions>
  >('browserInstructions')
  const prompting = useRef(false)
  const awaitingInstall = useRef(false)
  const confirmedInstall = useRef(false)

  useEffect(() => {
    const refresh = () => {
      let dismissed = false
      if (variant === 'modal') {
        try {
          dismissed = sessionStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'
        } catch (error) {
          console.error('Cannot read install preference', error)
        }
      }
      setIOS(isIOS())
      setInstructions(getManualInstallInstructions())
      const hasPrompt = getInstallPrompt() !== null
      setPromptAvailable(hasPrompt)
      const visible =
        !confirmedInstall.current &&
        !isInstalled() &&
        !dismissed &&
        (variant === 'inline' ||
          awaitingInstall.current ||
          isIOS() ||
          hasPrompt)
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
      confirmInstall()
      refresh()
    }
    window.addEventListener('appinstalled', installed)
    const displayMode = window.matchMedia('(display-mode: standalone)')
    displayMode.addEventListener?.('change', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(INSTALL_EVENT, refresh)
      window.removeEventListener('appinstalled', installed)
      displayMode.removeEventListener?.('change', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [onResolved, variant])

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
    if (prompting.current || awaitingInstall.current) return
    const prompt = getInstallPrompt()
    if (!prompt) {
      console.error('App installation prompt is unavailable')
      setPromptAvailable(false)
      setError(true)
      return
    }
    prompting.current = true
    setBusy(true)
    setError(false)
    setDeclined(false)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      awaitingInstall.current = outcome === 'accepted'
      setInstalling(awaitingInstall.current && !confirmedInstall.current)
      clearInstallPrompt()
      if (outcome === 'dismissed') {
        if (variant === 'modal') dismiss()
        else setDeclined(true)
      }
    } catch (error) {
      console.error('App installation failed', error)
      setError(true)
    } finally {
      prompting.current = false
      setBusy(false)
    }
  }

  if (!visible) return null
  if (variant === 'inline') {
    return (
      <section
        aria-labelledby="settings-install-title"
        className="space-y-3 rounded-lg border bg-card p-5"
      >
        <h2 id="settings-install-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        {installing ? (
          <p role="status" className="text-sm">
            {t('inlineWaiting')}
          </p>
        ) : (
          !promptAvailable && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t(instructions)}</p>
              {!ios && <p role="status">{t('unavailable')}</p>}
            </div>
          )
        )}
        {declined && !installing && (
          <p role="status" className="text-sm">
            {t('declined')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('error')}
          </p>
        )}
        {promptAvailable && !ios && (
          <Button onClick={install} disabled={busy || installing}>
            {t('install')}
          </Button>
        )}
      </section>
    )
  }
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
