import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import NotificationsPage from './page'

const pushMock = vi.hoisted(() => ({ state: vi.fn() }))
const profileMock = vi.hoisted(() => ({
  profile: {
    push_enabled: true,
    voice_call_enabled: false,
    sms_enabled: false,
    whatsapp_enabled: false,
  },
  isLoading: false,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: null,
    businesses: [],
    setActiveBusiness: vi.fn(),
  }),
}))
vi.mock('@/features/notifications/hooks/use-inbox', () => ({
  useInbox: () => ({
    data: { items: [], snapshot: 'snapshot' },
    isLoading: false,
    error: null,
    isFetching: false,
    totalPages: 1,
    refetch: vi.fn(),
    markAll: vi.fn(),
    markRead: vi.fn(),
  }),
}))
vi.mock('@/features/notifications/services/push.service', () => ({
  pushService: pushMock,
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => profileMock,
}))
vi.mock('@/features/profile/hooks/use-display-format', () => ({
  useDisplayFormat: () => ({ date: (value: string) => value }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  profileMock.profile = {
    push_enabled: true,
    voice_call_enabled: false,
    sms_enabled: false,
    whatsapp_enabled: false,
  }
  profileMock.isLoading = false
})

describe('notifications inbox push settings', () => {
  it('links to notification settings when this device is not registered', async () => {
    pushMock.state.mockResolvedValue('available')
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotificationsPage />
      </NextIntlClientProvider>,
    )

    expect(
      await screen.findByRole('link', { name: messages.Push.settingsLink }),
    ).toHaveAttribute('href', '/settings/notifications')
    expect(screen.queryByText(messages.Push.enable)).not.toBeInTheDocument()
    expect(screen.queryByText(messages.Push.disable)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: messages.Inbox.title }),
    ).not.toBeInTheDocument()
  })

  it('shows the settings redirect when every notification channel is off', async () => {
    profileMock.profile = {
      push_enabled: false,
      voice_call_enabled: false,
      sms_enabled: false,
      whatsapp_enabled: false,
    }
    pushMock.state.mockResolvedValue('enabled')
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotificationsPage />
      </NextIntlClientProvider>,
    )

    expect(
      await screen.findByRole('link', { name: messages.Push.settingsLink }),
    ).toHaveAttribute('href', '/settings/notifications')
  })

  it('requires a phone number before treating phone-based channels as configured', async () => {
    profileMock.profile = {
      push_enabled: false,
      voice_call_enabled: false,
      sms_enabled: true,
      whatsapp_enabled: false,
    }
    pushMock.state.mockResolvedValue('available')
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotificationsPage />
      </NextIntlClientProvider>,
    )

    expect(
      await screen.findByRole('link', { name: messages.Push.settingsLink }),
    ).toHaveAttribute('href', '/settings/notifications')
  })

  it('does not show the settings redirect when this device is registered', async () => {
    pushMock.state.mockResolvedValue('enabled')
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotificationsPage />
      </NextIntlClientProvider>,
    )

    await waitFor(() => expect(pushMock.state).toHaveBeenCalledOnce())
    expect(
      screen.queryByRole('link', { name: messages.Push.settingsLink }),
    ).not.toBeInTheDocument()
  })
})
