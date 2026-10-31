import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlement } from '../repositories/monetization.repository'
import { useEntitlements } from './use-entitlements'

const mocks = vi.hoisted(() => ({ getEntitlements: vi.fn() }))
vi.mock('../services/monetization.service', () => ({
  monetizationService: mocks,
}))

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return renderHook(() => useEntitlements(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function entitlement(
  status: Entitlement['status'],
  validUntil: string | null,
): Entitlement {
  return {
    id: 'entitlement-1',
    user_id: 'user-1',
    feature_id: 'lifetime_premium',
    status,
    valid_until: validUntil,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T00:00:00Z'))
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.useRealTimers()
})

describe('useEntitlements polling', () => {
  it.each(['active', 'trialing'] as const)(
    'refetches a finite %s grant immediately after expiration',
    async (status) => {
      mocks.getEntitlements.mockResolvedValue([
        entitlement(status, '2026-10-31T00:00:01Z'),
      ])
      setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(mocks.getEntitlements).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
      expect(mocks.getEntitlements).toHaveBeenCalledTimes(2)
    },
  )

  it.each([
    entitlement('active', null),
    entitlement('active', '2026-10-30T00:00:00Z'),
    entitlement('paused', '2026-10-31T00:00:01Z'),
    entitlement('canceled', '2026-10-31T00:00:01Z'),
  ])(
    'uses the normal polling interval for $status grants with $valid_until',
    async (entry) => {
      mocks.getEntitlements.mockResolvedValue([entry])
      setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(59_999)
      })
      expect(mocks.getEntitlements).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(mocks.getEntitlements).toHaveBeenCalledTimes(2)
    },
  )

  it('uses the earliest expiration when several grants are present', async () => {
    mocks.getEntitlements.mockResolvedValue([
      entitlement('active', '2026-10-31T00:00:30Z'),
      {
        ...entitlement('trialing', '2026-10-31T00:00:02Z'),
        id: 'entitlement-2',
      },
    ])
    setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_020)
    })
    expect(mocks.getEntitlements).toHaveBeenCalledTimes(2)
  })
})
