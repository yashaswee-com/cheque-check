'use client'

import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Notification01Icon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { useUnreadCount } from '../hooks/use-inbox'

export function NotificationBell() {
  const t = useTranslations('Inbox')
  const count = useUnreadCount()
  return (
    <Link
      href="/notifications"
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      aria-label={
        count.error ? t('countError') : t('bell', { count: count.data ?? 0 })
      }
    >
      <HugeiconsIcon
        icon={Notification01Icon}
        className="h-5 w-5 text-muted-foreground"
      />
      {count.error ? (
        <span className="absolute right-0 top-0 text-xs" aria-hidden="true">
          !
        </span>
      ) : (
        !!count.data && (
          <span
            className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground"
            aria-hidden="true"
          >
            {count.data > 99 ? '99+' : count.data}
          </span>
        )
      )}
    </Link>
  )
}
