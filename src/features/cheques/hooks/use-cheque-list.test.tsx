import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChequeList, useChequeSearch } from './use-cheque-list'
import { useDashboardCheques } from './use-dashboard-cheques'

const mocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  getSummary: vi.fn(),
  updateStatus: vi.fn(),
}))
vi.mock('../services/cheque.service', () => ({ chequeService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { time_zone: 'Asia/Kolkata', received_cheques_enabled: false },
  }),
}))
const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getPage.mockResolvedValue({
    rows: [],
    matchingCount: 10000,
    activeCount: 10000,
  })
  mocks.getSummary.mockResolvedValue([
    {
      status: 'Issued',
      type: 'Outward',
      cheque_count: 10000,
      total_amount: 15000,
      today_count: 101,
      upcoming_count: 100,
      overdue_count: 50,
    },
    {
      status: 'Received',
      type: 'Inward',
      cheque_count: 5,
      total_amount: 1000,
      today_count: 2,
      upcoming_count: 1,
      overdue_count: 2,
    },
    {
      status: 'Cleared',
      type: 'Outward',
      cheque_count: 2,
      total_amount: 250,
      today_count: 0,
      upcoming_count: 0,
      overdue_count: 0,
    },
  ])
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
})

describe('bounded cheque hooks', () => {
  it('requests only one page and resets pagination when filters or business change', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ business }) => useChequeList(business, { from: '2026-10-01' }),
      {
        wrapper,
        initialProps: { business: 'b1' },
      },
    )
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    expect(mocks.getPage).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'b1',
        limit: 50,
        offset: 0,
        includeInward: false,
        nativeFilters: { from: '2026-10-01' },
      }),
    )
    act(() => result.current.nextPage())
    await waitFor(() =>
      expect(mocks.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 50 }),
      ),
    )
    act(() => result.current.previousPage())
    await waitFor(() =>
      expect(mocks.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 0 }),
      ),
    )
    act(() => result.current.previousPage())
    expect(result.current.pageIndex).toBe(0)
    act(() => result.current.setFilter('Cleared'))
    await waitFor(() =>
      expect(mocks.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 0, status: 'Cleared' }),
      ),
    )
    act(() => result.current.updateStatus('cheque-1', 'Cleared'))
    await waitFor(() =>
      expect(mocks.updateStatus).toHaveBeenCalledWith('cheque-1', 'Cleared'),
    )
    rerender({ business: 'b2' })
    await waitFor(() =>
      expect(mocks.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ businessId: 'b2', offset: 0 }),
      ),
    )
  })
  it('does not fetch for a missing business and exposes database failures', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ business }) => useChequeList(business, {}),
      {
        wrapper,
        initialProps: { business: undefined as string | undefined },
      },
    )
    expect(mocks.getPage).not.toHaveBeenCalled()
    mocks.getPage.mockRejectedValue(new Error('database unavailable'))
    rerender({ business: 'b1' })
    await waitFor(() =>
      expect(result.current.error?.message).toBe('database unavailable'),
    )
  })
  it('debounces bounded global search rather than loading every cheque', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ search }) => useChequeSearch('b1', search),
      { wrapper, initialProps: { search: '' } },
    )
    expect(mocks.getPage).not.toHaveBeenCalled()
    rerender({ search: 'Supplier' })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() =>
      expect(mocks.getPage).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Supplier', limit: 5 }),
      ),
    )

    const unscoped = renderHook(() => useChequeSearch(undefined, 'Supplier'), {
      wrapper,
    })
    expect(unscoped.result.current.isLoading).toBe(false)
  })
  it('uses exact aggregates and a bounded today list for the dashboard', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useDashboardCheques('b1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.currentBalance).toBe(-14000)
    expect(result.current.todayCount).toBe(103)
    expect(result.current.upcomingCount).toBe(101)
    expect(result.current.overdueCount).toBe(52)
    expect(result.current.hasMoreToday).toBe(true)
    expect(mocks.getPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, includeInward: false }),
    )
    act(() => result.current.updateStatus('cheque-1', 'Cleared'))
    await waitFor(() =>
      expect(mocks.updateStatus).toHaveBeenCalledWith('cheque-1', 'Cleared'),
    )
  })

  it('keeps dashboard queries disabled without a business id', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useDashboardCheques(undefined), {
      wrapper,
    })

    expect(result.current.todayCheques).toEqual([])
    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(mocks.getSummary).not.toHaveBeenCalled()
  })
})
