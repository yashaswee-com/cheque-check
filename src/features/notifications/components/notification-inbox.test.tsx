import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { NotificationBell } from './notification-bell'
import NotificationsPage from '@/app/(dashboard)/notifications/page'
vi.mock('./push-settings', () => ({ PushSettings: () => null }))

const mocks = vi.hoisted(() => ({
  count: { data: 120, error: null as Error | null },
  markRead: vi.fn(),
  markAll: vi.fn(),
  push: vi.fn(),
  switch: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
  requests: [] as Record<string, unknown>[],
  totalPages: 1,
  isLoading: false,
  error: null as Error | null,
  items: [] as {
    id: string
    business_id: string
    kind: 'cheque_reminder'
    read_at: null
    created_at: string
  }[],
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('../hooks/use-inbox', () => ({
  useUnreadCount: () => mocks.count,
  useInbox: (request: Record<string, unknown>) => {
    mocks.requests.push(request)
    return {
      data: {
        items: mocks.items,
        snapshot: '120',
        total: mocks.items.length,
        page: 0,
        page_size: 50,
      },
      totalPages: mocks.totalPages,
      isFetching: false,
      isLoading: mocks.isLoading,
      error: mocks.error,
      markRead: mocks.markRead,
      markAll: mocks.markAll,
      refetch: mocks.refetch,
    }
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: { id: 'b', name: 'Business' },
    businesses: [
      { id: 'b', name: 'Business' },
      { id: 'c', name: 'Corner Store' },
    ],
    setActiveBusiness: mocks.switch,
  }),
}))
vi.mock('@/features/profile/hooks/use-display-format', () => ({
  useDisplayFormat: () => ({ date: (v: string) => v }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      voice_call_enabled: true,
      sms_enabled: false,
      push_enabled: false,
      whatsapp_enabled: false,
    },
    isLoading: false,
  }),
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
  mocks.requests = []
  mocks.totalPages = 1
  mocks.isLoading = false
  mocks.error = null
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
  mocks.markAll.mockResolvedValue(undefined)
  mocks.refetch.mockResolvedValue({})
})
afterEach(cleanup)
describe('inbox and header bell', () => {
  it('toasts successful mark-all and refresh actions', async () => {
    mount(<NotificationsPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.markAll }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Inbox.markedAllRead,
        type: 'success',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.refresh }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Inbox.refreshed,
        type: 'success',
      }),
    )
    expect(mocks.refetch).toHaveBeenCalledWith({ throwOnError: true })
  })
  it('does not show a success toast when refresh fails', async () => {
    mocks.refetch.mockRejectedValueOnce(new Error('offline'))
    mount(<NotificationsPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.refresh }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Inbox.actionError,
        type: 'error',
      }),
    )
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })
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
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.markAll }),
    )
    await waitFor(() => expect(mocks.markAll).toHaveBeenCalledOnce())
    fireEvent.click(
      screen.getByRole('button', { name: /Cheques need your attention/ }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not complete',
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('shows skeleton cards while the first page loads', () => {
    mocks.isLoading = true
    mount(<NotificationsPage />)
    const loading = screen.getByTestId('inbox-loading')
    expect(loading).toHaveAttribute('role', 'status')
    expect(loading).toHaveAccessibleName(messages.Common.loading)
    expect(screen.queryByTestId('inbox-list')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('notifications-pagination'),
    ).not.toBeInTheDocument()
  })
  it('shows an all-caught-up empty state with no action', () => {
    mocks.items = []
    mount(<NotificationsPage />)
    const empty = screen.getByTestId('inbox-empty')
    expect(empty).toHaveTextContent(messages.Inbox.emptyTitle)
    expect(empty.querySelector('button')).toBeNull()
  })
  it('offers Show all when the unread filter is empty', async () => {
    mocks.items = []
    mount(<NotificationsPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.sortAndFilter }),
    )
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: messages.Inbox.unread })
      ).at(-1)!,
    )
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const empty = screen.getByTestId('inbox-empty-unread')
    expect(empty).toHaveTextContent(messages.Inbox.noUnreadTitle)
    fireEvent.click(
      within(empty).getByRole('button', { name: messages.Inbox.showAll }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({ unread: false })
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument()
  })
  it('shows a no-match state that clears the search', () => {
    vi.useFakeTimers()
    try {
      mocks.items = []
      mount(<NotificationsPage />)
      const search = screen.getByRole('searchbox', {
        name: messages.Inbox.searchPlaceholder,
      })
      fireEvent.change(search, { target: { value: 'zzz' } })
      act(() => vi.advanceTimersByTime(250))
      const empty = screen.getByTestId('inbox-no-match')
      expect(empty).toHaveTextContent(messages.Inbox.noMatchTitle)
      fireEvent.click(
        within(empty).getByRole('button', {
          name: messages.Inbox.clearFilters,
        }),
      )
      expect(search).toHaveValue('')
      act(() => vi.advanceTimersByTime(250))
      expect(mocks.requests.at(-1)?.match).toBeUndefined()
      expect(screen.getByTestId('inbox-empty')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
  it('shows a load error with a retry button', () => {
    mocks.error = new Error('offline')
    mount(<NotificationsPage />)
    const error = screen.getByTestId('inbox-error')
    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveTextContent(messages.Inbox.errorTitle)
    fireEvent.click(
      within(error).getByRole('button', { name: messages.Inbox.retry }),
    )
    expect(mocks.refetch).toHaveBeenCalledOnce()
    expect(
      screen.queryByTestId('notifications-pagination'),
    ).not.toBeInTheDocument()
  })
  it('keeps search, sort & filter, refresh and mark all read in one row', () => {
    mount(<NotificationsPage />)
    const toolbar = screen.getByTestId('inbox-toolbar')
    expect(
      within(toolbar).getByRole('searchbox', {
        name: messages.Inbox.searchPlaceholder,
      }),
    ).toBeInTheDocument()
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      messages.Common.sortAndFilter,
      messages.Inbox.refresh,
      messages.Inbox.markAll,
    ])
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('notifications-page-icon'),
    ).not.toBeInTheDocument()
  })
  it('defaults to the active business, newest first, all read states', () => {
    mount(<NotificationsPage />)
    expect(mocks.requests.at(-1)).toEqual({
      businessId: 'b',
      unread: false,
      ascending: false,
      match: undefined,
      page: 0,
      snapshot: undefined,
    })
  })
  it('switches business, read status and order from the filter sheet', async () => {
    mount(<NotificationsPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.sortAndFilter }),
    )
    const active = await screen.findByRole('button', { name: /^Business/ })
    expect(active).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.allBusinesses }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({ businessId: undefined })
    fireEvent.click(screen.getByRole('button', { name: /Corner Store/ }))
    expect(mocks.requests.at(-1)).toMatchObject({ businessId: 'c' })
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.sortOldest }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({ ascending: true })
    fireEvent.click(
      screen.getAllByRole('button', { name: messages.Inbox.unread }).at(-1)!,
    )
    expect(mocks.requests.at(-1)).toMatchObject({ unread: true })
  })
  it('debounces search into matching event kinds and business names', () => {
    vi.useFakeTimers()
    try {
      mount(<NotificationsPage />)
      fireEvent.change(
        screen.getByRole('searchbox', {
          name: messages.Inbox.searchPlaceholder,
        }),
        { target: { value: 'export' } },
      )
      expect(mocks.requests.at(-1)?.match).toBeUndefined()
      act(() => vi.advanceTimersByTime(250))
      expect(mocks.requests.at(-1)?.match).toEqual({
        kinds: ['export_ready', 'export_failed'],
        businessIds: [],
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it('pages with sticky page / total pagination pinned to the first snapshot, resetting on filter changes', async () => {
    mocks.totalPages = 3
    mount(<NotificationsPage />)
    expect(
      screen.getByTestId('notifications-pagination-status'),
    ).toHaveTextContent('1 / 3')
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({ page: 1, snapshot: '120' })
    expect(
      screen.getByTestId('notifications-pagination-status'),
    ).toHaveTextContent('2 / 3')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.sortAndFilter }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: messages.Inbox.sortOldest }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({
      ascending: true,
      page: 0,
      snapshot: undefined,
    })
  })
  it('refresh returns to the first page and refetches', () => {
    mocks.totalPages = 3
    mount(<NotificationsPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Inbox.refresh }),
    )
    expect(mocks.requests.at(-1)).toMatchObject({
      page: 0,
      snapshot: undefined,
    })
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
