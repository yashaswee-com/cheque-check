import type { Viewport } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Analytics01Icon } from '@hugeicons/core-free-icons'
import { PublicNavigation } from '@/components/public-site/public-navigation'
import { AppEntryLink } from '@/components/public-site/app-entry-link'
import { MetaPixelConsent } from '@/components/public-site/meta-pixel-consent'
import styles from '@/components/public-site/landing.module.css'
import { PUBLIC_NAV_LINKS } from '@/components/public-site/navigation-links'
import { PUBLIC_NAV_GROUPS } from '@/components/public-site/navigation-links'
import { PublicIcon } from '@/components/public-site/public-icon'

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
      <header className={`${styles.header} sticky top-0 z-40`}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <svg width="25" height="25" viewBox="0 0 28 28" aria-hidden="true">
              <rect
                x="2"
                y="5"
                width="24"
                height="18"
                rx="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="m8 14 4 4 8-8M7 9h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              CHEQUE<span className={styles.brandDivider}>—</span>CHECK
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <AppEntryLink
              href="/login"
              data-testid="public-sign-in"
              className={styles.signIn}
            >
              {t('nav.signIn')}
            </AppEntryLink>
            <PublicNavigation locale={locale as 'en' | 'hi' | 'hi-en'} />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerIntro}>
            <Link href="/" className={styles.brand}>
              CHEQUE—CHECK
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
                <h2 id={`footer-${group}`}>{t(`footer.${group}`)}</h2>
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
            <MetaPixelConsent
              title={t('cookieConsent.title')}
              description={t('cookieConsent.description')}
              acceptLabel={t('cookieConsent.accept')}
              rejectLabel={t('cookieConsent.reject')}
              manageLabel={t('cookieConsent.manage')}
              saveError={t('cookieConsent.saveError')}
            />
          </div>
        </div>
      </footer>
    </div>
  )
}
