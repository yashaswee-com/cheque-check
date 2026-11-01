'use client'

import { useTranslations } from 'next-intl'

type Locale = 'en' | 'hi' | 'hi-en'

export function LocalePicker({ locale }: { locale: Locale }) {
  const t = useTranslations('PublicSite')

  return (
    <select
      id="public-locale"
      aria-label={t('nav.language')}
      className="min-h-11 rounded-md border bg-background px-3 text-sm"
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
  )
}
