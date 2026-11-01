import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { useReportCheques } from './use-report-cheques'

const mocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  getSummary: vi.fn(),
  getAll: vi.fn(),
}))
vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: mocks,
}))
let includeInward = false
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      time_zone: 'Asia/Kolkata',
      received_cheques_enabled: includeInward,
    },
  }),
}))
const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  includeInward = false
  mocks.getPage.mockResolvedValue({
    rows: [{ id: 'preview' }],
    matchingCount: 10000,
    activeCount: 10000,
  })
  mocks.getSummary.mockResolvedValue([
    {
      status: 'Issued',
      type: 'Outward',
      cheque_count: 6000,
      total_amount: 12000,
    },
    {
      status: 'Received',
      type: 'Inward',
      cheque_count: 3000,
      total_amount: 1000,
    },
    {
      status: 'Cleared',
      type: 'Outward',
      cheque_count: 1000,
      total_amount: 9000,
    },
  ])
  mocks.getAll.mockResolvedValue([
    { id: 'outward', type: 'Outward' },
    { id: 'inward', type: 'Inward' },
  ])
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe('bounded report reads and on-demand export', () => {
  it('loads at most ten preview rows and exact aggregates, not the complete history', async () => {
    const { result } = renderHook(() => useReportCheques('b1'), {
      wrapper: setup(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.totalCount).toBe(10000)
    expect(result.current.outstanding).toBe(11000)
    expect(mocks.getPage).toHaveBeenCalledWith({
      businessId: 'b1',
      includeInward: false,
      limit: 10,
      sortBy: 'date',
      sortOrder: 'desc',
    })
    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(await result.current.loadExportCheques()).toEqual([
      { id: 'outward', type: 'Outward' },
    ])
    expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith('b1')
  })
  it('fetches fresh history for every export and preserves the inward preference', async () => {
    includeInward = true
    const { result } = renderHook(() => useReportCheques('b1'), {
      wrapper: setup(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(await result.current.loadExportCheques()).toHaveLength(2)
    mocks.getAll.mockResolvedValueOnce([{ id: 'new', type: 'Outward' }])
    expect(await result.current.loadExportCheques()).toEqual([
      { id: 'new', type: 'Outward' },
    ])
    expect(mocks.getAll).toHaveBeenCalledTimes(2)
  })
  it('does not read without a business and rejects an export without a scope', async () => {
    const { result } = renderHook(() => useReportCheques(undefined), {
      wrapper: setup(),
    })
    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(mocks.getSummary).not.toHaveBeenCalled()
    await expect(result.current.loadExportCheques()).rejects.toThrow(
      'Select a business',
    )
    expect(mocks.getAll).not.toHaveBeenCalled()
  })
  it('exposes read failures and propagates export-read failures rather than exporting stale previews', async () => {
    const log = vi
      .spyOn(logger, 'error')
      .mockImplementationOnce(() => 'test-reference')
    const error = new Error('Preview unavailable')
    mocks.getPage.mockRejectedValue(error)
    const { result } = renderHook(() => useReportCheques('b1'), {
      wrapper: setup(),
    })
    await waitFor(() =>
      expect(result.current.error?.message).toBe('Preview unavailable'),
    )
    mocks.getAll.mockRejectedValueOnce(new Error('Export read failed'))
    await expect(result.current.loadExportCheques()).rejects.toThrow(
      'Export read failed',
    )
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Report data could not be loaded',
      error,
    )
  })
})
