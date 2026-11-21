'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { LocalePicker } from './locale-picker'
import { AppearancePicker } from './appearance-picker'
import {
  PUBLIC_NAV_GROUPS,
  PUBLIC_NAV_GROUP_ICONS,
  PUBLIC_NAV_LINKS,
  localizedPublicHref,
} from './navigation-links'
import { PublicBrand } from './public-brand'
import { PublicIcon } from './public-icon'
import styles from './landing.module.css'

export function PublicNavigation({
  locale,
}: {
  locale: 'en' | 'hi' | 'hi-en'
}) {
  const pathname = usePathname()
  const t = useTranslations('PublicSite')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (pathname === '/') {
    return (
      <div className={styles.headerControls}>
        <LocalePicker locale={locale} />
        <AppearancePicker />
      </div>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuTrigger}
        aria-label={t('nav.navigation')}
        aria-expanded={open}
        aria-controls="public-navigation-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id="public-navigation-menu"
          className={`${styles.menuPositioner} fixed top-3 left-1/2 -translate-x-1/2`}
        >
          <div className={styles.menu}>
            <div className={styles.menuTop}>
              <span className={styles.brand}>
                <PublicBrand />
              </span>
              <button
                type="button"
                className={styles.menuTrigger}
                aria-label={t('nav.close')}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <nav aria-label={t('nav.navigation')} data-testid="public-nav">
              {PUBLIC_NAV_GROUPS.map((group) => (
                <section
                  key={group}
                  className={styles.menuGroup}
                  aria-label={t(`footer.${group}`)}
                >
                  <h2>
                    <PublicIcon
                      icon={PUBLIC_NAV_GROUP_ICONS[group]}
                      size={16}
                    />
                    {t(`footer.${group}`)}
                  </h2>
                  {PUBLIC_NAV_LINKS.filter((link) => link.group === group).map(
                    (link) => {
                      const { href, labelKey, icon } = link
                      const external = 'external' in link && link.external
                      return (
                        <Link
                          key={href}
                          href={localizedPublicHref(href, locale)}
                          onClick={() => setOpen(false)}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer' : undefined}
                        >
                          <PublicIcon icon={icon} size={20} />
                          <span>{t(`nav.${labelKey}`)}</span>
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            size={16}
                            aria-hidden="true"
                          />
                        </Link>
                      )
                    },
                  )}
                </section>
              ))}
            </nav>
            <div className={styles.menuLocale}>
              <span>{t('nav.language')}</span>
              <div className={styles.headerControls}>
                <LocalePicker locale={locale} />
                <AppearancePicker />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
