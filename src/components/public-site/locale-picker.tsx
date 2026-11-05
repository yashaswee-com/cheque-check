'use client'

import { ArrowDown02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslations } from 'next-intl'

type Locale = 'en' | 'hi' | 'hi-en'

export function LocalePicker({ locale }: { locale: Locale }) {
  const t = useTranslations('PublicSite')

  return (
    <div className="relative">
      <select
        id="public-locale"
        aria-label={t('nav.language')}
        className="min-h-11 appearance-none rounded-md border bg-background py-2 pl-3 pr-8 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        value={locale}
        onChange={(event) => {
          const nextLocale = event.currentTarget.value
          document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
          window.location.reload()
        }}
      >
        {(['en', 'hi', 'hi-en'] as const).map((value) => (
          <option value={value} key={value}>
            {t(`locales.${value}`)}
          </option>
        ))}
      </select>
      <HugeiconsIcon
        icon={ArrowDown02Icon}
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
