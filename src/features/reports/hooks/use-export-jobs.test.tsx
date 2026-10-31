import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useExportJobs } from './use-export-jobs'
import type { ExportJob } from '../repositories/export-job.repository'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
  error: vi.fn(),
  receivedChequesEnabled: false,
}))
vi.mock('../services/export-job.service', () => ({ exportJobService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { received_cheques_enabled: mocks.receivedChequesEnabled },
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))
const clients: QueryClient[] = []
function wrapper() {
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
  mocks.receivedChequesEnabled = false
  mocks.list.mockResolvedValue([])
  mocks.request.mockResolvedValue(undefined)
  mocks.cancel.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
})
describe('persistent export job hook', () => {
  it('bounds reads to the active business and forwards the inward preference', async () => {
    const { result } = renderHook(() => useExportJobs('business'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => result.current.request('csv'))
    expect(mocks.request).toHaveBeenCalledWith(
      expect.any(String),
      'business',
      'csv',
      false,
    )
    expect(mocks.list).toHaveBeenCalledWith('business')
    expect(mocks.list.mock.calls.length).toBeGreaterThan(1)
  })
  it('reuses the idempotency key after a lost response and invalidates jobs after cancellation', async () => {
    mocks.request.mockRejectedValueOnce(new Error('Response lost'))
    const { result } = renderHook(() => useExportJobs('business'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await expect(result.current.request('json')).rejects.toThrow(
      'Response lost',
    )
    await act(async () => result.current.request('json'))
    expect(mocks.request.mock.calls[0][0]).toBe(mocks.request.mock.calls[1][0])
    await act(async () => result.current.cancel('job'))
    expect(mocks.cancel).toHaveBeenCalledWith('job')
  })
  it('creates new idempotency keys when the request scope changes', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockRejectedValueOnce(new Error('Response lost'))
    const { result, rerender } = renderHook(
      ({ businessId }) => useExportJobs(businessId),
      { wrapper: wrapper(), initialProps: { businessId: 'business-1' } },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(result.current.request('csv')).rejects.toThrow('Response lost')
    const firstId = mocks.request.mock.calls[0][0]
    await expect(result.current.request('json')).rejects.toThrow(
      'Response lost',
    )
    const formatId = mocks.request.mock.calls[1][0]
    expect(formatId).not.toBe(firstId)

    rerender({ businessId: 'business-2' })
    await expect(result.current.request('json')).rejects.toThrow(
      'Response lost',
    )
    const businessId = mocks.request.mock.calls[2][0]
    expect(businessId).not.toBe(formatId)

    mocks.receivedChequesEnabled = true
    rerender({ businessId: 'business-2' })
    await act(async () => result.current.request('json'))
    expect(mocks.request.mock.calls[3][0]).not.toBe(businessId)
    expect(mocks.request.mock.calls[3][3]).toBe(true)
  })
  it('does not read without a business and explicitly rejects an unscoped request', async () => {
    const { result } = renderHook(() => useExportJobs(undefined), {
      wrapper: wrapper(),
    })
    expect(mocks.list).not.toHaveBeenCalled()
    await expect(result.current.request('csv')).rejects.toThrow(
      'Select a business',
    )
  })
  it('exposes and logs list failures instead of showing successful empty history', async () => {
    mocks.list.mockRejectedValue(new Error('Unavailable'))
    const { result } = renderHook(() => useExportJobs('business'), {
      wrapper: wrapper(),
    })
    await waitFor(() =>
      expect(result.current.error?.message).toBe('Unavailable'),
    )
    expect(mocks.error).toHaveBeenCalled()
  })
  it('marks jobs that have reached their expiry as expired', async () => {
    const expiredJob: ExportJob = {
      id: 'expired-job',
      format: 'csv',
      status: 'ready',
      row_count: 2,
      next_part: 1,
      part_count: 1,
      created_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2020-01-02T00:00:00.000Z',
      error_code: null,
    }
    mocks.list.mockResolvedValue([expiredJob])
    const { result } = renderHook(() => useExportJobs('business'), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.data?.[0].status).toBe('expired'))
  })
  it.each(['queued', 'processing'] as const)(
    'polls active %s jobs at the short interval',
    async (status) => {
      vi.useFakeTimers()
      try {
        const activeJob: ExportJob = {
          id: 'job-1',
          format: 'csv',
          status,
          row_count: 0,
          next_part: 1,
          part_count: 1,
          created_at: '2026-10-01T00:00:00.000Z',
          expires_at: '2027-10-02T00:00:00.000Z',
          error_code: null,
        }
        mocks.list.mockResolvedValue([activeJob])
        const { result } = renderHook(() => useExportJobs('business'), {
          wrapper: wrapper(),
        })
        await act(async () => {
          await result.current.refetch()
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(result.current.data).toHaveLength(1)
        expect(mocks.list).toHaveBeenCalledOnce()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        expect(mocks.list).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('polls completed jobs at the long interval', async () => {
    vi.useFakeTimers()
    try {
      const completedJob: ExportJob = {
        id: 'job-1',
        format: 'csv',
        status: 'ready',
        row_count: 0,
        next_part: 1,
        part_count: 1,
        created_at: '2026-10-01T00:00:00.000Z',
        expires_at: '2027-10-02T00:00:00.000Z',
        error_code: null,
      }
      mocks.list.mockResolvedValue([completedJob])
      const { result } = renderHook(() => useExportJobs('business'), {
        wrapper: wrapper(),
      })
      await act(async () => {
        await result.current.refetch()
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mocks.list).toHaveBeenCalledOnce()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(mocks.list).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25000)
      })
      expect(mocks.list).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
