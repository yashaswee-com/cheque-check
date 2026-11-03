import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PREMIUM_AVATAR_RING_CLASS,
  usePremiumAvatarRing,
} from './use-premium-avatar-ring'

const access = vi.hoisted(() => ({ hasAccess: false }))
vi.mock('./use-premium-access', () => ({
  usePremiumAccess: () => access,
}))

beforeEach(() => {
  access.hasAccess = false
})

describe('usePremiumAvatarRing', () => {
  it('returns the gold ring for any active premium, including trials', () => {
    access.hasAccess = true
    const { result } = renderHook(() => usePremiumAvatarRing())
    expect(result.current).toBe(PREMIUM_AVATAR_RING_CLASS)
    expect(PREMIUM_AVATAR_RING_CLASS).toContain('ring-[#D4AF37]')
  })

  it('returns nothing without premium access', () => {
    const { result } = renderHook(() => usePremiumAvatarRing())
    expect(result.current).toBeUndefined()
  })
})
