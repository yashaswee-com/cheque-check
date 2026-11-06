import { cleanup, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import english from '../../messages/en.json'
import hindi from '../../messages/hi.json'
import hinglish from '../../messages/hi-en.json'
import LandingPage from './(public)/page'
import PublicFeaturesPage from './(public)/features/page'
import PublicPricingPage from './(public)/pricing/page'
import PublicPrivacyPage from './(public)/privacy/page'
import PublicSiteLayout from './(public)/layout'
import ChequeBouncePage from './(public)/cheque-bounce/page'

const catalogs = { en: english, hi: hindi, 'hi-en': hinglish }
const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'hi' | 'hi-en',
  getUser: vi.fn(),
  redirect: vi.fn(),
  getTranslations: vi.fn(),
  listProducts: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getLocale: () => Promise.resolve(mocks.locale),
  getTranslations: (namespace: string) => mocks.getTranslations(namespace),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    mocks.redirect(href)
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
}))
vi.mock('@/features/public-site/services/public-pricing.service', () => ({
  publicPricingService: { listProducts: mocks.listProducts },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.logError },
}))

function translator(namespace: string) {
  return (key: string, values?: Record<string, string>) => {
    const result = namespace
      .split('.')
      .concat(key.split('.'))
      .reduce<unknown>(
        (value, part) =>
          typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)[part]
            : undefined,
        catalogs[mocks.locale],
      )
    if (typeof result !== 'string') return key
    return Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, value),
      result,
    )
  }
}

function renderPage(children: React.ReactNode, locale = mocks.locale) {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {children}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  mocks.locale = 'en'
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  mocks.getTranslations.mockImplementation(async (namespace: string) =>
    translator(namespace),
  )
  mocks.listProducts.mockResolvedValue([
    {
      id: 'lifetime_premium',
      name: 'Lifetime Premium',
      amount: 30000,
      currency: 'INR',
      transaction_type: 'lifetime',
    },
  ])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('public site pages', () => {
  it.each([
    ['en', english],
    ['hi', hindi],
    ['hi-en', hinglish],
  ] as const)(
    'renders the localized landing page for %s',
    async (locale, catalog) => {
      mocks.locale = locale
      const page = await LandingPage()
      renderPage(page, locale)
      expect(
        screen.getByRole('heading', { name: catalog.PublicSite.landing.title }),
      ).toBeVisible()
      const ctas = screen.getAllByRole('link', {
        name: catalog.PublicSite.landing.primaryCta,
      })
      expect(ctas).toHaveLength(2)
      for (const cta of ctas) {
        expect(cta).toHaveAttribute('href', '/signup')
        expect(cta).toHaveAttribute('data-app-entry')
      }
      expect(
        screen.getByRole('heading', {
          name: catalog.PublicSite.landing.howTitle,
        }),
      ).toBeVisible()
      expect(
        screen.getByRole('figure', {
          name: catalog.PublicSite.landing.previewLabel,
        }),
      ).toBeVisible()
      expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(9)
    },
  )

  it('keeps the existing signed-in root redirect', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'signed-in-user' } },
      error: null,
    })
    await expect(LandingPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('shows public features in Hindi while leaving the signed-in catalogue at its own route', async () => {
    mocks.locale = 'hi'
    const page = await PublicFeaturesPage()
    renderPage(page, 'hi')
    expect(
      screen.getByRole('heading', { name: hindi.PublicSite.features.title }),
    ).toBeVisible()
    expect(screen.getByText(hindi.PublicSite.features.cheques)).toBeVisible()
  })

  it('shows prices from the active catalogue and links purchase through the authenticated catalogue', async () => {
    const page = await PublicPricingPage()
    renderPage(page)
    expect(
      screen.getByRole('heading', { name: english.PublicSite.pricing.title }),
    ).toBeVisible()
    expect(screen.getByText('₹300.00')).toBeVisible()
    expect(
      screen.getByRole('link', { name: english.PublicSite.pricing.purchase }),
    ).toHaveAttribute('href', '/features/catalog?purchase=lifetime_premium')
    expect(
      screen.getByRole('link', { name: english.PublicSite.pricing.purchase }),
    ).toHaveAttribute('data-app-entry')
    expect(
      screen.getByText(english.PublicSite.pricing.catalogNote),
    ).toBeVisible()
  })

  it('uses the existing localized legal privacy content verbatim', async () => {
    const page = await PublicPrivacyPage()
    renderPage(page)
    expect(screen.getByText(english.Settings.privacyIntroContent)).toBeVisible()
    expect(screen.getByText(english.Monitoring.privacyDisclosure)).toBeVisible()
    expect(
      screen.getByRole('heading', {
        name: `7. ${english.Settings.contactUs}`,
      }),
    ).toBeVisible()
  })

  it('renders the cheque bounce tool page with the timeline calculator', async () => {
    const page = await ChequeBouncePage()
    renderPage(page)

    expect(
      screen.getByRole('heading', { name: /^Cheque Bounce$/i }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: /Timeline Calculator/i }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Calculate Timeline/i }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', {
        name: /^What is a Cheque Bounce Case\?$/i,
      }),
    ).toBeVisible()
  })

  it('renders an accessible, responsive public navigation with a locale control', async () => {
    const layout = await PublicSiteLayout({ children: <p>Page content</p> })
    renderPage(layout)
    expect(screen.getByRole('banner')).toHaveClass('sticky', 'top-0', 'z-40')
    const nav = screen.getByRole('navigation', {
      name: english.PublicSite.nav.navigation,
    })
    expect(
      within(nav).getByRole('link', {
        name: english.PublicSite.nav.features,
      }),
    ).toHaveAttribute('href', '/features')
    expect(nav).toHaveClass('order-last', 'w-full', 'overflow-x-auto')
    expect(nav).toHaveClass('md:order-none', 'md:w-auto')
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
    const signIn = screen.getByRole('link', {
      name: english.PublicSite.nav.signIn,
    })
    expect(signIn).toHaveAttribute('href', '/login')
    expect(signIn).toHaveAttribute('data-app-entry')
    expect(
      screen.getByRole('combobox', {
        name: english.PublicSite.nav.language,
      }),
    ).toBeVisible()
  })

  it('adds the status link to the public footer', async () => {
    const layout = await PublicSiteLayout({ children: <p>Page content</p> })
    renderPage(layout)

    const statusLink = screen.getByRole('link', { name: 'Status' })
    expect(statusLink).toHaveAttribute(
      'href',
      'https://chequecheck.openstatus.dev/',
    )
  })
})
