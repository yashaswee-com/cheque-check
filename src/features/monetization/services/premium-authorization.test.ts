import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyLifetimePremium } from './premium-authorization'

const mocks = vi.hoisted(() => ({
  getEntitlements: vi.fn(),
}))

vi.mock('./monetization.service', () => ({
  monetizationService: { getEntitlements: mocks.getEntitlements },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('verifyLifetimePremium', () => {
  it('returns false when the user has no lifetime entitlement', async () => {
    mocks.getEntitlements.mockResolvedValue([])

    await expect(verifyLifetimePremium()).resolves.toBe(false)
  })

  it('grants access for a current active lifetime entitlement', async () => {
    mocks.getEntitlements.mockResolvedValue([
      {
        id: 'ent-1',
        user_id: 'user-1',
        feature_id: 'lifetime_premium',
        status: 'active',
        valid_until: null,
      },
    ])

    await expect(verifyLifetimePremium()).resolves.toBe(true)
  })

  it('denies access to expired or inactive lifetime entitlements', async () => {
    for (const entitlement of [
      {
        id: 'ent-1',
        user_id: 'user-1',
        feature_id: 'lifetime_premium',
        status: 'active',
        valid_until: '2026-10-30T23:59:59.000Z',
      },
      {
        id: 'ent-2',
        user_id: 'user-1',
        feature_id: 'lifetime_premium',
        status: 'paused',
        valid_until: null,
      },
    ]) {
      mocks.getEntitlements.mockResolvedValueOnce([entitlement])
      await expect(verifyLifetimePremium()).resolves.toBe(false)
    }
  })

  it('propagates entitlement lookup failures', async () => {
    const error = new Error('entitlements unavailable')
    mocks.getEntitlements.mockRejectedValue(error)

    await expect(verifyLifetimePremium()).rejects.toBe(error)
  })
})
