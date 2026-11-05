import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import SettingsPage from './page'
import { PremiumPromptProvider } from '@/features/monetization/components/premium-prompt'

const mocks = vi.hoisted(() => ({ logout: vi.fn() }))
let profileLoading = false
let monetizationLoading = false
let hasPremium = false
let profile: {
  name: string | null
  email: string | null
  avatar_url: string | null
  created_at?: string
} | null = null

vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile, isLoading: profileLoading }),
}))
vi.mock('@/features/settings/hooks/use-settings', () => ({
  useSettings: () => ({ handleLogout: mocks.logout }),
}))
vi.mock('@/features/monetization/hooks/use-monetization', () => ({
  useMonetization: () => ({ isLoading: monetizationLoading }),
}))
vi.mock('@/features/monetization/hooks/use-premium-access', () => ({
  usePremiumAccess: () => ({
    state: 'free',
    hasAccess: hasPremium,
    canUse: () => false,
    isLoading: false,
  }),
}))
vi.mock('@/features/monetization/components/free-usage-banner', () => ({
  UsageCard: ({ alwaysShow }: { alwaysShow?: boolean }) => (
    <section data-testid="usage-card" data-always-show={String(!!alwaysShow)} />
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/monitoring-preferences', () => ({
  MonitoringPreferences: () => <div>Monitoring preferences</div>,
}))

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PremiumPromptProvider>
        <SettingsPage />
      </PremiumPromptProvider>
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  profileLoading = false
  monetizationLoading = false
  hasPremium = false
  profile = {
    name: 'Riya Sharma',
    email: 'riya@example.test',
    avatar_url: null,
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('settings page', () => {
  it('places the always-visible usage card directly under the profile card', () => {
    renderPage()
    const profileLink = document.querySelector('a[href="/profile"]')!
    const usage = screen.getByTestId('usage-card')
    expect(usage).toHaveAttribute('data-always-show', 'true')
    expect(profileLink.nextElementSibling).toBe(usage)
  })

  it('renders every settings section, its links, and the logout action', () => {
    renderPage()
    expect(screen.getByText('Riya Sharma')).toBeVisible()
    expect(screen.getByText('riya@example.test')).toBeVisible()
    for (const section of [
      messages.Settings.general,
      messages.Settings.management,
      messages.Settings.support,
      messages.Settings.legal,
    ]) {
      expect(screen.getByRole('heading', { name: section })).toBeVisible()
    }
    for (const href of [
      '/settings/preferences',
      '/settings/notifications',
      '/settings/transactions',
      '/features/catalog',
      '/businesses',
      '/reports',
      '/tags',
      '/settings/whats-new',
      '/announcements',
      '/feedback',
      '/help',
      '/settings/about',
      '/settings/privacy-policy',
      '/settings/terms-and-conditions',
      '/settings/refund-policy',
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeInTheDocument()
    }
    expect(screen.queryByText('Monitoring preferences')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-logout-button'))
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('shows loading placeholders while either required source is pending', () => {
    profileLoading = true
    const view = renderPage()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    cleanup()
    profileLoading = false
    monetizationLoading = true
    view.unmount()
    renderPage()
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7)
  })

  it('uses the fallback user label and hides a missing email', () => {
    profile = null
    renderPage()
    expect(screen.getAllByText(messages.Settings.user)).not.toHaveLength(0)
    expect(screen.getByText(messages.PhoneAuth.noEmail)).toBeVisible()
  })

  it('shows elapsed membership duration instead of the join date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'))
    profile = {
      name: 'Riya Sharma',
      email: 'riya@example.test',
      avatar_url: null,
      created_at: '2025-08-06T12:00:00.000Z',
    }

    renderPage()

    expect(
      screen.getByText(
        messages.Settings.memberFor.replace('{duration}', '1y 3m'),
      ),
    ).toBeVisible()
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument()
  })

  it('rings the profile photo in gold only while premium is active', () => {
    renderPage()
    expect(document.querySelector('[class*="ring-[#D4AF37]"]')).toBeNull()
    cleanup()
    hasPremium = true
    renderPage()
    expect(
      document.querySelector('[class*="ring-[#D4AF37]"]'),
    ).toBeInTheDocument()
  })
})
