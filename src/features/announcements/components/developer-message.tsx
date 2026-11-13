'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, Message01Icon } from '@hugeicons/core-free-icons'
import { useAnnouncement } from '../hooks/use-announcement'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { PostOnboardingTour } from '@/features/tour/components/post-onboarding-tour'
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
    return onboarding ? <PostOnboardingTour /> : null
  const body =
    message.content[locale === 'hi' || locale === 'hi-en' ? locale : 'en']
  if (!onboarding)
    return (
      <section className="rounded-xl border p-4 space-y-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <HugeiconsIcon
            icon={Message01Icon}
            className="size-5"
            aria-hidden="true"
          />
          {t('title')}
        </h2>
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
          <SheetTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Message01Icon}
              className="size-5"
              aria-hidden="true"
            />
            {t('title')}
          </SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        <p className="px-4">{message.author}</p>
        {error && (
          <p role="alert" className="px-4">
            {t('saveError')}
          </p>
        )}
        <Button
          className="m-4 font-normal"
          disabled={busy}
          onClick={() => void dismiss()}
        >
          {t('continue')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="ml-2 size-4"
            aria-hidden="true"
          />
        </Button>
      </SheetContent>
    </Sheet>
  )
}
