import type { Viewport } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Analytics01Icon, Login01Icon } from '@hugeicons/core-free-icons'
import { PublicNavigation } from '@/components/public-site/public-navigation'
import styles from '@/components/public-site/landing.module.css'
import { PUBLIC_NAV_LINKS } from '@/components/public-site/navigation-links'
import {
  PUBLIC_NAV_GROUPS,
  PUBLIC_NAV_GROUP_ICONS,
} from '@/components/public-site/navigation-links'
import { PublicIcon } from '@/components/public-site/public-icon'
import { PublicBrand } from '@/components/public-site/public-brand'
import { PublicHeader } from '@/components/public-site/public-header'
import { AppEntryLink } from '@/components/public-site/app-entry-link'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
}

export default async function PublicSiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('PublicSite'),
  ])

  return (
    <div
      data-public-site
      className={`${styles.site} flex min-h-screen flex-col`}
    >
      <PublicHeader>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <PublicBrand />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <AppEntryLink
              href="/login"
              className={styles.signIn}
              aria-label={t('nav.signIn')}
              title={t('nav.signIn')}
            >
              <PublicIcon icon={Login01Icon} size={20} />
              <span>{t('nav.signIn')}</span>
            </AppEntryLink>
            <PublicNavigation locale={locale as 'en' | 'hi' | 'hi-en'} />
          </div>
        </div>
      </PublicHeader>
      <div className="flex-1">{children}</div>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerIntro}>
            <Link href="/" className={styles.brand}>
              <PublicBrand />
            </Link>
            <p>{t('footer.tagline')}</p>
          </div>
          <div className={styles.footerGroups}>
            {PUBLIC_NAV_GROUPS.map((group) => (
              <section
                key={group}
                className={styles.footerGroup}
                aria-labelledby={`footer-${group}`}
              >
                <h2 id={`footer-${group}`}>
                  <PublicIcon icon={PUBLIC_NAV_GROUP_ICONS[group]} size={18} />
                  {t(`footer.${group}`)}
                </h2>
                <ul>
                  {PUBLIC_NAV_LINKS.filter((link) => link.group === group).map(
                    ({ href, labelKey, icon }) => (
                      <li key={href}>
                        <Link href={href}>
                          <PublicIcon icon={icon} size={18} />
                          <span>{t(`nav.${labelKey}`)}</span>
                        </Link>
                      </li>
                    ),
                  )}
                  {group === 'support' && (
                    <li>
                      <Link
                        href="https://chequecheck.openstatus.dev/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <PublicIcon icon={Analytics01Icon} size={18} />
                        <span>Status</span>
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            ))}
          </div>
          <div className={styles.footerBottom}>
            <span>
              © {new Date().getFullYear()} {t('footer.copyright')}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
