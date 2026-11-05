import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import NotificationsPage from './page'

const pushMock = vi.hoisted(() => ({ state: vi.fn() }))

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
vi.mock('@/features/profile/hooks/use-display-format', () => ({
  useDisplayFormat: () => ({ date: (value: string) => value }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
