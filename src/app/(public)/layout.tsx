import type { Viewport } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Analytics01Icon, Login01Icon } from '@hugeicons/core-free-icons'
import { PublicNavigation } from '@/components/public-site/public-navigation'
import styles from '@/components/public-site/landing.module.css'
import { PUBLIC_NAV_LINKS } from '@/components/public-site/navigation-links'
import { PUBLIC_NAV_GROUPS } from '@/components/public-site/navigation-links'
import { PublicIcon } from '@/components/public-site/public-icon'
import { PublicBrand } from '@/components/public-site/public-brand'
import { PublicHeader } from '@/components/public-site/public-header'
import { AppEntryLink } from '@/components/public-site/app-entry-link'
import { CookieSettingsButton } from '@/components/public-site/cookie-settings-button'
import { LaunchBanner } from '@/components/public-site/launch-banner'
import { JsonLd } from '@/components/json-ld'
import { SITE_NAME, SITE_URL } from '@/lib/seo'
import { localizedPublicHref } from '@/components/public-site/navigation-links'

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
  const organizationData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/android-chrome-512x512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: locale,
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
      },
    ],
  }

  return (
    <div
      data-public-site
      className={`${styles.site} flex min-h-screen flex-col`}
    >
      <JsonLd data={organizationData} />
      <LaunchBanner
        message={t.rich('landing.announcement', {
          b: (chunks) => <b>{chunks}</b>,
        })}
        closeLabel={t('landing.announcementClose')}
      />
      <PublicHeader>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <PublicBrand />
          </Link>
          <div className={styles.headerActions}>
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
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                    className={styles.footerSectionIcon}
                  >
                    <rect
                      x="3"
                      y="3"
                      width="4"
                      height="4"
                      rx="1"
                      fill="currentColor"
                    />
                    <rect
                      x="11"
                      y="3"
                      width="4"
                      height="4"
                      rx="1"
                      fill="currentColor"
                    />
                    <rect
                      x="3"
                      y="11"
                      width="4"
                      height="4"
                      rx="1"
                      fill="currentColor"
                    />
                    <rect
                      x="11"
                      y="11"
                      width="4"
                      height="4"
                      rx="1"
                      fill="currentColor"
                    />
                  </svg>
                  {t(`footer.${group}`)}
                </h2>
                <ul>
                  {PUBLIC_NAV_LINKS.filter((link) => link.group === group).map(
                    (link) => {
                      const { href, labelKey, icon } = link
                      const external = 'external' in link && link.external
                      return (
                        <li key={href}>
                          <Link
                            href={localizedPublicHref(href, locale)}
                            target={external ? '_blank' : undefined}
                            rel={external ? 'noreferrer' : undefined}
                          >
                            <PublicIcon icon={icon} size={18} />
                            <span>{t(`nav.${labelKey}`)}</span>
                          </Link>
                        </li>
                      )
                    },
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
            <CookieSettingsButton label={t('cookieConsent.manage')} />
          </div>
        </div>
      </footer>
    </div>
  )
}
