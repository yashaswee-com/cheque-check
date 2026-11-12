import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  usePathname: () => '/',
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
          name: catalog.PublicSite.landing.videoLabel,
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

  it('keeps navigation and language selection in the three-dot menu', async () => {
    const user = userEvent.setup()
    const layout = await PublicSiteLayout({ children: <p>Page content</p> })
    renderPage(layout)
    expect(screen.getByRole('banner')).toHaveClass('sticky', 'top-0', 'z-40')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', {
      name: english.PublicSite.nav.navigation,
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    const nav = screen.getByRole('navigation', {
      name: english.PublicSite.nav.navigation,
    })
    expect(
      within(nav).getByRole('link', {
        name: english.PublicSite.nav.features,
      }),
    ).toHaveAttribute('href', '/features')
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.querySelectorAll('svg')).toHaveLength(2)
    }
    expect(
      within(nav).getByRole('link', {
        name: /Cheque bounce calculator/,
      }),
    ).toHaveAttribute('href', '/cheque-bounce')
    expect(
      document.querySelector('header a[href="/login"]'),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('[role="dialog"] a[href="/signup"]'),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Cheque Check')).toHaveLength(3)
    expect(
      within(screen.getByRole('banner'))
        .getByRole('link', { name: 'Cheque Check' })
        .querySelector('img'),
    ).toHaveAttribute(
      'src',
      expect.stringContaining('android-chrome-192x192.png'),
    )
    expect(
      screen.getByRole('combobox', {
        name: english.PublicSite.nav.language,
      }),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('pauses and resumes the industry marquee without repeating accessible content', async () => {
    renderPage(await LandingPage())
    const pause = screen.getByRole('button', {
      name: english.PublicSite.landing.marqueePause,
    })
    expect(
      screen.getAllByText(english.PublicSite.landing.audience.textiles),
    ).toHaveLength(2)
    const track = screen.getByTestId('industry-marquee')
    expect(track.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(1)
    await userEvent.click(pause)
    expect(
      screen.getByRole('button', {
        name: english.PublicSite.landing.marqueeResume,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      screen.getByRole('button', {
        name: english.PublicSite.landing.marqueeResume,
      }),
    )
    expect(pause).toHaveAttribute('aria-pressed', 'false')
  })

  it('highlights AI scanning, phone calls and Premium report downloads with safe example visuals', async () => {
    renderPage(await LandingPage())
    const copy = english.PublicSite.landing
    const features = within(
      screen.getByRole('region', { name: copy.sectionTitle }),
    )
    for (const key of ['cheques', 'reminders', 'reports'] as const) {
      expect(features.getByRole('heading', { name: copy[key] })).toBeVisible()
      expect(features.getByText(copy[`${key}Description`])).toBeVisible()
    }
    expect(screen.getByText(copy.callExampleNote)).toBeVisible()
    expect(screen.getByText(copy.scanExampleNote)).toBeVisible()
    expect(screen.getByText(copy.reportExampleNote)).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: copy.howTitle })).getByRole(
        'heading',
        { name: copy.stepTrackTitle },
      ),
    ).toBeVisible()
    expect(screen.getByText(copy.stepTrackDescription)).toBeVisible()
    expect(screen.getByText(copy.eyebrow)).toBeVisible()
    expect(screen.queryByText(/first 100 users/i)).not.toBeInTheDocument()
  })

  it('groups the footer links underneath icon-labeled section headings', async () => {
    renderPage(await PublicSiteLayout({ children: <p>Page content</p> }))
    const footer = screen.getByRole('contentinfo')
    for (const group of ['product', 'resources', 'support'] as const) {
      const section = within(footer).getByRole('region', {
        name: english.PublicSite.footer[group],
      })
      expect(within(section).getByRole('heading')).toBeVisible()
      for (const link of within(section).getAllByRole('link')) {
        expect(link.querySelector('svg')).toBeInTheDocument()
      }
    }
  })

  it('presents the landing flow with honest sample content and existing pricing', async () => {
    mocks.locale = 'hi-en'
    renderPage(await LandingPage())
    const copy = hinglish.PublicSite.landing
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      copy.problemTitle,
      copy.howTitle,
      copy.sectionTitle,
      copy.pricingTitle,
      copy.faqTitle,
      copy.scenarioTitle,
      copy.ctaTitle,
    ])
    expect(screen.getByRole('button', { name: copy.videoPlay })).toBeVisible()
    expect(screen.queryByText(copy.sampleData)).not.toBeInTheDocument()
    expect(screen.getByText(copy.scenarioDisclosure)).toBeVisible()
    expect(screen.getAllByText(copy.scenarioLabel)).toHaveLength(3)
    expect(screen.getByRole('link', { name: copy.pricingCta })).toHaveAttribute(
      'href',
      '/pricing',
    )
    expect(document.querySelector('#product-demo')).toBeInTheDocument()
    const video = document.querySelector('video')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).not.toHaveAttribute('src')
    expect(video).toHaveAttribute('poster', '/assets/demo-poster.jpg')
    expect(video).not.toHaveAttribute('autoplay')
    expect(screen.getByRole('img', { name: copy.scanGifPending })).toBeVisible()
    expect(screen.getByText(copy.reportSamplePending)).toBeVisible()
    const trust = screen
      .getByRole('region', { name: copy.title })
      .querySelector('ul')!
    expect(within(trust).getAllByRole('listitem')).toHaveLength(3)
    expect(trust.querySelectorAll('svg')).toHaveLength(3)
    expect(within(trust).getByText(copy.trustAi)).toBeVisible()
    expect(document.querySelectorAll('details')).toHaveLength(6)
    const question = screen.getByText(copy.faq.bounceQuestion)
    await userEvent.click(question)
    expect(question.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(copy.faq.bounceAnswer)).toBeVisible()
  })

  it('only loads audio on play and surfaces playback failures with a retry', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('Playback unavailable'))
      .mockResolvedValue(undefined)
    renderPage(await LandingPage())
    const audio = document.querySelector('audio')!
    expect(audio).not.toHaveAttribute('src')
    expect(audio).toHaveAttribute('preload', 'none')
    await userEvent.click(
      screen.getByRole('button', {
        name: english.PublicSite.landing.audioPlay,
      }),
    )
    expect(audio).toHaveAttribute('src', '/assets/voice-reminder.mp3')
    expect(screen.getByRole('alert')).toHaveTextContent(
      english.PublicSite.landing.mediaError,
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: english.PublicSite.landing.audioPlay,
      }),
    )
    expect(play).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    play.mockRestore()
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
