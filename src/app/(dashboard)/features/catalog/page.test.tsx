import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Profile } from '@/types'
import type { Quota } from '@/features/monetization/repositories/monetization.repository'
import type { PhoneInputProps } from '@/components/ui/phone-input'
import { FEATURE_IDS, PRODUCT_IDS } from '@/features/monetization/constants'
import { queryKeys } from '@/lib/query-keys'
import { stubWindowReload } from '@/test/browser'
import messages from '../../../../../messages/en.json'
import hindi from '../../../../../messages/hi.json'
import hinglish from '../../../../../messages/hi-en.json'
import FeaturesPage from './page'
import type { PremiumState } from '@/features/monetization/lib/premium-access'
import { PremiumPromptProvider } from '@/features/monetization/components/premium-prompt'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  payment: vi.fn(),
  transactions: vi.fn(),
  toast: vi.fn(),
}))

let profile: Profile
let premium = false
let subscribed: string[] = []
let quotas: Quota[] = []
let entitlements: Array<{ feature_id: string; valid_until?: string }> = []
let accessError: Error | null = null
let loading = false
let processing = false
let premiumState: PremiumState | null = null
let finitePremium = false
let resolvedEntitlementState: string | null = null

type TestMessages = typeof messages | typeof hindi | typeof hinglish

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile,
    updateProfile: mocks.update,
    isLoading: false,
  }),
}))
vi.mock('@/features/monetization/hooks/use-monetization', () => ({
  useMonetization: () => ({
    isLifetimePremium: premium,
    checkEntitlement: (id: string) => subscribed.includes(id),
    getQuota: (id: string) => quotas.find((quota) => quota.feature_id === id),
    entitlements,
    isLoading: loading,
    error: accessError,
    getEntitlementState: (id: string) =>
      resolvedEntitlementState ?? (subscribed.includes(id) ? 'active' : 'free'),
  }),
}))
vi.mock('@/features/monetization/hooks/use-premium-access', () => ({
  usePremiumAccess: () => ({
    state: premiumState ?? (premium ? 'active' : 'free'),
    hasAccess: premium,
    hasLifetimePurchase:
      premium && premiumState !== 'trialing' && !finitePremium,
    canUse: () => premium,
    isLoading: loading,
    validUntil:
      premiumState === 'trialing' || finitePremium
        ? '2099-01-01T00:00:00Z'
        : null,
  }),
}))
vi.mock('@/features/monetization/hooks/use-razorpay', () => ({
  useRazorpay: () => ({
    processPayment: mocks.payment,
    isProcessing: processing,
  }),
}))
vi.mock('@/features/monetization/services/monetization.service', () => ({
  monetizationService: { getTransactions: mocks.transactions },
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({
    id,
    value,
    onChange,
    disabled,
    'aria-invalid': invalid,
  }: PhoneInputProps) => (
    <input
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={invalid}
    />
  ),
}))

function voiceCredits(used = 0) {
  quotas = [
    {
      id: 'quota',
      user_id: 'user',
      feature_id: FEATURE_IDS.VOICE_REMINDER,
      used,
      limit: 100,
      reset_at: null,
    },
  ]
}

function renderPage(locale = 'en', translations: TestMessages = messages) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(<FeaturesPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider
          locale={locale}
          messages={translations as unknown as AbstractIntlMessages}
          timeZone="UTC"
        >
          <PremiumPromptProvider>{children}</PremiumPromptProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>
    ),
  })
  return { ...view, client }
}

function voiceCard() {
  return screen.getByRole('article', { name: messages.Features.voiceReminder })
}

beforeEach(() => {
  vi.clearAllMocks()
  profile = {
    id: 'profile',
    user_id: 'user',
    name: 'Test',
    email: null,
    currency: 'INR',
    date_format: 'dd/MM/yyyy',
    time_format: '12h',
    time_zone: 'Asia/Kolkata',
    language: 'en',
    reminders_per_day: 1,
    default_reminder_days: 3,
    received_cheques_enabled: false,
    phone: '+919876543210',
    voice_call_enabled: false,
    sms_enabled: false,
    party_sms_enabled: false,
    push_enabled: false,
    whatsapp_enabled: false,
    reduce_motion: false,
    created_at: '',
    updated_at: '',
  }
  premium = false
  premiumState = null
  finitePremium = false
  resolvedEntitlementState = null
  subscribed = []
  quotas = []
  entitlements = []
  accessError = null
  loading = false
  processing = false
  mocks.transactions.mockResolvedValue([])
  mocks.update.mockImplementation(async (changes: Partial<Profile>) => {
    profile = { ...profile, ...changes }
  })
})

describe('Features page', () => {
  it('shows the loading state while access data is being fetched', () => {
    loading = true
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.Features.loading,
    )
  })

  it('does not offer a checkout that would be rejected for an existing finite active grant', async () => {
    premium = true
    finitePremium = true
    renderPage()
    expect(
      await screen.findByRole('link', {
        name: messages.Premium.contactSupport,
      }),
    ).toHaveAttribute('href', '/help')
    expect(
      screen.queryByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    ).toBeInTheDocument()
  })
  it('links to transactions without fetching payment activity on Features', () => {
    renderPage()
    expect(mocks.transactions).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: messages.Settings.transactions }),
    ).toHaveAttribute('href', '/settings/transactions')
    expect(
      screen.queryByText(messages.Features.activityTitle),
    ).not.toBeInTheDocument()
    expect(document.querySelector('#feature-activity')).toBeNull()
  })

  it('offers purchase during a granted trial without hiding trial access', async () => {
    premium = true
    premiumState = 'trialing'
    renderPage()
    expect(
      await screen.findByText(messages.Premium.labels.trialing),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).toBeEnabled()
    expect(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    ).toBeInTheDocument()
  })

  it.each(['paused', 'canceled', 'expired'] as const)(
    'explains %s access and preserves the Premium tool entry',
    async (state) => {
      premiumState = state
      renderPage()
      expect(
        await screen.findByText(messages.Premium.states[state]),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: messages.Premium.openTools }),
      ).toHaveAttribute('href', '/premium')
      expect(
        screen.queryByRole('switch', { name: messages.Features.receivingMode }),
      ).not.toBeInTheDocument()
    },
  )
  it('keeps locked purchase actions clear and sends the correct product', async () => {
    renderPage()
    expect(mocks.transactions).not.toHaveBeenCalled()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    )
    expect(mocks.payment).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_IDS.LIFETIME_PREMIUM }),
    )
    fireEvent.click(
      within(voiceCard()).getByRole('button', {
        name: messages.Features.enableAddon,
      }),
    )
    expect(mocks.payment).toHaveBeenLastCalledWith(
      expect.objectContaining({ productId: PRODUCT_IDS.VOICE_REMINDER_30D }),
    )
  })

  it('lets premium users toggle inward tracking without repurchasing', async () => {
    premium = true
    renderPage()
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        received_cheques_enabled: true,
      }),
    )
    expect(
      screen.queryByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: messages.Features.openReports }),
    ).toHaveAttribute('href', '/reports')
  })

  it('keeps phone setup visible while voice reminders are off', () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    voiceCredits()
    renderPage()
    const card = within(voiceCard())
    expect(card.getByText(messages.Features.paused)).toBeInTheDocument()
    expect(
      card.getByLabelText(messages.Features.yourPhoneNumber),
    ).toBeInTheDocument()
    expect(
      card.getByRole('button', { name: messages.Features.sendTestCall }),
    ).toBeDisabled()
    expect(
      card.getByText(messages.Features.voicePausedHelp),
    ).toBeInTheDocument()
  })

  it('shows phone setup rather than ready when reminders are on without a saved number', () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    voiceCredits()
    profile.voice_call_enabled = true
    profile.phone = null
    renderPage()
    expect(
      within(voiceCard()).getByText(messages.Features.setupRequired),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: messages.Features.sendTestCall }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: messages.Features.savePhone }),
    ).toBeInTheDocument()
  })

  it('requires an explicit valid phone save before testing the persisted number', async () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    voiceCredits()
    profile.voice_call_enabled = true
    const view = renderPage()
    const phone = screen.getByLabelText(messages.Features.yourPhoneNumber)
    fireEvent.change(phone, { target: { value: '123' } })
    fireEvent.click(
      screen.getByRole('button', { name: messages.Features.savePhone }),
    )
    expect(screen.getByText(messages.Common.invalidPhone)).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.change(phone, { target: { value: '+919876543211' } })
    expect(
      screen.getByRole('button', { name: messages.Features.sendTestCall }),
    ).toBeDisabled()
    expect(
      screen.getByText(messages.Features.saveBeforeTest),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Features.savePhone }),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ phone: '+919876543211' }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      ),
    )
    view.rerender(<FeaturesPage />)
    expect(
      screen.getByRole('button', { name: messages.Features.sendTestCall }),
    ).toBeEnabled()
  })

  it('supports service controls for trial credits but not paid top-ups', async () => {
    voiceCredits()
    renderPage()
    expect(
      within(voiceCard()).getByText(messages.Features.trialAccess),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Features.enableService }),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ voice_call_enabled: true }),
    )
    expect(
      within(voiceCard()).getByRole('button', {
        name: messages.Features.upgradeSubscription,
      }),
    ).toBeInTheDocument()
    expect(
      within(voiceCard()).queryByRole('button', { name: /Top up/ }),
    ).not.toBeInTheDocument()
  })

  it('shows the scan shortcut for an accessible scanner with remaining credits', () => {
    premium = true
    subscribed = [FEATURE_IDS.AI_SCANNER_SUB]
    quotas = [
      {
        id: 'scan-quota',
        user_id: 'user',
        feature_id: FEATURE_IDS.AI_SCAN,
        used: 1,
        limit: 250,
        reset_at: null,
      },
    ]
    renderPage()
    expect(
      screen.getByRole('link', { name: messages.Features.scanCheque }),
    ).toHaveAttribute('href', '/cheques/create')
  })

  it('recommends an add-on subscription for premium users with depleted trial quota', () => {
    premium = true
    voiceCredits(100)
    renderPage()
    expect(
      within(voiceCard()).getByText(messages.Features.subscribeToContinue),
    ).toBeVisible()
  })

  it('shows an expired add-on entitlement state', () => {
    subscribed = [FEATURE_IDS.AI_SCANNER_SUB]
    resolvedEntitlementState = 'expired'
    renderPage()
    expect(
      within(
        screen.getByRole('article', { name: messages.Features.aiScanner }),
      ).getByText(messages.Premium.labels.expired),
    ).toBeVisible()
  })

  it('uses a safe progress maximum and displays a quota reset independently of entitlement expiry', () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    quotas = [
      {
        id: 'voice-quota',
        user_id: 'user',
        feature_id: FEATURE_IDS.VOICE_REMINDER,
        used: 0,
        limit: 0,
        reset_at: '2099-02-01T00:00:00.000Z',
      },
    ]
    entitlements = [
      {
        feature_id: FEATURE_IDS.VOICE_REMINDER_SUB,
        valid_until: '2099-01-01T00:00:00.000Z',
      },
    ]
    renderPage()
    expect(within(voiceCard()).getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '1',
    )
    expect(within(voiceCard()).getAllByText(/2099/)).toHaveLength(2)
  })

  it('displays the expiration date for a matching subscription entitlement', () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    profile.voice_call_enabled = true
    voiceCredits()
    entitlements = [
      {
        feature_id: FEATURE_IDS.VOICE_REMINDER_SUB,
        valid_until: '2099-01-01T00:00:00.000Z',
      },
    ]
    renderPage()
    expect(within(voiceCard()).getByText(/2099/)).toBeInTheDocument()
  })

  it('shows exhausted credits and offers the correct top-up without hiding setup', () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    profile.voice_call_enabled = true
    voiceCredits(100)
    renderPage()
    const card = within(voiceCard())
    expect(card.getByText(messages.Features.outOfCredits)).toBeInTheDocument()
    expect(
      card.getByRole('button', { name: messages.Features.sendTestCall }),
    ).toBeDisabled()
    fireEvent.click(
      card.getByRole('button', {
        name: `${messages.ProductNames.voice_reminder_100} · ₹50`,
      }),
    )
    expect(mocks.payment).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_IDS.VOICE_REMINDER_100 }),
    )
    expect(
      card.getByLabelText(messages.Features.yourPhoneNumber),
    ).toBeInTheDocument()
  })

  it('does not suggest scanning when no scan credits remain', () => {
    subscribed = [FEATURE_IDS.AI_SCANNER_SUB]
    quotas = [
      {
        id: 'quota',
        user_id: 'user',
        feature_id: FEATURE_IDS.AI_SCAN,
        used: 250,
        limit: 250,
        reset_at: null,
      },
    ]
    renderPage()
    const scanner = within(
      screen.getByRole('article', { name: messages.Features.aiScanner }),
    )
    expect(
      scanner.getByText(messages.Features.outOfCredits),
    ).toBeInTheDocument()
    expect(
      scanner.queryByRole('link', { name: messages.Features.scanCheque }),
    ).not.toBeInTheDocument()
    expect(
      scanner.getByRole('button', {
        name: `${messages.ProductNames.ai_scan_250} · ₹50`,
      }),
    ).toBeEnabled()
  })

  it('refreshes quota after a queued test call without claiming the call was delivered', async () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    profile.voice_call_enabled = true
    voiceCredits()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ queued: true }), { status: 200 }),
      )
    const { client } = renderPage()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Features.sendTestCall }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: messages.Features.testCallQueued,
        }),
      ),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/test-voice', {
      method: 'POST',
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.monetization.quotas(),
    })
    fetchMock.mockRestore()
  })

  it('surfaces failed profile saves without a success notification', async () => {
    premium = true
    mocks.update.mockRejectedValue(new Error('Save unavailable'))
    renderPage()
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Save unavailable',
          type: 'error',
        }),
      ),
    )
    expect(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    ).not.toBeChecked()
  })

  it('uses the generic save error when a profile update rejects with a non-Error value', async () => {
    premium = true
    mocks.update.mockRejectedValue('network unavailable')
    renderPage()
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Features.receivingMode }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: messages.Features.updateFailed,
          type: 'error',
        }),
      ),
    )
  })

  it('reports an error premium state without removing feature controls', () => {
    premiumState = 'error'
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.Premium.states.error,
    )
  })

  it('distinguishes a sent test call from a server-side test-call failure', async () => {
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    profile.voice_call_enabled = true
    voiceCredits()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ queued: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }))
    renderPage()
    const sendButton = screen.getByRole('button', {
      name: messages.Features.sendTestCall,
    })
    fireEvent.click(sendButton)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: messages.Features.testCallSent,
        }),
      ),
    )
    mocks.toast.mockClear()
    fireEvent.click(sendButton)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: messages.Features.testCallFailed,
          type: 'error',
        }),
      ),
    )
    fetchMock.mockRestore()
  })

  it('refreshes entitlements and quotas without fetching payment history', async () => {
    const { client } = renderPage()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Features.refreshStatus }),
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2))
    for (const key of ['entitlements', 'quotas']) {
      expect(invalidate).toHaveBeenCalledWith(
        { queryKey: [key] },
        { throwOnError: true },
      )
    }
    expect(mocks.transactions).not.toHaveBeenCalled()
  })

  it('does not offer purchases when access failed to load', async () => {
    accessError = new Error('Unavailable')
    const reload = stubWindowReload()
    renderPage()
    expect(
      await screen.findByText(messages.Features.loadFailed),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Features.tryAgain }),
    )
    expect(reload).toHaveBeenCalledOnce()
  })

  it('resumes a validated checkout intent after the login redirect', async () => {
    window.history.replaceState(
      {},
      '',
      '/features/catalog?purchase=ai_scanner_30d',
    )
    expect(window.location.search).toBe('?purchase=ai_scanner_30d')
    const { rerender } = renderPage()

    await waitFor(() =>
      expect(mocks.payment).toHaveBeenCalledWith(
        expect.objectContaining({ productId: PRODUCT_IDS.AI_SCANNER_30D }),
      ),
    )
    rerender(<FeaturesPage />)
    expect(mocks.payment).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('')
  })

  it('keeps purchase controls independent of unavailable payment history', () => {
    mocks.transactions.mockRejectedValue(new Error('Unavailable'))
    renderPage()
    expect(
      screen.getByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).toBeEnabled()
    expect(mocks.transactions).not.toHaveBeenCalled()
  })

  it('disables all purchase actions while checkout is open', () => {
    processing = true
    subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
    voiceCredits()
    renderPage()
    expect(
      screen.getByRole('button', {
        name: messages.Features.getLifetimePremium,
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: messages.Features.enableAddon }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: `${messages.ProductNames.voice_reminder_100} · ₹50`,
      }),
    ).toBeDisabled()
  })

  it.each([
    ['hi', { ...messages, ...hindi }],
    ['hi-en', hinglish],
  ])(
    'renders localized management without activity in %s',
    async (locale, translations) => {
      subscribed = [FEATURE_IDS.VOICE_REMINDER_SUB]
      voiceCredits()
      renderPage(locale, translations)
      expect(mocks.transactions).not.toHaveBeenCalled()
      expect(
        screen.getByRole('heading', { name: translations.Features.pageTitle }),
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText(translations.Features.yourPhoneNumber),
      ).toBeInTheDocument()
    },
  )
})
