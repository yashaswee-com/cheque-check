import { describe, expect, it } from 'vitest'
import {
  AppError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  PlanLimitError,
  ValidationError,
  mapSupabaseError,
} from './errors'

describe('mapSupabaseError', () => {
  it('does not expose blank messages or mistake unrelated details for missing rows', () => {
    const cause = { message: '  ', details: 'permission denied' }
    const error = mapSupabaseError(cause)
    expect(error).toBeInstanceOf(DatabaseError)
    expect(error.message).toBe('Database request failed')
    expect(error.cause).toBe(cause)
  })
  it('preserves existing application errors', () => {
    const error = new ValidationError('Invalid input')

    expect(mapSupabaseError(error)).toBe(error)
  })

  it('maps known database error codes to typed errors', () => {
    expect(
      mapSupabaseError({ code: '23505', message: 'Duplicate' }),
    ).toBeInstanceOf(ConflictError)
    expect(
      mapSupabaseError({ code: 'PGRST116', message: 'Missing' }),
    ).toBeInstanceOf(NotFoundError)
    expect(
      mapSupabaseError({ code: '42501', message: 'Denied' }),
    ).toBeInstanceOf(ValidationError)
    const limit = mapSupabaseError({
      code: '53400',
      message: 'Free plan limit of 50 active cheques reached',
    })
    expect(limit).toBeInstanceOf(PlanLimitError)
    expect(limit.code).toBe('PLAN_LIMIT')
    expect(limit.message).toBe('Free plan limit of 50 active cheques reached')
  })

  it('maps unknown values to DatabaseError', () => {
    const error = mapSupabaseError('unexpected')

    expect(error).toBeInstanceOf(DatabaseError)
    expect(error).toBeInstanceOf(AppError)
  })
  it('guards malformed error fields without throwing from the error mapper', () => {
    for (const error of [
      null,
      undefined,
      42,
      { code: 42, message: 42, details: 42 },
      { details: { includes: true } },
    ]) {
      expect(mapSupabaseError(error)).toBeInstanceOf(DatabaseError)
    }
    expect(
      mapSupabaseError({ details: 'The result contains 0 rows' }),
    ).toBeInstanceOf(NotFoundError)
  })
})
