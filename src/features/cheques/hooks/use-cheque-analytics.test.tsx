import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useChequeAnalytics } from './use-cheque-analytics'
const mocks = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ series: [] }),
}))
vi.mock('../services/analytics.service', () => ({ analyticsService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { time_zone: 'Asia/Kolkata', received_cheques_enabled: false },
  }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('uses a bounded aggregate request, scopes caches, and suppresses missing-business reads', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  try {
    const { result, rerender } = renderHook(
      ({ businessId }) =>
        useChequeAnalytics(businessId, { from: '2026-01-01' }, 'Outward', 50),
      {
        wrapper,
        initialProps: { businessId: undefined as string | undefined },
      },
    )
    expect(mocks.get).not.toHaveBeenCalled()
    rerender({ businessId: 'business' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.get).toHaveBeenLastCalledWith(
      expect.objectContaining({
        businessId: 'business',
        from: '2026-01-01',
        direction: 'Outward',
        offset: 50,
        includeInward: false,
      }),
    )
    mocks.get.mockRejectedValueOnce(new Error('Unavailable'))
    rerender({ businessId: 'other' })
    await waitFor(() =>
      expect(result.current.error?.message).toBe('Unavailable'),
    )
  } finally {
    client.clear()
  }
})
