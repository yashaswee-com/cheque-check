import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import hindiMessages from '../../messages/hi.json'
import hinglishMessages from '../../messages/hi-en.json'
import { version } from '../../package.json'
import DraftsPage from './(dashboard)/drafts/page'
import LegacyTagsPage from './(dashboard)/settings/tags/page'
import AboutPage from './(dashboard)/settings/about/page'
import HelpPage from './(dashboard)/help/page'
import LegacyHelpPage from './(dashboard)/settings/help-and-support/page'
import PrivacyPolicyPage from './(dashboard)/settings/privacy-policy/page'
import RefundPolicyPage from './(dashboard)/settings/refund-policy/page'
import TermsPage from './(dashboard)/settings/terms-and-conditions/page'
import WhatsNewPage from './(dashboard)/settings/whats-new/page'

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    mocks.redirect(href)
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
}))
vi.mock('@/features/drafts', () => ({
  DraftsBrowser: () => <p>All drafts</p>,
}))
vi.mock('@/features/announcements/components/developer-message', () => ({
  DeveloperMessage: () => null,
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
  it('opens the unified drafts browser', () => {
    renderPage(<DraftsPage />)
    expect(screen.getByText('All drafts')).toBeVisible()
  })

  it('redirects the legacy settings tags URL to the current list', () => {
    expect(() => LegacyTagsPage()).toThrow('NEXT_REDIRECT:/tags')
    expect(mocks.redirect).toHaveBeenCalledWith('/tags')
  })
  it('redirects the legacy help URL to the dedicated page', () => {
    expect(() => LegacyHelpPage()).toThrow('NEXT_REDIRECT:/help')
    expect(mocks.redirect).toHaveBeenCalledWith('/help')
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

  it('provides searchable categorized FAQ branches, issue reporting, and support actions', () => {
    renderPage(<HelpPage />)
    expect(screen.getByRole('link', { name: /email us/i })).toHaveAttribute(
      'href',
      'mailto:support@chequecheck.com',
    )
    expect(
      screen.getByRole('link', { name: /chat on whatsapp/i }),
    ).toHaveAttribute('target', '_blank')
    expect(
      screen.getByRole('heading', { name: messages.FAQ.title }),
    ).toBeVisible()
    const categories = screen.getByRole('group', {
      name: messages.FAQ.categoriesLabel,
    })
    for (const category of Object.values(messages.FAQ.categories)) {
      expect(
        within(categories).getByRole('button', { name: category }),
      ).toBeVisible()
    }
    expect(
      screen.getByRole('link', { name: messages.Feedback.submitTitle }),
    ).toHaveAttribute('href', '/feedback/create')
    expect(
      screen.getByRole('link', { name: messages.Feedback.roadmapTitle }),
    ).toHaveAttribute('href', '/roadmap')
    expect(
      screen.getByRole('link', { name: messages.Settings.contactSupport }),
    ).toHaveAttribute('target', '_blank')

    const search = screen.getByRole('searchbox', {
      name: messages.FAQ.searchLabel,
    })
    fireEvent.change(search, { target: { value: 'camera' } })
    expect(
      screen.getByRole('button', {
        name: messages.FAQ.questions.scan_cheque.question,
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', {
        name: messages.FAQ.questions.add_cheque.question,
      }),
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(
      within(categories).getByRole('button', {
        name: messages.FAQ.categories.chequesScanning,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.FAQ.questions.add_cheque.question,
      }),
    )
    expect(
      screen.getByText(messages.FAQ.questions.add_cheque.answer),
    ).toBeVisible()
    const relatedQuestions = screen.getByText(
      messages.FAQ.relatedQuestions,
    ).parentElement!
    fireEvent.click(
      within(relatedQuestions).getByRole('button', {
        name: messages.FAQ.questions.free_plan.question,
      }),
    )
    expect(
      within(categories).getByRole('button', {
        name: messages.FAQ.categories.plansPayments,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByText(messages.FAQ.questions.free_plan.answer),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: messages.FAQ.reportIssue }),
    ).toHaveAttribute('href', '/feedback/create?category=bug')
  })

  it.each(locales)(
    'clears search for related answers and puts FAQ cards before support in $locale',
    ({ locale, translations }) => {
      renderPage(<HelpPage />, locale, translations)
      const search = screen.getByRole('searchbox', {
        name: translations.FAQ.searchLabel,
      })
      fireEvent.change(search, {
        target: { value: translations.FAQ.questions.scan_cheque.question },
      })
      const question = screen.getByRole('button', {
        name: translations.FAQ.questions.scan_cheque.question,
      })
      expect(question.closest('article')).toHaveClass(
        'rounded-xl',
        'border',
        'bg-card',
      )
      fireEvent.click(question)
      expect(
        document.getElementById(question.getAttribute('aria-controls')!),
      ).toHaveTextContent(translations.FAQ.questions.scan_cheque.answer)
      fireEvent.click(
        screen.getByRole('button', {
          name: translations.FAQ.questions.add_cheque.question,
        }),
      )
      expect(search).toHaveValue('')
      expect(
        screen.getByText(translations.FAQ.questions.add_cheque.answer),
      ).toBeVisible()
      const section = search.closest('section')!
      const support = screen.getByRole('link', {
        name: new RegExp(translations.Settings.emailUs, 'i'),
      })
      expect(
        section.compareDocumentPosition(support) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    },
  )

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
