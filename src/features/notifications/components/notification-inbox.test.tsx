import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { NotificationBell } from './notification-bell'
import NotificationsPage from '@/app/(dashboard)/notifications/page'

const mocks = vi.hoisted(() => ({
  count: { data: 120, error: null as Error | null },
  markRead: vi.fn(),
  markAll: vi.fn(),
  push: vi.fn(),
  switch: vi.fn(),
  refetch: vi.fn(),
  items: [] as {
    id: string
    business_id: string
    kind: 'cheque_reminder'
    read_at: null
    created_at: string
  }[],
}))
vi.mock('../hooks/use-inbox', () => ({
  useUnreadCount: () => mocks.count,
  useInbox: () => ({
    data: { items: mocks.items, snapshot: '120', next_cursor: null },
    isFetching: false,
    isLoading: false,
    error: null,
    markRead: mocks.markRead,
    markAll: mocks.markAll,
    refetch: mocks.refetch,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: { id: 'b', name: 'Business' },
    businesses: [{ id: 'b', name: 'Business' }],
    setActiveBusiness: mocks.switch,
  }),
}))
vi.mock('@/features/profile/hooks/use-display-format', () => ({
  useDisplayFormat: () => ({ date: (v: string) => v }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function mount(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.count = { data: 120, error: null }
  mocks.items = [
    {
      id: '1',
      business_id: 'b',
      kind: 'cheque_reminder',
      read_at: null,
      created_at: '2026-10-31T00:00:00Z',
    },
  ]
  mocks.markRead.mockResolvedValue(undefined)
})
afterEach(cleanup)
describe('inbox and header bell', () => {
  it('caps visual badge while exposing the full accessible count', () => {
    mount(<NotificationBell />)
    expect(
      screen.getByRole('link', { name: 'Notifications, 120 unread' }),
    ).toHaveAttribute('href', '/notifications')
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
  it('surfaces count errors instead of a success-shaped zero badge', () => {
    mocks.count.error = new Error('failed')
    mount(<NotificationBell />)
    expect(
      screen.getByRole('link', { name: /unread count unavailable/ }),
    ).toBeInTheDocument()
  })
  it('does not mark items read by opening inbox; explicit click switches business and navigates', async () => {
    mount(<NotificationsPage />)
    expect(mocks.markRead).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: /Cheques need your attention/ }),
    )
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/cheques'))
    expect(mocks.markRead).toHaveBeenCalledWith('1')
    expect(mocks.switch).toHaveBeenCalledWith({ id: 'b', name: 'Business' })
  })
  it('mark all is explicit and action failure prevents navigation', async () => {
    mocks.markRead.mockRejectedValue(new Error('failed'))
    mount(<NotificationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(mocks.markAll).toHaveBeenCalledOnce())
    fireEvent.click(
      screen.getByRole('button', { name: /Cheques need your attention/ }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not complete',
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('shows an entity-specific no-match state', () => {
    mocks.items = []
    mount(<NotificationsPage />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'No notifications match',
    )
  })
})
