import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getErrorReference, logger, subscribeErrorReferences } from './logger'

const mocks = vi.hoisted(() => ({
  config: { enabled: true, dsn: 'test' },
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  captureException: vi.fn(() => 'sentry-error-id'),
  captureMessage: vi.fn(() => 'sentry-message-id'),
}))
vi.mock('pino', () => ({ default: () => mocks }))
vi.mock('@sentry/nextjs', () => ({
  ...mocks,
  getIsolationScope: () => ({
    getScopeData: () => ({ tags: { business_id: 'b1' } }),
  }),
}))
vi.mock('@/lib/env/client', () => ({
  publicEnv: { NEXT_PUBLIC_LOG_LEVEL: 'debug' },
}))
vi.mock('@/lib/monitoring/config', () => ({ monitoringConfig: mocks.config }))
vi.mock('@/lib/monitoring/browser', () => ({
  getDiagnosticId: () => 'diagnostic-id',
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.enabled = true
})

describe('structured logger', () => {
  it.each(['debug', 'info', 'warn'] as const)(
    'scrubs %s messages and allowlists context',
    (level) => {
      logger[level]('Contact person@example.com account 123456', {
        business_id: 'b2',
        amount: 999,
      })
      logger[level]('Plain message')
      expect(mocks[level]).toHaveBeenCalledTimes(2)
      const [context, message] = mocks[level].mock.calls[0]
      expect(context).toEqual({
        business_id: 'b2',
        diagnostic_session_id: 'diagnostic-id',
      })
      expect(message).not.toMatch(/person@|123456/)
      expect(mocks[level].mock.calls[1][0]).toEqual({
        business_id: 'b1',
        diagnostic_session_id: 'diagnostic-id',
      })
    },
  )

  it('captures each Error once and notifies reference subscribers', () => {
    const failure = new Error('private message')
    const listener = vi.fn()
    const unsubscribe = subscribeErrorReferences(listener)
    expect(getErrorReference(failure)).toBeUndefined()
    expect(logger.error('Unable to save', failure)).toBe('sentry-error-id')
    expect(logger.error('Same error', failure)).toBe('sentry-error-id')
    expect(getErrorReference(failure)).toBe('sentry-error-id')
    expect(mocks.captureException).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
    expect(mocks.error.mock.calls[0][0].error).not.toHaveProperty('message')
    unsubscribe()
    logger.error('Another', new Error('other'))
    expect(listener).toHaveBeenCalledOnce()
  })

  it('captures fatal errors at fatal level and non-Error failures as messages', () => {
    logger.fatal('Fatal failure', new Error('failure'))
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'fatal' }),
    )
    expect(logger.error('Failed without Error', 'unexpected')).toBe(
      'sentry-message-id',
    )
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'Failed without Error',
      expect.objectContaining({ level: 'error' }),
    )
    expect(getErrorReference()).toBeUndefined()
  })

  it('keeps a local diagnostic reference when remote monitoring is disabled', () => {
    mocks.config.enabled = false
    const failure = new Error('offline')
    expect(logger.error('Offline', failure)).toBe('diagnostic-id')
    expect(getErrorReference(failure)).toBe('diagnostic-id')
    expect(mocks.captureException).not.toHaveBeenCalled()
  })
})
