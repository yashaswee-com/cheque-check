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
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    })
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

  it('drops expected errors and sanitizes events and streamed spans', () => {
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
    const span = options.beforeSendSpan({
      span_id: 'span',
      trace_id: 'trace',
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'ok',
      is_segment: false,
      name: 'private payload',
      attributes: {
        'sentry.op': 'http.client',
        operation: 'cheque.create',
        amount: 500,
      },
    })
    expect(span.name).toBe('http.client')
    expect(span.attributes).toEqual({
      'sentry.op': 'http.client',
      operation: 'cheque.create',
    })
    expect(
      options.beforeBreadcrumb({ category: 'console', message: 'private' }),
    ).toBeNull()
  })
})
