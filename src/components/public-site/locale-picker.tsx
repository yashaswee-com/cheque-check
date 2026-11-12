'use client'

import { ArrowDown02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslations } from 'next-intl'
import styles from './landing.module.css'

type Locale = 'en' | 'hi' | 'hi-en'

export function LocalePicker({ locale }: { locale: Locale }) {
  const t = useTranslations('PublicSite')

  return (
    <div className="relative">
      <select
        id="public-locale"
        aria-label={t('nav.language')}
        className={styles.localeSelect}
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
      <HugeiconsIcon icon={ArrowDown02Icon} className={styles.localeChevron} />
    </div>
  )
}
