import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types'
import {
  SupabaseProfileRepository,
  toProfileUpdate,
} from './profile.repository'

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('toProfileUpdate', () => {
  it('strips lifecycle and identity columns', () => {
    const update = toProfileUpdate({
      name: 'A',
      id: 'x',
      user_id: 'u',
      deleted_at: '2026-01-01',
      deletion_batch_id: 'b',
    } as Partial<Profile>)
    expect(update).toEqual({ name: 'A' })
  })

  it('accepts valid closed choices', () => {
    expect(toProfileUpdate({ time_format: '24h', language: 'hi' })).toEqual({
      time_format: '24h',
      language: 'hi',
    })
  })

  it('rejects values outside the closed enums', () => {
    expect(() => toProfileUpdate({ language: 'fr' })).toThrow()
    expect(() => toProfileUpdate({ currency: 'XYZ' })).toThrow()
  })

  it('returns incomplete provider cleanup after deactivation and signs out locally', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, providerCleanup: false }),
      }),
    )

    await expect(new SupabaseProfileRepository().delete()).resolves.toEqual({
      providerCleanup: false,
    })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('signs out locally and does not treat a missing cleanup status as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    )

    await expect(new SupabaseProfileRepository().delete()).rejects.toThrow(
      'cleanup status is unknown',
    )
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
