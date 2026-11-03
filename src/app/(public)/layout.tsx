import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { LocalePicker } from '@/components/public-site/locale-picker'
import { AppEntryLink } from '@/components/public-site/app-entry-link'

const NAV_LINKS = ['features', 'pricing', 'privacy', 'contact'] as const
const navLink =
  'inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground'

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
      <header className="sticky top-0 z-40 shrink-0 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 px-4 py-2 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="min-h-11 inline-flex shrink-0 items-center text-lg font-bold tracking-tight text-primary"
          >
            ChequeCheck
          </Link>
          <nav
            aria-label={t('nav.navigation')}
            data-testid="public-nav"
            className="scroll-fade-x scroll-fade-4 order-last flex w-full gap-1 overflow-x-auto pb-1 [scrollbar-width:none] md:order-none md:w-auto md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
          >
            {NAV_LINKS.map((item) => (
              <Link key={item} className={navLink} href={`/${item}`}>
                {t(`nav.${item}`)}
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            <LocalePicker locale={locale as 'en' | 'hi' | 'hi-en'} />
            <AppEntryLink
              href="/login"
              data-testid="public-sign-in"
              className="min-h-11 inline-flex shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {t('nav.signIn')}
            </AppEntryLink>
          </div>
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
