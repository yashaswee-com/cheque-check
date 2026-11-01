import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInbox, useUnreadCount } from './use-inbox'

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  list: vi.fn(),
  markRead: vi.fn(),
  markAll: vi.fn(),
}))
vi.mock('../services/inbox.service', () => ({ inboxService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { user_id: 'user' } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
let client: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.count.mockResolvedValue(3)
  mocks.list.mockResolvedValue({
    items: [],
    snapshot: '100',
    next_cursor: null,
  })
  mocks.markAll.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})
describe('inbox query lifecycle', () => {
  it('does not fetch unread count while hidden and resumes on visibility', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    const hook = renderHook(() => useUnreadCount(), { wrapper })
    expect(mocks.count).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(hook.result.current.data).toBe(3))
  })
  it('marks the server captured snapshot within the selected business scope', async () => {
    const hook = renderHook(
      () => useInbox({ businessId: 'business', unread: true }),
      { wrapper },
    )
    await waitFor(() => expect(hook.result.current.data?.snapshot).toBe('100'))
    await act(() => hook.result.current.markAll())
    expect(mocks.markAll).toHaveBeenCalledWith('100', 'business')
    expect(mocks.list).toHaveBeenCalledWith({
      businessId: 'business',
      unread: true,
    })
  })
  it('propagates failed read mutations without optimistic success', async () => {
    mocks.markRead.mockRejectedValueOnce(new Error('failed'))
    const hook = renderHook(() => useInbox({}), { wrapper })
    await expect(hook.result.current.markRead('5')).rejects.toThrow('failed')
  })
})
