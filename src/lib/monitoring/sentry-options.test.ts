import { describe, expect, it, vi } from 'vitest'
import { sentryOptions } from './sentry-options'

const config = vi.hoisted(() => ({
  enabled: true,
  dsn: 'https://example@sentry.example/1',
  environment: 'qa',
  release: 'synthetic-release',
  tracesSampleRate: 0.1,
  deploymentKind: 'qa',
}))
vi.mock('./config', () => ({ monitoringConfig: config }))

describe('Sentry options', () => {
  it('keeps sensitive automatic integrations and private storage out of monitoring', () => {
    const options = sentryOptions('browser')
    expect(options.enabled).toBe(true)
    expect(options.sendDefaultPii).toBe(false)
    expect(options.enableLogs).toBe(false)
    const integrations = [
      'OpenAI',
      'Anthropic',
      'GoogleGenAI',
      'VercelAI',
      'LocalVariables',
      'Console',
      'Http',
    ].map((name) => ({ name }))
    expect(options.integrations(integrations)).toEqual([{ name: 'Http' }])
    expect(
      options.tracePropagationTargets.some((pattern) =>
        pattern.test('/api/ocr/cheque'),
      ),
    ).toBe(true)
    expect(
      options.tracePropagationTargets.some((pattern) =>
        pattern.test('/api/storage/private-avatars/x'),
      ),
    ).toBe(false)
    expect(options.initialScope.tags).toEqual({
      runtime: 'browser',
      deployment_kind: 'qa',
    })
    const originApi = `${window.location.origin}/api/example`
    expect(
      options.tracePropagationTargets.some((pattern) =>
        pattern.test(originApi),
      ),
    ).toBe(true)
  })

  it('omits browser-origin targets for server runtimes', () => {
    expect(sentryOptions('nodejs').tracePropagationTargets).toHaveLength(1)
  })

  it('drops expected errors and sanitizes events, transactions and spans', () => {
    const options = sentryOptions('browser')
    const expected = Object.assign(new Error('invalid input'), {
      name: 'ValidationError',
    })
    expect(
      options.beforeSend({ type: undefined }, { originalException: expected }),
    ).toBeNull()
    expect(
      options.beforeSend({ type: undefined, message: 'person@example.com' }, {})
        ?.message,
    ).not.toContain('person@example.com')
    expect(
      options.beforeSendTransaction({
        type: 'transaction',
        transaction: '/cheques/123?token=private',
      }).transaction,
    ).toBe('/cheques/[id]')
    const span = options.beforeSendSpan({
      span_id: 'span',
      trace_id: 'trace',
      start_timestamp: 1,
      timestamp: 2,
      op: 'http.client',
      description: 'private payload',
      data: { operation: 'cheque.create', amount: 500 },
    })
    expect(span.description).toBe('http.client')
    expect(span.data).toEqual({ operation: 'cheque.create' })
    expect(
      options.beforeBreadcrumb({ category: 'console', message: 'private' }),
    ).toBeNull()
  })
})
