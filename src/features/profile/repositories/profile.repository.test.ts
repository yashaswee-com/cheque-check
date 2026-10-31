import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types'
import {
  SupabaseProfileRepository,
  toProfileUpdate,
} from './profile.repository'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: mocks, from: mocks.from }),
}))

const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}
beforeEach(() => {
  mocks.from.mockReturnValue(query)
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'u1',
        email: 'example@example.com',
        user_metadata: { name: 'Asha' },
      },
    },
  })
  mocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  query.maybeSingle.mockReset()
  query.single.mockReset()
})

describe('profile persistence', () => {
  it('creates a missing phone-only profile without inventing an email or display name', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    query.single.mockResolvedValueOnce({ data: { id: 'p1' }, error: null })
    await expect(new SupabaseProfileRepository().get()).resolves.toEqual({
      id: 'p1',
    })
    expect(query.insert).toHaveBeenCalledWith([
      { user_id: 'u1', email: null, name: '' },
    ])
  })
  it('does not query or update an anonymous profile', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(new SupabaseProfileRepository().get()).resolves.toBeNull()
    await expect(
      new SupabaseProfileRepository().update({ name: 'A' }),
    ).rejects.toThrow('Not authenticated')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('loads an active profile without recreating it', async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: { id: 'p1', name: 'Asha' },
      error: null,
    })
    await expect(new SupabaseProfileRepository().get()).resolves.toEqual({
      id: 'p1',
      name: 'Asha',
    })
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(query.is).toHaveBeenCalledWith('deleted_at', null)
    expect(query.insert).not.toHaveBeenCalled()
  })

  it('never recreates a deactivated profile', async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'deactivated' }, error: null })
    await expect(new SupabaseProfileRepository().get()).resolves.toBeNull()
    expect(query.insert).not.toHaveBeenCalled()
  })

  it('creates a missing profile from the authenticated identity', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    query.single.mockResolvedValueOnce({ data: { id: 'p1' }, error: null })
    await expect(new SupabaseProfileRepository().get()).resolves.toEqual({
      id: 'p1',
    })
    expect(query.insert).toHaveBeenCalledWith([
      { user_id: 'u1', email: 'example@example.com', name: 'Asha' },
    ])
  })

  it('strips protected fields and scopes updates to the authenticated user', async () => {
    query.single.mockResolvedValueOnce({
      data: { id: 'p1', name: 'Updated' },
      error: null,
    })
    await new SupabaseProfileRepository().update({
      id: 'forbidden',
      user_id: 'other',
      name: 'Updated',
    })
    expect(query.update).toHaveBeenCalledWith({ name: 'Updated' })
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('does not sign out if the deactivation endpoint rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(new SupabaseProfileRepository().delete()).rejects.toThrow(
      'Unable to deactivate',
    )
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('signs out even if the deactivation response cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid JSON')
        },
      }),
    )
    await expect(new SupabaseProfileRepository().delete()).rejects.toThrow(
      'cleanup status is unknown',
    )
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('reports local session cleanup failures after deactivation', async () => {
    mocks.signOut.mockResolvedValueOnce({
      error: new Error('session unavailable'),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, providerCleanup: true }),
      }),
    )
    await expect(new SupabaseProfileRepository().delete()).rejects.toThrow(
      'local sign-out failed',
    )
  })
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
