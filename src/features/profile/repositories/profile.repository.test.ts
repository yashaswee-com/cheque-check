import { describe, expect, it } from 'vitest'
import type { Profile } from '@/types'
import { toProfileUpdate } from './profile.repository'

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
})
