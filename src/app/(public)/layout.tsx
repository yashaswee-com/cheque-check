import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { LocalePicker } from '@/components/public-site/locale-picker'

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
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="min-h-11 inline-flex items-center text-lg font-bold tracking-tight text-primary"
          >
            ChequeCheck
          </Link>
          <nav
            aria-label={t('nav.navigation')}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          >
            <Link
              className="min-h-11 inline-flex items-center hover:underline"
              href="/features"
            >
              {t('nav.features')}
            </Link>
            <Link
              className="min-h-11 inline-flex items-center hover:underline"
              href="/pricing"
            >
              {t('nav.pricing')}
            </Link>
            <Link
              className="min-h-11 inline-flex items-center hover:underline"
              href="/privacy"
            >
              {t('nav.privacy')}
            </Link>
            <Link
              className="min-h-11 inline-flex items-center hover:underline"
              href="/contact"
            >
              {t('nav.contact')}
            </Link>
            <LocalePicker locale={locale as 'en' | 'hi' | 'hi-en'} />
            <Link
              href="/login"
              className="min-h-11 inline-flex items-center rounded-full border px-4 font-medium hover:bg-muted"
            >
              {t('nav.signIn')}
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{t('footer.tagline')}</p>
          <span>
            © {new Date().getFullYear()} {t('footer.copyright')}
          </span>
        </div>
      </footer>
    </div>
  )
}
