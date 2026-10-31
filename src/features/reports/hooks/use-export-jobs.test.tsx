import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useExportJobs } from './use-export-jobs'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../services/export-job.service', () => ({ exportJobService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { received_cheques_enabled: false } }),
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
})
