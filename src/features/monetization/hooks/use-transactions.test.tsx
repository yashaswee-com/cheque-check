import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../services/monetization.service'
import { useTransactions } from './use-transactions'

const mocks = vi.hoisted(() => ({ getTransactions: vi.fn() }))
vi.mock('../services/monetization.service', () => ({
  monetizationService: mocks,
}))

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return renderHook(() => useTransactions(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function transaction(status: Transaction['status']): Transaction {
  return {
    id: 'transaction-1',
    user_id: 'user-1',
    razorpay_order_id: 'order-1',
    razorpay_payment_id: null,
    amount: 19900,
    currency: 'INR',
    status,
    type: 'lifetime',
    feature_id: 'lifetime_premium',
    created_at: '2026-10-31T00:00:00Z',
    updated_at: '2026-10-31T00:00:00Z',
  }
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.useRealTimers()
})

describe('useTransactions', () => {
  it('starts empty while loading and exposes fetched history', async () => {
    const history = [transaction('captured')]
    mocks.getTransactions.mockResolvedValue(history)
    const { result } = setup()
    expect(result.current.transactions).toEqual([])
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.transactions).toEqual(history))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('exposes lookup failures and supports a successful manual retry', async () => {
    const error = new Error('History unavailable')
    mocks.getTransactions.mockRejectedValue(error)
    const { result } = setup()
    await waitFor(() => expect(result.current.error).toBe(error))
    mocks.getTransactions.mockResolvedValue([transaction('captured')])
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.transactions).toEqual([transaction('captured')])
  })

  it.each(['created', 'authorized'] as const)(
    'polls %s orders and stops after payment is captured',
    async (status) => {
      vi.useFakeTimers()
      mocks.getTransactions
        .mockResolvedValueOnce([transaction(status)])
        .mockResolvedValue([transaction('captured')])
      const { result } = setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(result.current.transactions[0].status).toBe(status)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_010)
      })
      expect(result.current.transactions[0].status).toBe('captured')
      expect(mocks.getTransactions).toHaveBeenCalledTimes(2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mocks.getTransactions).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['captured', 'refunded', 'failed'] as const)(
    'does not poll terminal %s payments',
    async (status) => {
      vi.useFakeTimers()
      mocks.getTransactions.mockResolvedValue([transaction(status)])
      setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(mocks.getTransactions).toHaveBeenCalledOnce()
    },
  )
})
