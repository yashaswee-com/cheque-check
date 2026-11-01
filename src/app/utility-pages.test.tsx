import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import hindiMessages from '../../messages/hi.json'
import hinglishMessages from '../../messages/hi-en.json'
import { version } from '../../package.json'
import AccountsDraftsPage from './(dashboard)/accounts/drafts/page'
import ChequeDraftsPage from './(dashboard)/cheques/drafts/page'
import PartiesDraftsPage from './(dashboard)/parties/drafts/page'
import LegacyTagsPage from './(dashboard)/settings/tags/page'
import AboutPage from './(dashboard)/settings/about/page'
import HelpPage from './(dashboard)/settings/help-and-support/page'
import PrivacyPolicyPage from './(dashboard)/settings/privacy-policy/page'
import RefundPolicyPage from './(dashboard)/settings/refund-policy/page'
import TermsPage from './(dashboard)/settings/terms-and-conditions/page'
import WhatsNewPage from './(dashboard)/settings/whats-new/page'

const mocks = vi.hoisted(() => ({ redirect: vi.fn(), draftList: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    mocks.redirect(href)
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
}))
vi.mock('@/features/drafts', () => ({
  DraftList: ({ entity }: { entity: string }) => {
    mocks.draftList(entity)
    return <p>{entity} drafts</p>
  },
}))

const locales = [
  { locale: 'en', translations: messages },
  { locale: 'hi', translations: hindiMessages },
  { locale: 'hi-en', translations: hinglishMessages },
] as const

function renderPage(
  page: React.ReactNode,
  locale = 'en',
  translations: (typeof locales)[number]['translations'] = messages,
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={translations}
      timeZone="UTC"
    >
      {page}
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('settings and draft routes', () => {
  it.each([
    ['account', AccountsDraftsPage],
    ['cheque', ChequeDraftsPage],
    ['party', PartiesDraftsPage],
  ])('opens the %s draft list', (entity, Page) => {
    renderPage(<Page />)
    expect(screen.getByText(`${entity} drafts`)).toBeVisible()
    expect(mocks.draftList).toHaveBeenCalledWith(entity)
  })

  it('redirects the legacy settings tags URL to the current list', () => {
    expect(() => LegacyTagsPage()).toThrow('NEXT_REDIRECT:/tags')
    expect(mocks.redirect).toHaveBeenCalledWith('/tags')
  })

  it.each(locales)(
    'shows product identity and the package version without support in $locale',
    ({ locale, translations }) => {
      renderPage(<AboutPage />, locale, translations)
      expect(screen.getByRole('heading', { name: 'ChequeCheck' })).toBeVisible()
      expect(screen.getByText(translations.Settings.appTagline)).toBeVisible()
      expect(screen.getByText(translations.Settings.teamName)).toBeVisible()
      expect(screen.getByText(`v${version}`)).toBeVisible()
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(
        screen.queryByRole('link', { name: 'support@chequecheck.com' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(translations.Settings.support),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/Build 2026/)).not.toBeInTheDocument()
    },
  )

  it('provides email, WhatsApp, FAQ answers, and a support action', () => {
    renderPage(<HelpPage />)
    expect(screen.getByRole('link', { name: /email us/i })).toHaveAttribute(
      'href',
      'mailto:support@chequecheck.com',
    )
    expect(
      screen.getByRole('link', { name: /chat on whatsapp/i }),
    ).toHaveAttribute('target', '_blank')
    expect(
      screen.getByRole('heading', { name: messages.Settings.faqsTitle }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: messages.Settings.contactSupport }),
    ).toHaveAttribute('target', '_blank')
    expect(screen.getByText(messages.Settings.faq1A)).toBeVisible()
    expect(screen.getByText(messages.Settings.faq2A)).toBeVisible()
    expect(screen.getByText(messages.Settings.faq3A)).toBeVisible()
  })

  it('renders the complete privacy, refund, and terms disclosures', () => {
    const { rerender } = renderPage(<PrivacyPolicyPage />)
    expect(
      screen.getByText(messages.Settings.privacyIntroContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Monitoring.privacyDisclosure),
    ).toBeVisible()

    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <RefundPolicyPage />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByText(messages.Settings.refundSubRefundsContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.refundHowRequestContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.refundExceptionsContent),
    ).toBeVisible()

    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <TermsPage />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByText(messages.Settings.termsAcceptanceContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.termsUseLicenseContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.termsAccountRespContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.termsLiabilityContent),
    ).toBeVisible()
    expect(
      screen.getByText(messages.Settings.termsChangesToTermsContent),
    ).toBeVisible()
  })

  it.each(locales)(
    'lists current release highlights and the package version in $locale',
    ({ locale, translations }) => {
      renderPage(<WhatsNewPage />, locale, translations)
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: `${translations.Settings.releaseTitle} - v${version}`,
        }),
      ).toBeVisible()
      const date = '31/10/2026'
      expect(
        screen.getByText(
          translations.Settings.lastUpdated.replace('{date}', date),
        ),
      ).toBeVisible()
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8)
      for (const key of [
        'releasePhone',
        'releaseBanks',
        'releaseTags',
        'releaseDrafts',
        'releaseReports',
        'releasePremium',
        'releaseReminders',
        'releaseReliability',
      ] as const) {
        expect(
          screen.getByText(translations.Settings[`${key}Title`]),
        ).toBeVisible()
        expect(
          screen.getByText(translations.Settings[`${key}Desc`]),
        ).toBeVisible()
      }
      expect(screen.queryByText('v1.0.0')).not.toBeInTheDocument()
    },
  )
})
