'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Popover, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { LocalePicker } from './locale-picker'
import { PUBLIC_NAV_GROUPS, PUBLIC_NAV_LINKS } from './navigation-links'
import { AppEntryLink } from './app-entry-link'
import { PublicIcon } from './public-icon'
import styles from './landing.module.css'

export function PublicNavigation({
  locale,
}: {
  locale: 'en' | 'hi' | 'hi-en'
}) {
  const t = useTranslations('PublicSite')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        className={styles.menuTrigger}
        aria-label={t('nav.navigation')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={() => triggerRef.current?.closest('header') ?? null}
          align="end"
          side="bottom"
          sideOffset={({ anchor }) => -anchor.height}
          positionMethod="fixed"
          className={styles.menuPositioner}
        >
          <PopoverPrimitive.Popup className={styles.menu}>
            <PopoverTitle className="sr-only">
              {t('nav.navigation')}
            </PopoverTitle>
            <div className={styles.menuTop}>
              <span className={styles.brand}>CHEQUE—CHECK</span>
              <PopoverPrimitive.Close
                className={styles.menuTrigger}
                aria-label={t('nav.close')}
              >
                <span aria-hidden="true">×</span>
              </PopoverPrimitive.Close>
            </div>
            <nav aria-label={t('nav.navigation')} data-testid="public-nav">
              {PUBLIC_NAV_GROUPS.map((group) => (
                <section
                  key={group}
                  className={styles.menuGroup}
                  aria-label={t(`footer.${group}`)}
                >
                  <h2>{t(`footer.${group}`)}</h2>
                  {PUBLIC_NAV_LINKS.filter((link) => link.group === group).map(
                    ({ href, labelKey, icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                      >
                        <PublicIcon icon={icon} size={20} />
                        <span>{t(`nav.${labelKey}`)}</span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={16}
                          aria-hidden="true"
                        />
                      </Link>
                    ),
                  )}
                </section>
              ))}
            </nav>
            <div className={styles.menuActions}>
              <AppEntryLink href="/login" className={styles.signIn}>
                {t('nav.signIn')}
              </AppEntryLink>
              <AppEntryLink href="/signup" className={styles.primaryCta}>
                {t('nav.getStarted')}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={18}
                  aria-hidden="true"
                />
              </AppEntryLink>
            </div>
            <div className={styles.menuLocale}>
              <span>{t('nav.language')}</span>
              <LocalePicker locale={locale} />
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  )
}
