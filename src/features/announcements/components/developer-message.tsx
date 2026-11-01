'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAnnouncement } from '../hooks/use-announcement'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { PwaInstallCard } from '@/components/pwa-install-card'
import { logger } from '@/lib/logger'

export function DeveloperMessage({
  onboarding = false,
}: {
  onboarding?: boolean
}) {
  const t = useTranslations('DeveloperMessage')
  const locale = useLocale()
  const query = useAnnouncement()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const dismiss = async () => {
    if (busy) return
    setBusy(true)
    try {
      await query.acknowledge()
      setError(false)
    } catch (error) {
      logger.error('Developer message acknowledgement failed', error)
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  if (query.error) return <p role="alert">{t('loadError')}</p>
  if (query.isLoading) return null
  const message = query.data
  if (!message || (onboarding && message.read))
    return onboarding ? <PwaInstallCard /> : null
  const body =
    message.content[locale === 'hi' || locale === 'hi-en' ? locale : 'en']
  if (!onboarding)
    return (
      <section className="rounded-xl border p-4 space-y-2">
        <h2 className="font-semibold">{t('title')}</h2>
        <p>{body}</p>
        <p className="text-sm">{message.author}</p>
      </section>
    )
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) void dismiss()
      }}
    >
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        <p className="px-4">{message.author}</p>
        {error && (
          <p role="alert" className="px-4">
            {t('saveError')}
          </p>
        )}
        <Button className="m-4" disabled={busy} onClick={() => void dismiss()}>
          {t('continue')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
