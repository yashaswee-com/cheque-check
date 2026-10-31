import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import SettingsPage from './page'

const mocks = vi.hoisted(() => ({ logout: vi.fn() }))
let profileLoading = false
let monetizationLoading = false
let profile: {
  name: string | null
  email: string | null
  avatar_url: string | null
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
vi.mock('@/components/monitoring-preferences', () => ({
  MonitoringPreferences: () => <div>Monitoring preferences</div>,
}))

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <SettingsPage />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  profileLoading = false
  monetizationLoading = false
  profile = {
    name: 'Riya Sharma',
    email: 'riya@example.test',
    avatar_url: null,
  }
})

afterEach(cleanup)

describe('settings page', () => {
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
      '/features',
      '/businesses',
      '/reports',
      '/tags',
      '/settings/whats-new',
      '/settings/help-and-support',
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
})
