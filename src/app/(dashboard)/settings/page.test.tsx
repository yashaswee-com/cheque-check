import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import SettingsPage from './page'
import { PremiumPromptProvider } from '@/features/monetization/components/premium-prompt'
import { clearInstallPrompt } from '@/lib/pwa-install'

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
vi.mock('@/features/monetization/hooks/use-free-usage', () => ({
  useFreeUsage: () => ({
    data: {
      unlimited: false,
      cheques_used: 3,
      cheques_limit: 50,
      ai_scans_used: 2,
      ai_scans_limit: 10,
      voice_used: 1,
      voice_limit: 5,
    },
    error: null,
    refetch: vi.fn(),
  }),
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
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  sessionStorage.clear()
  clearInstallPrompt()
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
  vi.unstubAllGlobals()
})

describe('settings page', () => {
  it('places the inline install card immediately below the profile summary', () => {
    renderPage()
    const profileLink = document.querySelector('a[href="/profile"]')!
    expect(profileLink.nextElementSibling).toBe(
      screen.getByRole('region', { name: messages.PWA.title }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the always-visible usage card close to the profile card', () => {
    renderPage()
    const profileLink = document.querySelector('a[href="/profile"]')!
    const usage = screen.getByTestId('usage-card')
    expect(usage).toHaveAttribute('data-always-show', 'true')
    expect(usage.querySelectorAll('[data-testid="usage-meter"]')).toHaveLength(
      3,
    )
    expect(usage.querySelectorAll('[role="progressbar"]')).toHaveLength(3)
    expect(profileLink.parentElement).toBe(usage.parentElement)
    expect(profileLink.parentElement).toHaveClass('space-y-4')
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
      expect(document.querySelector(`a[href="${href}"]`)).toHaveClass('block')
    }
    expect(
      screen.queryByText(messages.Premium.openTools),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Monitoring preferences')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('settings-logout-button'),
    ).not.toBeInTheDocument()
  })

  it('uses a distinct icon for each Settings line item', () => {
    renderPage()
    const icons = Array.from(
      document.querySelectorAll<SVGElement>('[data-settings-item-icon]'),
      (icon) => icon.innerHTML,
    )
    expect(icons.length).toBeGreaterThan(0)
    expect(new Set(icons).size).toBe(icons.length)
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
