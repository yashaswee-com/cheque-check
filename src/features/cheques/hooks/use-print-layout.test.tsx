import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrintLayout } from './use-print-layout'

const getPrintLayout = vi.hoisted(() => vi.fn())

vi.mock('@/features/premium-workspace/services/workspace.service', () => ({
  getPrintLayout,
}))

afterEach(cleanup)

describe('usePrintLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getPrintLayout.mockResolvedValue({ template: 'classic', fields: [] })
  })

  it('loads the saved print layout for the selected account', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => usePrintLayout('account-1'), {
      wrapper,
    })

    await waitFor(() =>
      expect(result.current.data).toEqual({ template: 'classic', fields: [] }),
    )
    expect(getPrintLayout).toHaveBeenCalledWith('account-1')
  })

  it('exposes layout retrieval errors', async () => {
    getPrintLayout.mockRejectedValueOnce(new Error('Layout unavailable'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => usePrintLayout('account-2'), {
      wrapper,
    })

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Layout unavailable'),
    )
  })
})
